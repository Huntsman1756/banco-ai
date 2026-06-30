import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { type ZodType } from "zod";
import { logger } from "../../shared/logger.js";
import { validateLlmJson, type LlmValidationResult } from "../../domain/financial-engine.js";
import { estimateLlmRequestTokens, LlmRateLimiter } from "./rate-limiter.js";

export type LlmMessageRole = "system" | "user" | "assistant";

export type LlmMessage = {
  role: LlmMessageRole;
  content: string;
};

export type LlmConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  maxRequestsPerMinute: number;
  maxConcurrent: number;
  maxTokensPerMinute: number;
  maxQueueSize: number;
  queueTimeoutMs: number;
};

type ChatCompletionChoice = {
  message?: {
    content?: string | null;
  };
};

type ChatCompletionPayload = {
  model: string;
  messages: LlmMessage[];
  temperature?: number;
  max_tokens?: number;
};

type RawChatCompletion = {
  model?: string;
  choices?: ChatCompletionChoice[];
};

type OpencodeNanConfig = {
  baseUrl?: string;
  apiKey?: string;
};

const DEFAULT_BASE_URL = "https://api.nan.builders/v1";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_RETRIES = 2;
const DEFAULT_MODEL = "qwen3.6";
const DEFAULT_MAX_RPM = 60;
const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_MAX_TPM = 1_500_000;
const DEFAULT_MAX_QUEUE_SIZE = 50;
const DEFAULT_QUEUE_TIMEOUT_MS = 15_000;

let parsedEnv: Record<string, string> | null = null;
let rateLimiter: LlmRateLimiter | null = null;
let parsedOpencode: OpencodeNanConfig | null | undefined;

function loadDotEnvFromFile(): void {
  if (parsedEnv) {
    return;
  }

  parsedEnv = {};
  const envPath = join(process.cwd(), ".env");
  let rawEnv = "";
  try {
    rawEnv = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of rawEnv.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim();
    if (key && parsedEnv[key] === undefined) {
      parsedEnv[key] = value;
    }
  }

  for (const [key, value] of Object.entries(parsedEnv)) {
    if (process.env[key] === undefined && value) {
      process.env[key] = value;
    }
  }
}

function getEnvValue(name: string, fallback?: string): string {
  return process.env[name] ?? fallback ?? "";
}

function getOpencodeConfigPaths(): string[] {
  const explicit = process.env.OPENCODE_CONFIG_PATH?.trim();
  const home = homedir();
  return [
    explicit,
    join(home, ".opencode", "opencode.json"),
    join(home, ".config", "opencode", "opencode.json"),
    join(process.cwd(), "opencode.json"),
    join(process.cwd(), "..", "opencode.json"),
  ].filter((path): path is string => Boolean(path));
}

export function readOpencodeNanConfig(path: string): OpencodeNanConfig | null {
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      provider?: {
        nan?: {
          options?: {
            baseURL?: unknown;
            apiKey?: unknown;
          };
        };
      };
    };
    const options = parsed.provider?.nan?.options;
    const baseUrl = typeof options?.baseURL === "string" ? options.baseURL.trim() : "";
    const apiKey = typeof options?.apiKey === "string" ? options.apiKey.trim() : "";
    if (!baseUrl && !apiKey) {
      return null;
    }
    return {
      baseUrl: baseUrl || undefined,
      apiKey: apiKey || undefined,
    };
  } catch {
    return null;
  }
}

function loadOpencodeNanConfig(): OpencodeNanConfig | null {
  if (parsedOpencode !== undefined) {
    return parsedOpencode;
  }

  for (const path of getOpencodeConfigPaths()) {
    const config = readOpencodeNanConfig(path);
    if (config?.apiKey || config?.baseUrl) {
      parsedOpencode = config;
      return parsedOpencode;
    }
  }

  parsedOpencode = null;
  return null;
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(getEnvValue(name, fallback.toString()), 10);
  const safeFallback = Number.isFinite(fallback) && fallback > 0 ? fallback : DEFAULT_TIMEOUT_MS;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : safeFallback;
}

export function getLlmConfig(): LlmConfig {
  loadDotEnvFromFile();

  const opencode = loadOpencodeNanConfig();
  const baseUrl = getEnvValue("NAN_BASE_URL", getEnvValue("OPENAI_BASE_URL", opencode?.baseUrl ?? DEFAULT_BASE_URL)).replace(/\/+$/, "");
  const model = getEnvValue("NAN_MODEL", getEnvValue("OPENAI_MODEL", DEFAULT_MODEL));
  const apiKey = getEnvValue("NAN_API_KEY", getEnvValue("OPENAI_API_KEY", opencode?.apiKey ?? ""));
  const openAiTimeout = Number.parseInt(getEnvValue("OPENAI_TIMEOUT_MS", DEFAULT_TIMEOUT_MS.toString()), 10);
  const timeoutMs = parsePositiveIntEnv("NAN_TIMEOUT_MS", Number.isFinite(openAiTimeout) ? openAiTimeout : DEFAULT_TIMEOUT_MS);
  const maxRetries = Number.parseInt(getEnvValue("NAN_LLM_RETRIES", getEnvValue("OPENAI_LLM_RETRIES", DEFAULT_RETRIES.toString())), 10);

  if (!apiKey) {
    throw new Error("NAN_API_KEY no configurada. Define NAN_API_KEY (o OPENAI_API_KEY) en el entorno o .env.");
  }

  return {
    baseUrl,
    apiKey,
    model,
    timeoutMs,
    maxRetries: Number.isFinite(maxRetries) && maxRetries >= 0 ? maxRetries : DEFAULT_RETRIES,
    maxRequestsPerMinute: parsePositiveIntEnv("NAN_MAX_RPM", DEFAULT_MAX_RPM),
    maxConcurrent: parsePositiveIntEnv("NAN_MAX_CONCURRENT", DEFAULT_MAX_CONCURRENT),
    maxTokensPerMinute: parsePositiveIntEnv("NAN_MODEL_MAX_TPM", DEFAULT_MAX_TPM),
    maxQueueSize: parsePositiveIntEnv("NAN_MAX_QUEUE_SIZE", DEFAULT_MAX_QUEUE_SIZE),
    queueTimeoutMs: parsePositiveIntEnv("NAN_QUEUE_TIMEOUT_MS", DEFAULT_QUEUE_TIMEOUT_MS),
  };
}

function getRateLimiter(config: LlmConfig): LlmRateLimiter {
  if (!rateLimiter) {
    rateLimiter = new LlmRateLimiter({
      maxConcurrent: config.maxConcurrent,
      maxRequestsPerMinute: config.maxRequestsPerMinute,
      maxTokensPerMinute: config.maxTokensPerMinute,
      maxQueueSize: config.maxQueueSize,
      queueTimeoutMs: config.queueTimeoutMs,
    });
  }
  return rateLimiter;
}

function buildRequestFingerprint(messages: LlmMessage[]): string {
  return createHash("sha256").update(JSON.stringify(messages)).digest("hex").slice(0, 16);
}

async function callChatCompletion(
  messages: LlmMessage[],
  config: LlmConfig,
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  },
): Promise<{ model: string; content: string }> {
  const payload: ChatCompletionPayload = {
    model: options?.model ?? config.model,
    messages,
    temperature: options?.temperature ?? 0.2,
    max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
  };

  const endpoint = `${config.baseUrl}/chat/completions`;
  const estimatedTokens = estimateLlmRequestTokens({
    messages,
    maxTokens: payload.max_tokens,
  });
  const limiter = getRateLimiter(config);
  const permit = await limiter.acquire({
    model: payload.model,
    estimatedTokens,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? config.timeoutMs);

  logger.info("llm invocation started", {
    provider: "openai-compatible",
    model: payload.model,
    endpoint: "chat/completions",
    estimatedTokens,
    limiter: limiter.getStats(),
    requestFingerprint: buildRequestFingerprint(messages),
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${raw}`);
    }

    const parsed = JSON.parse(raw) as RawChatCompletion;
    const content = parsed.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("Respuesta de API sin contenido usable.");
    }

    return {
      model: parsed.model ?? payload.model,
      content,
    };
  } finally {
    clearTimeout(timer);
    permit.release();
    logger.info("llm invocation finished", {
      provider: "openai-compatible",
      model: payload.model,
      endpoint: "chat/completions",
      status: "done",
    });
  }
}

export type LlmStructuredInput<T> = {
  systemPrompt: string;
  userPrompt: string;
  schema: ZodType<T>;
  schemaName?: string;
  model?: string;
  maxRetries?: number;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

export async function generateStructuredJson<T>(input: LlmStructuredInput<T>): Promise<LlmValidationResult<T>> {
  const config = getLlmConfig();
  const schemaName = input.schemaName ?? "llm_output";
  const maxRetries = input.maxRetries ?? config.maxRetries ?? DEFAULT_RETRIES;
  let attempt = 1;
  let userPrompt = input.userPrompt;
  let raw: string;

  while (true) {
    const completion = await callChatCompletion(
      [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: userPrompt },
      ],
      config,
      {
        model: input.model,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        timeoutMs: input.timeoutMs,
      },
    );
    raw = completion.content;
    const validation = validateLlmJson(raw, input.schema, {
      schemaName,
      attempt,
      maxRetries,
    });

    if (validation.status !== "retryable") {
      return validation;
    }

    if (!validation.correctedPrompt) {
      return {
        status: "blocked",
        schemaName,
        attempts: validation.attempts,
        reason: "No se pudo corregir la salida del LLM.",
        raw,
      };
    }

    userPrompt = `${input.userPrompt}\n\n${validation.correctedPrompt}`;
    attempt = validation.attempts + 1;
    if (attempt > maxRetries + 1) {
      return {
        status: "blocked",
        schemaName,
        attempts: attempt,
        reason: validation.reason,
        raw,
      };
    }
  }
}

export async function generateText(input: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<string> {
  const config = getLlmConfig();
  const completion = await callChatCompletion(
    [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userPrompt },
    ],
    config,
    {
      model: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs,
    },
  );
  return completion.content;
}


