import { ExtractedPdfConditionsSchema, ExtractedProductSchema, truncateForLlmInput, type LlmValidationResult } from "../../domain/financial-engine.js";
import { generateStructuredJson } from "../llm/client.js";
import type { ProductCatalogRecord } from "../../domain/recommender.js";

type ProductKind = ProductCatalogRecord["productKind"];

export type ManualConditionsInput = {
  bank: string;
  rawConditions: string;
  productKind?: ProductKind;
  productName?: string;
  sourceUrl?: string;
};

export type ParsedManualConditions = LlmValidationResult<{
  product_name: string;
  product_kind: ProductKind;
  tae: number | null;
  tin: number | null;
  max_balance: number | null;
  min_balance: number | null;
  duration_months: number | null;
  bonus_amount: number | null;
  permanencia: string | null;
  fees: Array<{ name: string; amount: number; period: "monthly" | "yearly" | "one_time" }>;
  requirements: {
    nomina: boolean;
    recibos: boolean;
    tarjeta: boolean;
    bizum: boolean;
    plan_pago: boolean;
    inversion: boolean;
  };
  cancellation_fees: string[] | null;
  evidence: Array<{ field: string; value: string; unit?: string; evidence: string; confidence: number; source_url?: string }>;
  confidence: number;
  page_summary?: string;
}>;

export type ParsedPdfConditions = LlmValidationResult<{
  bank: string;
  product_name: string;
  product_kind: "cuenta_remunerada" | "cuenta_nomina" | "deposito" | "desconocido";
  tae: number | null;
  tin: number | null;
  max_balance: number | null;
  min_balance: number | null;
  duration_months: number | null;
  bonus_amount: number | null;
  permanencia: string | null;
  fees: Array<{ name: string; amount: number; period: string }>;
  requirements: { nomina: boolean; recibos: boolean };
  clauses_warnings: string[];
  raw_text_excerpts: string[];
}>;

type ManualExtractionValue = {
  product_name: string;
  product_kind: ProductCatalogRecord["productKind"];
  tae: number | null;
  tin: number | null;
  max_balance: number | null;
  min_balance: number | null;
  duration_months: number | null;
  bonus_amount: number | null;
  permanencia: string | null;
  fees: Array<{ name: string; amount: number; period: "monthly" | "yearly" | "one_time" }>;
  requirements: {
    nomina: boolean;
    recibos: boolean;
    tarjeta: boolean;
    bizum: boolean;
    plan_pago: boolean;
    inversion: boolean;
  };
  cancellation_fees: string[] | null;
  evidence: Array<{ field: string; value: string; unit?: string; evidence: string; confidence: number; source_url?: string }>;
  confidence: number;
  page_summary?: string;
};

type PdfExtractionValue = {
  product_name: string;
  product_kind: ProductKind | "desconocido";
  tae: number | null;
  tin: number | null;
  max_balance: number | null;
  min_balance: number | null;
  duration_months: number | null;
  bonus_amount: number | null;
  permanencia: string | null;
  fees: Array<{ name: string; amount: number; period: string }>;
  requirements: {
    nomina: boolean;
    recibos: boolean;
  };
  clauses_warnings: string[];
  raw_text_excerpts: string[];
};

function normalizeCatalogProductKind(raw: string | undefined): ProductKind {
  if (raw === "cuenta_remunerada" || raw === "cuenta_nomina" || raw === "deposito") {
    return raw;
  }
  return "cuenta_remunerada";
}

function normalizePositiveNumber(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
}

function sumFees(total: number, fee: { amount: number }): number {
  if (typeof fee.amount !== "number" || !Number.isFinite(fee.amount)) {
    return total;
  }
  return total + Math.max(0, fee.amount);
}

export async function extractManualConditions(input: ManualConditionsInput): Promise<ParsedManualConditions> {
  const rawText = truncateForLlmInput(input.rawConditions);
  const schemaProductKind =
    input.productKind === "cuenta_remunerada" || input.productKind === "cuenta_nomina" || input.productKind === "deposito"
      ? input.productKind
      : "cuenta_remunerada";

  const systemPrompt = "Eres un agente de extracción de condiciones de producto bancario. Devuelve SOLO JSON estricto.";
  const userPrompt = `Extrae condiciones estandarizadas del siguiente texto, sin agregar datos.
Banco informado: ${input.bank}
Producto sugerido por operador (puede ser incompleto): ${input.productName ?? "-"}
Tipo de producto sugerido: ${schemaProductKind}
Texto:
${rawText}`;

  return generateStructuredJson({
    systemPrompt,
    userPrompt,
    schema: ExtractedProductSchema,
    schemaName: "ExtractedProductSchema",
    maxRetries: 2,
    temperature: 0.2,
    maxTokens: 850,
  });
}

export async function extractPdfConditions(rawText: string): Promise<ParsedPdfConditions> {
  const systemPrompt = "Eres un auditor de producto bancario. Devuelve SOLO JSON estricto para este PDF.";
  const userPrompt = `Extrae condiciones observables de producto bancario a partir de este texto.
Texto bruto del documento:
${truncateForLlmInput(rawText)}`;

  return generateStructuredJson({
    systemPrompt,
    userPrompt,
    schema: ExtractedPdfConditionsSchema,
    schemaName: "ExtractedPdfConditionsSchema",
    maxRetries: 2,
    temperature: 0.2,
    maxTokens: 850,
  });
}

export function mapManualExtractionToCatalogProduct(
  bank: string,
  extraction: ParsedManualConditions & { status: "validated"; value: ManualExtractionValue },
  override: { productName?: string; sourceUrl?: string },
): ProductCatalogRecord {
  const parsed = extraction.value;
  const feesTotal = parsed.fees.reduce((sum, fee) => sum + Math.max(0, fee.amount), 0);

  return {
    id: "",
    bank,
    productName: override.productName || parsed.product_name,
    productKind: parsed.product_kind,
    tae: parsed.tae ?? 0,
    fees: feesTotal,
    minBalance: parsed.min_balance ?? 0,
    maxBalance: parsed.max_balance ?? null,
    durationMonths: parsed.duration_months,
    validTo: null,
    status: "pending_review",
    source: "manual-upload",
    sourceUrl: override.sourceUrl,
    categoryLabel: parsed.page_summary,
    requiresPayroll: parsed.requirements.nomina,
    requiresReceipts: parsed.requirements.recibos,
    requiresBizum: parsed.requirements.bizum,
    requiresConditions: parsed.requirements.plan_pago,
    liquidity: 80,
  };
}

export function mapPdfExtractionToCatalogProduct(
  bank: string,
  extraction: ParsedPdfConditions & { status: "validated"; value: PdfExtractionValue },
  override: { productName?: string; sourceUrl?: string },
): ProductCatalogRecord {
  const parsed = extraction.value;
  const feesTotal = parsed.fees.reduce(sumFees, 0);

  return {
    id: "",
    bank,
    productName: override.productName || parsed.product_name,
    productKind: normalizeCatalogProductKind(parsed.product_kind),
    tae: normalizePositiveNumber(parsed.tae),
    fees: feesTotal,
    minBalance: normalizePositiveNumber(parsed.min_balance),
    maxBalance: parsed.max_balance !== null && Number.isFinite(parsed.max_balance) ? parsed.max_balance : null,
    durationMonths: parsed.duration_months !== null && Number.isFinite(parsed.duration_months) ? parsed.duration_months : null,
    validTo: null,
    status: "pending_review",
    source: "pdf-upload",
    sourceUrl: override.sourceUrl,
    categoryLabel: parsed.requirements.nomina ? "Con nómina" : parsed.requirements.recibos ? "Con recibos" : "Banco",
    requiresPayroll: Boolean(parsed.requirements.nomina),
    requiresReceipts: Boolean(parsed.requirements.recibos),
    requiresBizum: false,
    requiresConditions: parsed.clauses_warnings.length > 0 || parsed.raw_text_excerpts.length > 0 || parsed.tin !== null || parsed.permanencia !== null,
    liquidity: normalizeCatalogProductKind(parsed.product_kind) === "deposito" ? 25 : 80,
  };
}
