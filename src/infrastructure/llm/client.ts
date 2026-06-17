import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type ZodType } from "zod";
import { logger } from "../../shared/logger";
import { validateLlmJson, type LlmValidationResult } from "../../domain/financial-engine";

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

const DEFAULT_BASE_URL = "https://api.nan.builders/v1";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_RETRIES = 2;
const DEFAULT_MODEL = "qwen3.6";

let parsedEnv: Record<string, string> | null = null;

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

export function getLlmConfig(): LlmConfig {
  loadDotEnvFromFile();

  const baseUrl = getEnvValue("OPENAI_BASE_URL", DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = getEnvValue("NAN_MODEL", getEnvValue("OPENAI_MODEL", DEFAULT_MODEL));
  const apiKey = getEnvValue("OPENAI_API_KEY", "");
  const timeoutMs = Number.parseInt(getEnvValue("OPENAI_TIMEOUT_MS", DEFAULT_TIMEOUT_MS.toString()), 10);
  const maxRetries = Number.parseInt(getEnvValue("NAN_LLM_RETRIES", DEFAULT_RETRIES.toString()), 10);

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY no configurada. Define OPENAI_API_KEY en el entorno o .env.");
  }

  return {
    baseUrl,
    apiKey,
    model,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
    maxRetries: Number.isFinite(maxRetries) && maxRetries >= 0 ? maxRetries : DEFAULT_RETRIES,
  };
}

function buildRequestFingerprint(messages: LlmMessage[]): string {
  return JSON.stringify(messages).slice(0, 120);
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? config.timeoutMs);

  logger.info("llm invocation started", {
    provider: "openai-compatible",
    model: payload.model,
    endpoint,
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
    logger.info("llm invocation finished", {
      provider: "openai-compatible",
      model: payload.model,
      endpoint,
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
