export type PdfGuardAction = "allow_llm_processing" | "queue_review_only" | "reject_upload";

export type PdfGuardInput = {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  pageCount?: number;
  textSnippet?: string;
};

export type PdfGuardDecision = {
  action: PdfGuardAction;
  reasons: string[];
  estimatedLlmRisk: "low" | "medium" | "high";
};

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_PAGE_COUNT = 50;
const MAX_TEXT_SNIPPET_CHARS = 120_000;
const MIN_RELEVANCE_SCORE = 2;
const WARN_RELEVANCE_SCORE = 4;
const FILE_SIZE_HIGH_RISK = 15 * 1024 * 1024;

const RELEVANT_KEYWORDS = [
  "tae",
  "interes",
  "inter\u00e9s",
  "cuenta",
  "n\u00f3mina",
  "deposito",
  "dep\u00f3sito",
  "comisiones",
  "domiciliar",
  "nomina",
] as const;

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreRelevance(input: string | undefined): number {
  const normalized = normalizeText(input ?? "");
  return RELEVANT_KEYWORDS.reduce((acc, keyword) => acc + (normalized.includes(keyword) ? 1 : 0), 0);
}

function hasPdfContentType(input: string): boolean {
  const lowered = input.toLowerCase();
  return lowered.includes("application/pdf") || lowered.includes("pdf");
}

export function evaluatePdfUpload(input: PdfGuardInput): PdfGuardDecision {
  const reasons: string[] = [];

  if (!hasPdfContentType(input.mimeType)) {
    return {
      action: "reject_upload",
      reasons: [...reasons, "Invalid content type, only PDF files are accepted."],
      estimatedLlmRisk: "low",
    };
  }

  if (input.fileSizeBytes <= 0 || input.fileSizeBytes > MAX_FILE_BYTES) {
    return {
      action: "reject_upload",
      reasons: [...reasons, "File size outside policy limits (max 20 MB)."],
      estimatedLlmRisk: "low",
    };
  }

  if (input.pageCount !== undefined && input.pageCount > MAX_PAGE_COUNT) {
    return {
      action: "reject_upload",
      reasons: [...reasons, "Too many pages, max 50 per policy."],
      estimatedLlmRisk: "low",
    };
  }

  const snippet = input.textSnippet ?? "";
  const relevanceScore = scoreRelevance(snippet);

  if (snippet.length > MAX_TEXT_SNIPPET_CHARS) {
    return {
      action: "queue_review_only",
      reasons: [...reasons, "Very large extracted text preview, route to manual review before LLM parsing."],
      estimatedLlmRisk: "high",
    };
  }

  if (relevanceScore === 0) {
    return {
      action: "reject_upload",
      reasons: [...reasons, "No explicit banking signals in preview text."],
      estimatedLlmRisk: "low",
    };
  }

  if (relevanceScore < MIN_RELEVANCE_SCORE) {
    return {
      action: "queue_review_only",
      reasons: [...reasons, "Low-confidence relevance, route to manual triage."],
      estimatedLlmRisk: "medium",
    };
  }

  if (input.fileSizeBytes >= FILE_SIZE_HIGH_RISK && relevanceScore <= WARN_RELEVANCE_SCORE) {
    return {
      action: "queue_review_only",
      reasons: [...reasons, "Large file with partial confidence, avoid direct LLM execution."],
      estimatedLlmRisk: "high",
    };
  }

  if (input.fileName.toLowerCase().endsWith(".pdf") && relevanceScore < WARN_RELEVANCE_SCORE) {
    return {
      action: "queue_review_only",
      reasons: [...reasons, "Insufficient signal concentration, queue for review first."],
      estimatedLlmRisk: "medium",
    };
  }

  return {
    action: "allow_llm_processing",
    reasons: [...reasons, "File appears relevant and within safe limits."],
    estimatedLlmRisk: relevanceScore >= WARN_RELEVANCE_SCORE ? "low" : "medium",
  };
}
