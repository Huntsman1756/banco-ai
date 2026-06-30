import { describe, expect, it } from "vitest";
import { LlmRateLimitError, LlmRateLimiter } from "../src/infrastructure/llm/rate-limiter";

describe("LlmRateLimiter", () => {
  it("queues requests beyond the concurrent limit and releases them in order", async () => {
    const limiter = new LlmRateLimiter({
      maxConcurrent: 1,
      maxRequestsPerMinute: 60,
      maxTokensPerMinute: 1_000,
      maxQueueSize: 5,
      queueTimeoutMs: 100,
    });

    const first = await limiter.acquire({ model: "qwen3.6", estimatedTokens: 10 });
    let secondResolved = false;
    const secondPromise = limiter.acquire({ model: "qwen3.6", estimatedTokens: 10 }).then((permit) => {
      secondResolved = true;
      return permit;
    });

    await Promise.resolve();
    expect(secondResolved).toBe(false);

    first.release();
    const second = await secondPromise;
    expect(secondResolved).toBe(true);
    second.release();
  });

  it("rejects new work when the queue is full", async () => {
    const limiter = new LlmRateLimiter({
      maxConcurrent: 1,
      maxRequestsPerMinute: 60,
      maxTokensPerMinute: 1_000,
      maxQueueSize: 1,
      queueTimeoutMs: 100,
    });

    const first = await limiter.acquire({ model: "qwen3.6", estimatedTokens: 10 });
    const queued = limiter.acquire({ model: "qwen3.6", estimatedTokens: 10 });

    await expect(limiter.acquire({ model: "qwen3.6", estimatedTokens: 10 })).rejects.toMatchObject({
      code: "queue_full",
    } satisfies Partial<LlmRateLimitError>);

    first.release();
    const queuedPermit = await queued;
    queuedPermit.release();
  });

  it("rejects work that cannot fit inside the request-per-minute budget before timeout", async () => {
    const limiter = new LlmRateLimiter({
      maxConcurrent: 1,
      maxRequestsPerMinute: 1,
      maxTokensPerMinute: 1_000,
      maxQueueSize: 5,
      queueTimeoutMs: 5,
    });

    const first = await limiter.acquire({ model: "qwen3.6", estimatedTokens: 10 });
    first.release();

    await expect(limiter.acquire({ model: "qwen3.6", estimatedTokens: 10 })).rejects.toMatchObject({
      code: "queue_timeout",
    } satisfies Partial<LlmRateLimitError>);
  });

  it("rejects work that cannot fit inside the model token-per-minute budget before timeout", async () => {
    const limiter = new LlmRateLimiter({
      maxConcurrent: 1,
      maxRequestsPerMinute: 60,
      maxTokensPerMinute: 100,
      maxQueueSize: 5,
      queueTimeoutMs: 5,
    });

    const first = await limiter.acquire({ model: "qwen3.6", estimatedTokens: 90 });
    first.release();

    await expect(limiter.acquire({ model: "qwen3.6", estimatedTokens: 20 })).rejects.toMatchObject({
      code: "queue_timeout",
    } satisfies Partial<LlmRateLimitError>);
  });
});
