const WINDOW_MS = 60_000;

export type LlmRateLimitErrorCode = "queue_full" | "queue_timeout";

export class LlmRateLimitError extends Error {
  readonly code: LlmRateLimitErrorCode;

  constructor(code: LlmRateLimitErrorCode, message: string) {
    super(message);
    this.name = "LlmRateLimitError";
    this.code = code;
  }
}

export type LlmRateLimiterOptions = {
  maxConcurrent: number;
  maxRequestsPerMinute: number;
  maxTokensPerMinute: number;
  maxQueueSize: number;
  queueTimeoutMs: number;
  now?: () => number;
};

export type LlmAcquireRequest = {
  model: string;
  estimatedTokens: number;
};

export type LlmPermit = {
  release: () => void;
};

type QueuedRequest = LlmAcquireRequest & {
  enqueuedAt: number;
  deadline: number;
  resolve: (permit: LlmPermit) => void;
  reject: (error: LlmRateLimitError) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type TokenWindowEntry = {
  ts: number;
  tokens: number;
};

export function estimateLlmRequestTokens(input: {
  messages: Array<{ content: string }>;
  maxTokens?: number;
}): number {
  const inputChars = input.messages.reduce((total, message) => total + message.content.length, 0);
  const inputTokens = Math.ceil(inputChars / 4);
  return Math.max(1, inputTokens + (input.maxTokens ?? 0));
}

export class LlmRateLimiter {
  private readonly maxConcurrent: number;
  private readonly maxRequestsPerMinute: number;
  private readonly maxTokensPerMinute: number;
  private readonly maxQueueSize: number;
  private readonly queueTimeoutMs: number;
  private readonly now: () => number;
  private active = 0;
  private queue: QueuedRequest[] = [];
  private requestWindow: number[] = [];
  private tokenWindows = new Map<string, TokenWindowEntry[]>();
  private drainTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: LlmRateLimiterOptions) {
    this.maxConcurrent = Math.max(1, Math.floor(options.maxConcurrent));
    this.maxRequestsPerMinute = Math.max(1, Math.floor(options.maxRequestsPerMinute));
    this.maxTokensPerMinute = Math.max(1, Math.floor(options.maxTokensPerMinute));
    this.maxQueueSize = Math.max(0, Math.floor(options.maxQueueSize));
    this.queueTimeoutMs = Math.max(1, Math.floor(options.queueTimeoutMs));
    this.now = options.now ?? Date.now;
  }

  acquire(request: LlmAcquireRequest): Promise<LlmPermit> {
    const normalized: LlmAcquireRequest = {
      model: request.model || "unknown",
      estimatedTokens: Math.max(1, Math.ceil(request.estimatedTokens)),
    };

    this.pruneWindows();
    if (this.canStart(normalized)) {
      return Promise.resolve(this.start(normalized));
    }

    const now = this.now();
    const delay = this.nextBudgetDelayMs(normalized);
    if (this.active < this.maxConcurrent && delay > this.queueTimeoutMs) {
      return Promise.reject(
        new LlmRateLimitError("queue_timeout", "NAN budget is saturated; request cannot start before queue timeout."),
      );
    }

    if (this.queue.length >= this.maxQueueSize) {
      return Promise.reject(new LlmRateLimitError("queue_full", "NAN request queue is full."));
    }

    return new Promise<LlmPermit>((resolve, reject) => {
      const queued: QueuedRequest = {
        ...normalized,
        enqueuedAt: now,
        deadline: now + this.queueTimeoutMs,
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.removeQueued(queued);
          reject(new LlmRateLimitError("queue_timeout", "NAN request waited too long in queue."));
          this.drain();
        }, this.queueTimeoutMs),
      };
      this.queue.push(queued);
      this.scheduleDrain(0);
    });
  }

  getStats(): { active: number; queued: number; maxConcurrent: number; maxQueueSize: number } {
    return {
      active: this.active,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueueSize: this.maxQueueSize,
    };
  }

  private start(request: LlmAcquireRequest): LlmPermit {
    this.active += 1;
    const now = this.now();
    this.requestWindow.push(now);
    const modelWindow = this.tokenWindows.get(request.model) ?? [];
    modelWindow.push({ ts: now, tokens: request.estimatedTokens });
    this.tokenWindows.set(request.model, modelWindow);

    let released = false;
    return {
      release: () => {
        if (released) {
          return;
        }
        released = true;
        this.active = Math.max(0, this.active - 1);
        this.drain();
      },
    };
  }

  private drain(): void {
    this.drainTimer = null;
    this.pruneWindows();

    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue[0];
      if (!next) {
        return;
      }

      const now = this.now();
      if (now >= next.deadline) {
        this.queue.shift();
        clearTimeout(next.timeout);
        next.reject(new LlmRateLimitError("queue_timeout", "NAN request waited too long in queue."));
        continue;
      }

      if (!this.canStart(next)) {
        const delay = this.nextBudgetDelayMs(next);
        const remaining = next.deadline - now;
        if (delay > remaining) {
          this.queue.shift();
          clearTimeout(next.timeout);
          next.reject(new LlmRateLimitError("queue_timeout", "NAN budget is saturated before queue timeout."));
          continue;
        }
        this.scheduleDrain(delay);
        return;
      }

      this.queue.shift();
      clearTimeout(next.timeout);
      next.resolve(this.start(next));
    }
  }

  private canStart(request: LlmAcquireRequest): boolean {
    if (this.active >= this.maxConcurrent) {
      return false;
    }
    if (this.requestWindow.length >= this.maxRequestsPerMinute) {
      return false;
    }
    return this.modelTokenTotal(request.model) + request.estimatedTokens <= this.maxTokensPerMinute;
  }

  private modelTokenTotal(model: string): number {
    return (this.tokenWindows.get(model) ?? []).reduce((total, entry) => total + entry.tokens, 0);
  }

  private nextBudgetDelayMs(request: LlmAcquireRequest): number {
    const now = this.now();
    const delays: number[] = [];
    if (this.requestWindow.length >= this.maxRequestsPerMinute) {
      const oldest = this.requestWindow[0] ?? now;
      delays.push(Math.max(1, oldest + WINDOW_MS - now));
    }

    let tokenTotal = this.modelTokenTotal(request.model);
    if (tokenTotal + request.estimatedTokens > this.maxTokensPerMinute) {
      for (const entry of this.tokenWindows.get(request.model) ?? []) {
        tokenTotal -= entry.tokens;
        if (tokenTotal + request.estimatedTokens <= this.maxTokensPerMinute) {
          delays.push(Math.max(1, entry.ts + WINDOW_MS - now));
          break;
        }
      }
    }

    return delays.length > 0 ? Math.max(...delays) : 0;
  }

  private pruneWindows(): void {
    const cutoff = this.now() - WINDOW_MS;
    this.requestWindow = this.requestWindow.filter((ts) => ts > cutoff);
    for (const [model, entries] of this.tokenWindows.entries()) {
      const live = entries.filter((entry) => entry.ts > cutoff);
      if (live.length === 0) {
        this.tokenWindows.delete(model);
      } else {
        this.tokenWindows.set(model, live);
      }
    }
  }

  private removeQueued(queued: QueuedRequest): void {
    this.queue = this.queue.filter((entry) => entry !== queued);
  }

  private scheduleDrain(delayMs: number): void {
    if (this.drainTimer) {
      return;
    }
    this.drainTimer = setTimeout(() => this.drain(), Math.max(0, delayMs));
  }
}
