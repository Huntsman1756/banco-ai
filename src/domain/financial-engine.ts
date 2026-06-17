import { z } from "zod";

export type ProductFinancialInput = {
  tae: number;
  monthlyDeposit?: number;
  months?: number;
  taxesRate?: number;
};

export type ProductFinancialResult = {
  monthlyRate: number;
  grossInterest: number;
  netInterest: number;
  finalAmount: number;
};

export const MAX_LLM_INPUT_CHARACTERS = 100_000;
export const MAX_LLM_OUTPUT_RETRY_COUNT = 2;

export const ExtractedProductSchema = z
  .object({
    product_name: z.string().min(1),
    product_kind: z.enum(["cuenta_remunerada", "cuenta_nomina", "deposito"]),
    tae: z.number().nullable(),
    tin: z.number().nullable(),
    max_balance: z.number().nullable(),
    min_balance: z.number().nullable(),
    duration_months: z.number().nullable(),
    bonus_amount: z.number().nullable(),
    permanencia: z.string().nullable(),
    fees: z.array(
      z.object({
        name: z.string().min(1),
        amount: z.number(),
        period: z.enum(["monthly", "yearly", "one_time"]),
      }),
    ),
    requirements: z.object({
      nomina: z.boolean(),
      recibos: z.boolean(),
      tarjeta: z.boolean(),
      bizum: z.boolean(),
      plan_pago: z.boolean(),
      inversion: z.boolean(),
    }),
    cancellation_fees: z.array(z.string()).nullable(),
    evidence: z.array(
      z.object({
        field: z.string().min(1),
        value: z.string().min(1),
        unit: z.string().optional(),
        evidence: z.string().min(1),
        source_url: z.string().url().optional(),
        confidence: z.number().min(0).max(1),
      }),
    ),
    confidence: z.number().min(0).max(1),
    page_summary: z.string().optional(),
  })
  .strict();

export const ExtractedUserProfileSchema = z
  .object({
    objetivo: z.enum(["ahorro", "nomina", "alta_rentabilidad"]),
    capital: z.number().positive(),
    liquidez: z.enum(["inmediata", "plazo_fijo"]).optional(),
    vinculacion: z.enum(["sin_condiciones", "con_condiciones", "indiferente"]),
    iban: z.enum(["es", "global"]).optional(),
    horizonte: z.enum(["corto", "medio", "largo"]).optional(),
    ingresos_mensuales: z.number().optional(),
    raw_input_redacted: z.string(),
  })
  .strict();

export const ExtractedPdfConditionsSchema = z
  .object({
    bank: z.string().min(1),
    product_name: z.string().min(1),
    product_kind: z.enum(["cuenta_remunerada", "cuenta_nomina", "deposito", "desconocido"]),
    tae: z.number().nullable(),
    tin: z.number().nullable(),
    max_balance: z.number().nullable(),
    min_balance: z.number().nullable(),
    duration_months: z.number().nullable(),
    bonus_amount: z.number().nullable(),
    permanencia: z.string().nullable(),
    fees: z.array(
      z.object({
        name: z.string().min(1),
        amount: z.number(),
        period: z.string().min(1),
      }),
    ),
    requirements: z.object({
      nomina: z.boolean(),
      recibos: z.boolean(),
    }),
    clauses_warnings: z.array(z.string()),
    raw_text_excerpts: z.array(z.string()),
  })
  .strict();

export const RecommendationExplanationSchema = z
  .object({
    summary: z.string().min(1),
    top_picks: z.array(
      z.object({
        bank: z.string().min(1),
        product: z.string().min(1),
        position: z.number(),
        benefit: z.number(),
        why: z.string().min(1),
        risks: z.array(z.string()).optional(),
      }),
    ),
    comparisons: z
      .array(
        z.object({
          product_a: z.string().min(1),
          product_b: z.string().min(1),
          difference: z.string().min(1),
        }),
      )
      .optional(),
    disclaimer: z.string().min(1),
  })
  .strict();

export const RegulatoryIntentSchema = z.object({
  category: z.enum([
    "banking_comparison",
    "financial_education",
    "general_investment_recommendation",
    "personalized_investment_advice",
    "cryptoasset_discussion",
    "promotion_or_affiliate",
    "unknown",
  ]),
  allowed: z.boolean(),
  reason: z.string().min(1),
  safe_response_mode: z.enum(["normal_banking_comparison", "educational_only", "refuse_personalized_advice", "manual_review"]),
});

export type LlmValidationStatus = "validated" | "retryable" | "blocked";

export type LlmValidationSuccess<T> = {
  status: "validated";
  schemaName: string;
  attempts: number;
  value: T;
};

export type LlmValidationRetry = {
  status: "retryable";
  schemaName: string;
  attempts: number;
  reason: string;
  correctedPrompt: string;
  raw: string;
};

export type LlmValidationBlocked = {
  status: "blocked";
  schemaName: string;
  attempts: number;
  reason: string;
  raw: string;
};

export type LlmValidationResult<T> = LlmValidationSuccess<T> | LlmValidationRetry | LlmValidationBlocked;

function extractJsonFromText(raw: string): string {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object was found in LLM output.");
  }
  return cleaned.slice(start, end + 1);
}

function formatValidationError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(" | ");
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown validation error";
}

function buildCorrectionPrompt(schemaName: string, raw: string, reason: string): string {
  return [
    `La salida anterior no cumple el contrato ${schemaName}.`,
    `Errores de validación: ${reason}`,
    `Fragmento recibido (sin procesar): ${raw.slice(0, 400)}`,
    "Devuelve SOLO un JSON estricto para el mismo esquema, sin explicaciones.",
  ].join("\n");
}

export function truncateForLlmInput(input: string, maxChars: number = MAX_LLM_INPUT_CHARACTERS): string {
  return input.length <= maxChars ? input : input.slice(0, maxChars);
}

export function validateLlmJson<T>(
  rawOutput: string,
  schema: z.ZodType<T>,
  options?: {
    schemaName?: string;
    attempt?: number;
    maxRetries?: number;
  },
): LlmValidationResult<T> {
  const schemaName = options?.schemaName ?? "llm_output";
  const attempt = options?.attempt ?? 1;
  const maxRetries = options?.maxRetries ?? MAX_LLM_OUTPUT_RETRY_COUNT;
  const raw = truncateForLlmInput(rawOutput);

  try {
    const parsed = JSON.parse(extractJsonFromText(raw));
    const value = schema.parse(parsed);
    return {
      status: "validated",
      schemaName,
      attempts: attempt,
      value,
    };
  } catch (error) {
    const reason = formatValidationError(error);
    if (attempt <= maxRetries) {
      return {
        status: "retryable",
        schemaName,
        attempts: attempt,
        reason,
        raw,
        correctedPrompt: buildCorrectionPrompt(schemaName, raw, reason),
      };
    }
    return {
      status: "blocked",
      schemaName,
      attempts: attempt,
      reason,
      raw,
    };
  }
}

export function calculateFirstYearReturn(input: ProductFinancialInput): ProductFinancialResult {
  const principal = Math.max(0, input.monthlyDeposit ?? 0) * 12;
  const rate = Math.max(0, input.tae) / 100;
  const taxRate = Math.max(0, input.taxesRate ?? 0);

  const netRate = rate * (1 - taxRate);
  const grossInterest = principal * rate;
  const netInterest = principal * netRate;
  const finalAmount = principal + netInterest;

  return {
    monthlyRate: rate / 12,
    grossInterest,
    netInterest,
    finalAmount,
  };
}

export function calculatePayrollBonus(baseBonus: number, payrollBonus: number | null, max: number): number {
  const bonus = Math.max(0, payrollBonus ?? 0);
  return Math.min(max, baseBonus + bonus);
}
