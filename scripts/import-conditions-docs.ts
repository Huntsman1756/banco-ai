import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { analyzePdfText } from "../src/domain/pdf-analyzer";
import { extractPdfTextFallback } from "../src/infrastructure/pdf/extract-text";

type CandidateKind = "cuenta_remunerada" | "cuenta_nomina" | "deposito" | "desconocido";

type ConditionFlags = {
  requiresNomina: boolean;
  requiresReceipts: boolean;
  hasTarjeta: boolean;
  hasBizum: boolean;
};

type DocumentCandidate = {
  sourceFile: string;
  sourceKind: "txt" | "pdf";
  bankHint: string;
  productNameHint: string;
  productKind: CandidateKind;
  taeRates: number[];
  minBalance: number | null;
  maxBalance: number | null;
  hasNoLimit: boolean;
  hasNoConditions: boolean;
  feesDetected: boolean;
  flags: ConditionFlags;
  excerpt: string;
  confidence: number;
  reviewedRequired: boolean;
  textLength: number;
  extractedSignals: {
    hasRemunerationSignal: boolean;
    hasSpanishIbanSignal: boolean;
    hasTransferSignal: boolean;
    hasBonusSignal: boolean;
  };
  evidence: string[];
  textFingerprint: string;
};

type SkippedDocument = {
  sourceFile: string;
  sourceKind: "txt" | "pdf";
  reason: "too_little_text" | "read_error";
  detail: string;
};

type ImportManifest = {
  generatedAt: string;
  sourceDir: string;
  totalCandidates: number;
  reviewedRequired: number;
  skippedDocuments: SkippedDocument[];
  candidates: DocumentCandidate[];
};

function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function readArg(name: string, fallback: string | undefined): string | undefined {
  for (let index = process.argv.length - 1; index >= 0; index -= 1) {
    if (process.argv[index] === name && index < process.argv.length - 1) {
      return process.argv[index + 1];
    }
  }
  return fallback;
}

function pickTextFromFile(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 6)
    .join(" ");
}

function pickBankFromFileName(fileName: string): string {
  const clean = fileName
    .replace(/\.[^.]+$/u, "")
    .replace(/[_-]/g, " ")
    .trim();

  const lowered = normalizeText(clean);
  if (lowered.includes("cajamar")) return "Cajamar";
  if (lowered.includes("ing")) return "ING";
  if (lowered.includes("n26") || lowered.includes("n 26")) return "N26";
  if (lowered.includes("pibank") || lowered.includes("pichincha")) return "Pibank / Pichincha";
  if (lowered.includes("revolut")) return "Revolut";
  if (lowered.includes("wizikin") || lowered.includes("wizink")) return "Wizink";
  if (lowered.includes("cuenta") && lowered.includes("contigo")) return "Cuenta";
  return clean;
}

function inferProductKind(text: string, fileName: string): CandidateKind {
  const normalized = normalizeText(text);
  const normalizedName = normalizeText(fileName);
  const accountSignal =
    /\bcuenta\s+(?:de\s+)?(?:remunerada|ahorro|corriente|online|clara|alta remuneracion)\b/u.test(normalized) ||
    /\bcuenta\s+(?:de\s+)?(?:remunerada|ahorro|corriente|online|clara|alta remuneracion)\b/u.test(normalizedName);
  const payrollSignal = /\bcuenta\s+nomina\b/u.test(normalized) && !/\bcuenta\s+no[\s-]?nomina\b/u.test(normalized);
  const depositSignal =
    /\bdeposito\s+(?:a\s+plazo|bancario|contratable|contratado|\d+\s*meses|[0-9]+)\b/u.test(normalized) ||
    /\bplazo\s+fijo\b/u.test(normalized) ||
    /\bdeposito\b/u.test(normalizedName);

  if (accountSignal || normalized.includes("ahorro") || normalized.includes("remuneracion")) {
    return "cuenta_remunerada";
  }
  if (payrollSignal || normalizedName.includes("nomina")) {
    return "cuenta_nomina";
  }
  if (depositSignal) {
    return "deposito";
  }
  return "cuenta_remunerada";
}

function parseRates(text: string): number[] {
  const normalized = normalizeText(text);
  const rawRates = normalized.match(/\b\d{1,2}(?:[.,]\d{1,3})?\s*%/g) ?? [];
  const unique = new Set<number>();

  for (const rawRate of rawRates) {
    const parsed = Number.parseFloat(rawRate.replace(/\./g, "").replace(",", ".").replace("%", "").trim());
    if (Number.isFinite(parsed)) {
      unique.add(parsed);
    }
  }

  return Array.from(unique).sort((a, b) => b - a).slice(0, 20);
}

function parseLimitValue(match: RegExpMatchArray | null): number | null {
  if (!match || !match[1]) {
    return null;
  }
  const value = Number.parseFloat(match[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(value)) {
    return null;
  }
  return value;
}

function parseBalanceLimits(text: string): { minBalance: number | null; maxBalance: number | null; hasNoLimit: boolean } {
  const normalized = normalizeText(text);
  if (normalized.includes("sin limite") || normalized.includes("limite ilimitado") || normalized.includes("sin maximo")) {
    return { minBalance: 0, maxBalance: null, hasNoLimit: true };
  }

  const maxMatch = normalized.match(/(?:saldo|importe)\s*(?:maximo|max)\s*[^0-9]{0,20}([0-9]+(?:[.,][0-9]{1,3})?)/u);
  const minMatch =
    normalized.match(/(?:saldo|importe)\s*(?:minimo|desde)\s*[^0-9]{0,20}([0-9]+(?:[.,][0-9]{1,3})?)/u) ??
    normalized.match(/(?:desde)\s*[^0-9]{0,20}([0-9]+(?:[.,][0-9]{1,3})?)/u);

  return {
    minBalance: parseLimitValue(minMatch) ?? 0,
    maxBalance: parseLimitValue(maxMatch),
    hasNoLimit: false,
  };
}

function detectFlags(normalized: string): ConditionFlags {
  return {
    requiresNomina: /\b(nomina|salario|pension|sueldo)\b/u.test(normalized),
    requiresReceipts: /\b(recibos?|domiciliacion|domiciliado)\b/u.test(normalized),
    hasTarjeta: /\btarjeta\b/u.test(normalized),
    hasBizum: /\bbizum\b/u.test(normalized),
  };
}

function inferNoConditions(normalized: string, flags: ConditionFlags): boolean {
  if (normalized.includes("sin condiciones")) {
    return true;
  }
  return !flags.requiresNomina && !flags.requiresReceipts && !flags.hasTarjeta && !flags.hasBizum;
}

function buildEvidenceSnippets(normalized: string, taeRates: number[]): string[] {
  const snippets: string[] = [];
  const keywords = [
    "sin condiciones",
    "sin comisiones",
    "sin limite",
    "tarjeta",
    "recibos",
    "nomina",
    "domiciliacion",
    "bizum",
    "transferencias",
    "tae",
  ];
  for (const keyword of keywords) {
    if (normalized.includes(keyword)) {
      snippets.push(keyword);
    }
  }
  for (const rate of taeRates.slice(0, 3)) {
    snippets.push(`tae:${rate}`);
  }
  return snippets.slice(0, 12);
}

function estimateConfidence(params: {
  taeRates: number[];
  hasNoConditions: boolean;
  hasNoLimit: boolean;
  flags: ConditionFlags;
  hasRemunerationSignal: boolean;
  textLength: number;
}): number {
  let score = 0.2;
  if (params.hasRemunerationSignal) {
    score += 0.2;
  }
  if (params.taeRates.length > 0) {
    score += Math.min(0.3, params.taeRates.length * 0.12);
  }
  if (params.hasNoConditions) {
    score += 0.12;
  }
  if (params.flags.hasBizum || params.flags.hasTarjeta) {
    score += 0.08;
  }
  if (params.hasNoLimit) {
    score += 0.05;
  }
  if (params.textLength > 1200) {
    score += 0.1;
  }
  if (params.textLength > 2500) {
    score += 0.08;
  }
  return Number(Math.min(1, score).toFixed(2));
}

function buildCandidate(
  filePath: string,
  content: string,
  analysis?: ReturnType<typeof analyzePdfText>,
): DocumentCandidate {
  const fileName = filePath.split(/[\\/]/u).pop() ?? "unknown";
  const ext = extname(fileName).toLowerCase();
  const sourceKind = ext === ".pdf" ? "pdf" : "txt";
  const normalized = normalizeText(content);

  const bankHint = pickBankFromFileName(fileName);
  const flags = detectFlags(normalized);
  const taeRates = parseRates(content);
  const limitSignals = parseBalanceLimits(content);
  const hasRemunerationSignal =
    analysis?.hasRemunerationSection ??
    /\b(?:cuenta remunerada|cuenta nomina|remuneracion|intereses|tae)\b/u.test(normalized);
  const hasSpanishIbanSignal = /\bes[0-9]{22}\b/u.test(normalized);
  const hasTransferSignal = /\btransferencia|transferencias\b/u.test(normalized);
  const hasBonusSignal = /\bbono|bonificacion|oferta|promocion|campana\b/u.test(normalized);
  const hasNoConditions = inferNoConditions(normalized, flags);
  const feesDetected = normalized.includes("sin comisiones") ? false : normalized.includes("comisiones");
  const textLength = content.trim().length;
  const candidateKind = inferProductKind(content, fileName);

  const minBalance = limitSignals.minBalance ?? analysis?.minBalance ?? 0;
  const maxBalance = limitSignals.maxBalance ?? analysis?.maxBalance ?? null;
  const hasNoLimit = limitSignals.hasNoLimit || (limitSignals.maxBalance === null && minBalance >= 0 && !normalized.includes("maximo"));

  const confidence = estimateConfidence({
    taeRates,
    hasNoConditions,
    hasNoLimit,
    flags,
    hasRemunerationSignal,
    textLength,
  });

  const candidate: DocumentCandidate = {
    sourceFile: filePath,
    sourceKind,
    bankHint,
    productNameHint: pickTextFromFile(content),
    productKind: candidateKind,
    taeRates,
    minBalance,
    maxBalance,
    hasNoLimit,
    hasNoConditions,
    feesDetected,
    flags,
    excerpt: content.slice(0, 460),
    confidence,
    reviewedRequired: confidence < 0.7 || textLength < 800 || !hasRemunerationSignal,
    textLength,
    extractedSignals: {
      hasRemunerationSignal,
      hasSpanishIbanSignal,
      hasTransferSignal,
      hasBonusSignal,
    },
    evidence: buildEvidenceSnippets(normalized, taeRates),
    textFingerprint: createHash("sha256").update(content).digest("hex"),
  };

  if (taeRates.length === 0) {
    candidate.reviewedRequired = true;
  }
  if (analysis && analysis.confidence < 0.65) {
    candidate.reviewedRequired = true;
  }

  return candidate;
}

function listSourceFiles(sourceDir: string, includePdf: boolean): string[] {
  const rawFiles = readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(sourceDir, entry.name))
    .filter((filePath) => {
      const extension = extname(filePath).toLowerCase();
      if (extension === ".txt") {
        return true;
      }
      if (extension === ".pdf") {
        return includePdf;
      }
      return false;
    });

  return rawFiles.sort((a, b) => a.localeCompare(b));
}

function readDocText(filePath: string, sourceKind: "txt" | "pdf"): string {
  const buffer = readFileSync(filePath);
  if (sourceKind === "pdf") {
    return extractPdfTextFallback(buffer);
  }
  const utf8Text = buffer.toString("utf8");
  return utf8Text.includes("\uFFFD") ? buffer.toString("latin1") : utf8Text;
}

function main(): void {
  const sourceDir =
    readArg("--source-dir", undefined) ??
    readArg("-s", undefined) ??
    join(process.cwd(), "docs", "Cuentas remuneradas SIN condiciones");
  const outputPath =
    readArg("--output", undefined) ??
    readArg("-o", undefined) ??
    join(process.cwd(), "data", "incoming-doc-candidates.json");
  const includePdf = process.argv.includes("--include-pdfs") || process.argv.includes("--with-pdfs");

  if (!existsSync(sourceDir)) {
    process.stderr.write(`No se encontró la carpeta de origen: ${sourceDir}\n`);
    process.exit(1);
  }

  const files = listSourceFiles(sourceDir, includePdf);
  const candidates: DocumentCandidate[] = [];
  const skippedDocuments: SkippedDocument[] = [];

  for (const filePath of files) {
    const ext = extname(filePath).toLowerCase();
    const sourceKind: "txt" | "pdf" = ext === ".pdf" ? "pdf" : "txt";
    let rawText = "";
    try {
      rawText = readDocText(filePath, sourceKind);
    } catch (error) {
      skippedDocuments.push({
        sourceFile: filePath,
        sourceKind,
        reason: "read_error",
        detail: error instanceof Error ? error.message : "unknown read error",
      });
      continue;
    }
    if (!rawText || rawText.length < 80) {
      skippedDocuments.push({
        sourceFile: filePath,
        sourceKind,
        reason: "too_little_text",
        detail: sourceKind === "pdf" ? "PDF text extraction did not produce usable text" : "Text file is too short",
      });
      continue;
    }

    const normalizedForReview = normalizeText(rawText);
    const analysis = analyzePdfText(rawText);
    const candidate = buildCandidate(filePath, rawText, analysis);
    if (analysis.hasRemunerationSection === false && !normalizedForReview.includes("intereses")) {
      candidate.reviewedRequired = true;
    }

    candidates.push(candidate);
  }

  const manifest: ImportManifest = {
    generatedAt: new Date().toISOString(),
    sourceDir,
    totalCandidates: candidates.length,
    reviewedRequired: candidates.filter((entry) => entry.reviewedRequired).length,
    skippedDocuments,
    candidates,
  };

  const outDir = dirname(outputPath);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const message = `Se generaron ${candidates.length} candidatos desde "${sourceDir}". Requieren revision manual: ${manifest.reviewedRequired}. Saltados: ${skippedDocuments.length}.`;
  process.stdout.write(`${message}\nArchivo: ${outputPath}\n`);
}

main();
