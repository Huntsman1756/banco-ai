import { existsSync, readFileSync } from "node:fs";
import type { ProductCatalogRecord } from "../src/domain/recommender.js";
import { addManualCatalogProduct } from "../src/infrastructure/products/catalog-store.js";

type CandidateKind = "cuenta_remunerada" | "cuenta_nomina" | "deposito" | "desconocido";

type ManifestConditionFlags = {
  requiresNomina: boolean;
  requiresReceipts: boolean;
  hasTarjeta: boolean;
  hasBizum: boolean;
};

type IncomingDocumentCandidate = {
  sourceFile: string;
  bankHint: string;
  productNameHint: string;
  productKind: CandidateKind;
  taeRates: number[];
  minBalance: number | null;
  maxBalance: number | null;
  hasNoLimit: boolean;
  hasNoConditions: boolean;
  feesDetected: boolean;
  flags: ManifestConditionFlags;
  excerpt: string;
  confidence: number;
  reviewedRequired: boolean;
  evidence: string[];
  textFingerprint: string;
};

type ImportManifest = {
  generatedAt: string;
  sourceDir: string;
  totalCandidates: number;
  reviewedRequired: number;
  candidates: IncomingDocumentCandidate[];
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, value));
}

function parseArg(name: string, fallback?: string): string | undefined {
  for (let index = process.argv.length - 1; index >= 0; index -= 1) {
    if (process.argv[index] === name && index < process.argv.length - 1) {
      return process.argv[index + 1];
    }
  }
  return fallback;
}

function parseIntArg(name: string): number | undefined {
  const raw = parseArg(name);
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function parseFloatArg(name: string): number | undefined {
  const raw = parseArg(name);
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseFloat(raw.replace(/,/g, "."));
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

function parseManifest(raw: unknown): ImportManifest | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const cast = raw as Partial<ImportManifest>;
  if (!Array.isArray(cast.candidates)) {
    return null;
  }

  const candidates = cast.candidates
    .filter((entry): entry is IncomingDocumentCandidate => typeof entry === "object" && entry !== null)
    .map((entry) => {
      const sourceFile = normalizeString((entry as { sourceFile?: unknown }).sourceFile) || "desconocido.txt";
      const bankHint = normalizeString((entry as { bankHint?: unknown }).bankHint) || "Banco sin identificar";
      const productNameHint = normalizeString((entry as { productNameHint?: unknown }).productNameHint) || "Producto sin nombre";
      const productKind = ((entry as { productKind?: unknown }).productKind as CandidateKind) || "cuenta_remunerada";
      const taeRatesRaw = Array.isArray((entry as { taeRates?: unknown }).taeRates) ? (entry as { taeRates: unknown[] }).taeRates : [];
      const taeRates = taeRatesRaw
        .map((rate) => {
          if (typeof rate === "number" && Number.isFinite(rate)) {
            return rate;
          }
          const parsed = Number.parseFloat(String(rate));
          return Number.isFinite(parsed) ? parsed : null;
        })
        .filter((rate): rate is number => rate !== null);

      const flags = ((entry as { flags?: unknown }).flags as ManifestConditionFlags) ?? {
        requiresNomina: false,
        requiresReceipts: false,
        hasTarjeta: false,
        hasBizum: false,
      };

      const minBalanceCandidate = (entry as { minBalance?: unknown }).minBalance;
      const maxBalanceCandidate = (entry as { maxBalance?: unknown }).maxBalance;

      const evidence = Array.isArray((entry as { evidence?: unknown }).evidence)
        ? ((entry as { evidence: unknown[] }).evidence.filter((value) => typeof value === "string") as string[])
        : [];

      return {
        sourceFile,
        bankHint,
        productNameHint,
        productKind,
        taeRates,
        minBalance: typeof minBalanceCandidate === "number" && Number.isFinite(minBalanceCandidate) ? minBalanceCandidate : 0,
        maxBalance: typeof maxBalanceCandidate === "number" && Number.isFinite(maxBalanceCandidate) ? maxBalanceCandidate : null,
        hasNoLimit: Boolean((entry as { hasNoLimit?: unknown }).hasNoLimit),
        hasNoConditions: Boolean((entry as { hasNoConditions?: unknown }).hasNoConditions),
        feesDetected: Boolean((entry as { feesDetected?: unknown }).feesDetected),
        flags,
        excerpt: normalizeString((entry as { excerpt?: unknown }).excerpt),
        confidence: clampConfidence((entry as { confidence?: unknown }).confidence),
        reviewedRequired: Boolean((entry as { reviewedRequired?: unknown }).reviewedRequired),
        textFingerprint: normalizeString((entry as { textFingerprint?: unknown }).textFingerprint),
        evidence,
      };
    });

  return {
    generatedAt: normalizeString(cast.generatedAt) || new Date().toISOString(),
    sourceDir: normalizeString(cast.sourceDir) || "docs/Cuentas remuneradas SIN condiciones",
    totalCandidates: Number.isFinite(cast.totalCandidates) ? Number(cast.totalCandidates) : candidates.length,
    reviewedRequired: Number.isFinite(cast.reviewedRequired) ? Number(cast.reviewedRequired) : 0,
    candidates,
  };
}

function normalizeCatalogKind(raw: CandidateKind): ProductCatalogRecord["productKind"] {
  if (raw === "cuenta_nomina" || raw === "deposito" || raw === "cuenta_remunerada") {
    return raw;
  }
  return "cuenta_remunerada";
}

function shouldImport(
  candidate: IncomingDocumentCandidate,
  index: number,
  opts: { maxItems?: number; minConfidence?: number; onlyReviewRequired: boolean; dryRun: boolean },
): boolean {
  if (opts.maxItems !== undefined && index >= opts.maxItems) {
    return false;
  }
  if (typeof opts.minConfidence === "number" && candidate.confidence < opts.minConfidence) {
    return false;
  }
  if (opts.onlyReviewRequired && !candidate.reviewedRequired) {
    return false;
  }
  return true;
}

function truncateText(value: string, length = 140): string {
  if (value.length <= length) {
    return value;
  }
  return `${value.slice(0, length)}...`;
}

function buildReviewNote(manifestPath: string, candidate: IncomingDocumentCandidate, generatedAt: string): string {
  const extra = [
    `manifesto=${manifestPath}`,
    `origen=${candidate.sourceFile}`,
    `revisar=${candidate.reviewedRequired ? "si" : "no"}`,
    `confianza=${candidate.confidence.toFixed(2)}`,
    `generado=${generatedAt}`,
  ];
  return extra.join(" | ");
}

async function main(): Promise<void> {
  const manifestPath = parseArg("--manifest", "data/incoming-doc-candidates.json");
  const minConfidence = parseFloatArg("--min-confidence");
  const maxItems = parseIntArg("--max-items");
  const onlyReviewRequired = process.argv.includes("--only-review-required");
  const dryRun = process.argv.includes("--dry-run");

  if (!manifestPath || !existsSync(manifestPath)) {
    process.stderr.write(`No se encontro el manifiesto en: ${manifestPath}\n`);
    process.exit(1);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    process.stderr.write("No fue posible parsear el manifiesto JSON.\n");
    process.exit(1);
  }

  const manifest = parseManifest(raw);
  if (!manifest || manifest.candidates.length === 0) {
    process.stdout.write("No hay candidatos para importar.\n");
    return;
  }

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const importedIds: string[] = [];

  for (const [index, candidate] of manifest.candidates.entries()) {
    if (!shouldImport(candidate, index, { maxItems, minConfidence, onlyReviewRequired, dryRun })) {
      skipped += 1;
      continue;
    }

    const productKind = normalizeCatalogKind(candidate.productKind);
    const requirements = {
      nomina: Boolean(candidate.flags?.requiresNomina),
      recibos: Boolean(candidate.flags?.requiresReceipts),
      recibo: Boolean(candidate.flags?.requiresReceipts),
      tarjeta: Boolean(candidate.flags?.hasTarjeta),
      bizum: Boolean(candidate.flags?.hasBizum),
      plan_pago: false,
      inversion: false,
      requiresPayroll: Boolean(candidate.flags?.requiresNomina),
      requiresReceipts: Boolean(candidate.flags?.requiresReceipts),
    };

    const mappedProduct: Omit<ProductCatalogRecord, "id"> = {
      bank: candidate.bankHint,
      productName: candidate.productNameHint,
      productKind,
      tae: candidate.taeRates[0] ?? 0,
      fees: 0,
      minBalance: candidate.minBalance ?? 0,
      maxBalance: candidate.hasNoLimit ? null : candidate.maxBalance,
      durationMonths: null,
      validTo: null,
      status: "pending_review",
      source: "doc-manifest",
      sourceUrl: candidate.sourceFile,
      categoryLabel: candidate.textFingerprint ? `firma=${truncateText(candidate.textFingerprint, 16)}` : "documento importado",
      requiresPayroll: Boolean(candidate.flags?.requiresNomina),
      requiresReceipts: Boolean(candidate.flags?.requiresReceipts),
      requiresBizum: Boolean(candidate.flags?.hasBizum),
      requiresConditions: Boolean(!candidate.hasNoConditions || candidate.feesDetected),
      liquidity: productKind === "deposito" ? 25 : 80,
    };

    const options = {
      evidence: candidate.evidence.slice(0, 12).map((entry, evidenceIndex) => ({
        field: `signal_${evidenceIndex + 1}`,
        value: entry,
        evidence: entry,
        confidence: candidate.confidence,
        source_url: undefined as string | undefined,
      })),
      requirements,
      reviewNotes: buildReviewNote(manifestPath, candidate, manifest.generatedAt),
      sourceUrl: `file://${candidate.sourceFile}`,
      tin: null,
      permanencia: null,
      cancellationFees: null,
    } satisfies Parameters<typeof addManualCatalogProduct>[1];

    if (dryRun) {
      imported += 1;
      continue;
    }

    try {
      const saved = await addManualCatalogProduct(mappedProduct, options);
      imported += 1;
      if (saved.id) {
        importedIds.push(saved.id);
      }
    } catch (error) {
      failed += 1;
      process.stderr.write(
        `No se pudo importar ${candidate.bankHint} / ${candidate.productNameHint}: ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
    }
  }

  const sourceDir = manifest.sourceDir;
  process.stdout.write(`Importacion de manifiesto completada.\n`);
  process.stdout.write(`Ruta de origen: ${sourceDir}\n`);
  process.stdout.write(`Archivo manifiesto: ${manifestPath}\n`);
  process.stdout.write(`Total candidatos: ${manifest.candidates.length}\n`);
  process.stdout.write(`Importados: ${imported}\n`);
  process.stdout.write(`Saltados: ${skipped}\n`);
  process.stdout.write(`Fallidos: ${failed}\n`);
  process.stdout.write(`Ejecutado en modo dry-run: ${dryRun ? "si" : "no"}\n`);
  if (!dryRun && importedIds.length > 0) {
    process.stdout.write(`IDs de versiones creadas: ${importedIds.join(", ")}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`Importacion interrumpida: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
