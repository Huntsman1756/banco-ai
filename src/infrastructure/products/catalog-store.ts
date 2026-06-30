import { randomUUID } from "node:crypto";
import { createDbClient } from "../../db/client.js";
import { auditLog, productVersions, products } from "../../db/schema.js";
import { logger } from "../../shared/logger.js";
import { type ProductCatalogRecord } from "../../domain/recommender.js";
import { and, desc, eq, isNull } from "drizzle-orm";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { manualCatalogSeed } from "../../data/manual-product-catalog.seed.js";

const CATALOG_FILE_PATH = join(process.cwd(), "data", "manual-product-conditions.json");

type JsonEvidence = {
  field: string;
  value: string;
  unit?: string;
  evidence: string;
  confidence: number;
  source_url?: string;
};

type JsonRequirements = {
  nomina?: boolean;
  recibos?: boolean;
  recibo?: boolean;
  tarjeta?: boolean;
  bizum?: boolean;
  plan_pago?: boolean;
  inversion?: boolean;
  requiresPayroll?: boolean;
  requiresReceipts?: boolean;
};

type PersistedCatalog = {
  id: string;
  generatedAt: string;
  products: ProductCatalogRecord[];
};

type AddManualCatalogProductOptions = {
  sourceScrapeId?: number | null;
  feesDetail?: Array<{ name: string; amount: number; period: string }>;
  requirements?: JsonRequirements;
  evidence?: JsonEvidence[];
  reviewNotes?: string;
  sourceUrl?: string;
  tin?: number | null;
  bonusAmount?: number | null;
  permanencia?: string | null;
  cancellationFees?: string[] | null;
};

type CandidateDbRow = {
  versionId: number;
  bank: string;
  name: string;
  kind: string;
  status: string;
  tae: unknown;
  min_balance: unknown;
  max_balance: unknown;
  duration_months: unknown;
  fees_json: unknown;
  requirements_json: unknown;
  evidence_json: unknown;
  valid_to: Date | null;
  review_notes: string | null;
  created_at: Date | null;
  valid_from: Date | null;
  source_scrape_id: number | null;
  product_id: number;
};

type PendingCatalogDraft = {
  id: string;
  productId: number;
  bank: string;
  productName: string;
  productKind: ProductCatalogRecord["productKind"];
  tae: number;
  fees: number;
  minBalance: number;
  maxBalance: number | null;
  durationMonths: number | null;
  sourceUrl?: string;
  createdAt: string;
  reviewNotes: string | null;
  evidenceCount: number;
};

export type CatalogDraftDecision = {
  ok: boolean;
  message: string;
};

export function parseEvidenceEntries(raw: unknown): JsonEvidence[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry): JsonEvidence | null => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const candidate = entry as Partial<JsonEvidence>;
      const field = typeof candidate.field === "string" ? candidate.field : "";
      const value = typeof candidate.value === "string" ? candidate.value : "";
      const evidence = typeof candidate.evidence === "string" ? candidate.evidence : "";
      if (!field || !evidence) {
        return null;
      }

      return {
        field,
        value: value || "Sin valor",
        evidence,
        confidence: normalizeNumeric(candidate.confidence, 0.5),
        unit: typeof candidate.unit === "string" ? candidate.unit : undefined,
        source_url: typeof candidate.source_url === "string" ? candidate.source_url : undefined,
      } satisfies JsonEvidence;
    })
    .filter((entry): entry is JsonEvidence => entry !== null);
}

function toDateIso(input: Date | null): string | null {
  return input ? input.toISOString() : null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeStringInput(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumeric(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const clean = value.replace(",", ".").trim();
    const parsed = Number.parseFloat(clean);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function normalizeNullableNumeric(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const clean = value.replace(",", ".").trim();
    const parsed = Number.parseFloat(clean);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toDbNumeric(value: unknown): string | null {
  const normalized = normalizeNullableNumeric(value);
  return normalized === null ? null : normalized.toString();
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.toLowerCase().trim();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "sí";
  }
  return false;
}

function normalizeProductKind(raw: unknown): ProductCatalogRecord["productKind"] {
  if (
    raw === "cuenta_remunerada" ||
    raw === "cuenta_nomina" ||
    raw === "deposito" ||
    raw === "cuenta"
  ) {
    return raw;
  }
  return "cuenta";
}

function normalizeCatalogStatus(raw: string): ProductCatalogRecord["status"] {
  if (raw === "approved" || raw === "rejected" || raw === "superseded" || raw === "pending_review") {
    return raw;
  }
  return "pending_review";
}

function parseRequirements(raw: unknown): JsonRequirements {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const parsed = raw as JsonRequirements;
  return {
    nomina: normalizeBoolean(parsed.nomina),
    recibos: normalizeBoolean(parsed.recibos || parsed.recibo),
    tarjeta: normalizeBoolean(parsed.tarjeta),
    bizum: normalizeBoolean(parsed.bizum),
    plan_pago: normalizeBoolean(parsed.plan_pago),
    inversion: normalizeBoolean(parsed.inversion),
    requiresPayroll: normalizeBoolean(parsed.requiresPayroll),
    requiresReceipts: normalizeBoolean(parsed.requiresReceipts),
  };
}

function calculateFees(raw: unknown): number {
  if (!Array.isArray(raw)) {
    return 0;
  }

  return raw.reduce((total, entry) => {
    if (!entry || typeof entry !== "object") {
      return total;
    }
    const record = entry as { amount?: unknown };
    return total + normalizeNumeric(record.amount, 0);
  }, 0);
}

function getEvidenceSourceUrl(evidence: JsonEvidence[]): string | undefined {
  const source = evidence.find((entry) => typeof entry.source_url === "string" && entry.source_url.trim().length > 0);
  return source?.source_url;
}

function mapDbRowToCatalogRecord(row: CandidateDbRow): ProductCatalogRecord {
  const evidence = parseEvidenceEntries(row.evidence_json);
  const requirements = parseRequirements(row.requirements_json);
  const tae = normalizeNumeric(row.tae, 0);
  const minBalance = normalizeNullableNumeric(row.min_balance) ?? 0;
  const maxBalance = normalizeNullableNumeric(row.max_balance);
  const durationMonths = normalizeNullableNumeric(row.duration_months);
  const fees = calculateFees(row.fees_json);
  const productKind = normalizeProductKind(row.kind);

  const requiresPayroll = Boolean(requirements.nomina || requirements.requiresPayroll);
  const requiresReceipts = Boolean(requirements.recibos || requirements.requiresReceipts || requirements.recibo);
  const requiresBizum = Boolean(requirements.bizum);
  const requiresConditions = Boolean(
    requirements.plan_pago || requirements.inversion || requirements.tarjeta || requiresPayroll || requiresReceipts || requiresBizum,
  );

  return {
    id: String(row.versionId),
    bank: row.bank,
    productName: row.name,
    productKind,
    tae,
    fees,
    minBalance,
    maxBalance,
    durationMonths,
    validTo: toDateIso(row.valid_to),
    status: normalizeCatalogStatus(row.status),
    source: row.source_scrape_id ? `source-${row.source_scrape_id}` : `version-${row.versionId}`,
    sourceUrl: getEvidenceSourceUrl(evidence),
    categoryLabel: row.review_notes ?? productKind,
    requiresPayroll,
    requiresReceipts,
    requiresBizum,
    requiresConditions,
    liquidity: productKind === "deposito" ? 25 : 80,
  };
}

function sortCatalog(items: ProductCatalogRecord[]): ProductCatalogRecord[] {
  return items
    .slice()
    .sort((a, b) =>
      (a.bank ?? "").localeCompare(b.bank ?? "") ||
      (a.productName ?? "").localeCompare(b.productName ?? "") ||
      (a.source ?? "").localeCompare(b.source ?? ""),
    );
}

function mapFileRecordToPendingDraft(product: ProductCatalogRecord): PendingCatalogDraft {
  return {
    id: product.id,
    productId: 0,
    bank: product.bank,
    productName: product.productName,
    productKind: product.productKind,
    tae: product.tae,
    fees: product.fees,
    minBalance: product.minBalance,
    maxBalance: product.maxBalance,
    durationMonths: product.durationMonths,
    sourceUrl: product.sourceUrl,
    reviewNotes: null,
    evidenceCount: product.sourceUrl ? 1 : 0,
    createdAt: nowIso(),
  };
}

function buildFallbackCatalog(): PersistedCatalog {
  return {
    id: randomUUID(),
    generatedAt: nowIso(),
    products: manualCatalogSeed.map((entry) => ({
      ...entry,
      id: entry.id ?? randomUUID(),
      tae: normalizeNumeric(entry.tae, 0),
      fees: normalizeNumeric(entry.fees, 0),
      minBalance: normalizeNumeric(entry.minBalance, 0),
      maxBalance: normalizeNullableNumeric(entry.maxBalance),
      durationMonths: normalizeNullableNumeric(entry.durationMonths),
      validTo: entry.validTo ?? null,
      status: entry.status ?? "approved",
      source: String(entry.source ?? "seed"),
      categoryLabel: entry.categoryLabel ?? entry.productKind,
      requiresPayroll: Boolean(entry.requiresPayroll),
      requiresReceipts: Boolean(entry.requiresReceipts),
      requiresBizum: Boolean(entry.requiresBizum),
      requiresConditions: Boolean(entry.requiresConditions),
    })),
  };
}

function loadCatalogFromFile(): PersistedCatalog {
  if (!existsSync(CATALOG_FILE_PATH)) {
    const catalog = buildFallbackCatalog();
    persistCatalog(catalog);
    return catalog;
  }

  const raw = readFileSync(CATALOG_FILE_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedCatalog>;
    if (Array.isArray(parsed.products)) {
      return {
        id: parsed.id ?? randomUUID(),
        generatedAt: parsed.generatedAt ?? nowIso(),
        products: parsed.products.map((entry) => ({
          id: String(entry.id ?? randomUUID()),
          bank: normalizeStringInput(entry.bank),
          productName: normalizeStringInput(entry.productName),
          productKind: normalizeProductKind(entry.productKind),
          tae: normalizeNumeric(entry.tae, 0),
          fees: normalizeNumeric(entry.fees, 0),
          minBalance: normalizeNumeric(entry.minBalance, 0),
          maxBalance: normalizeNullableNumeric(entry.maxBalance),
          durationMonths: normalizeNullableNumeric(entry.durationMonths),
          validTo: entry.validTo ? String(entry.validTo) : null,
          status: normalizeCatalogStatus(String(entry.status ?? "approved")),
          source: normalizeStringInput(entry.source ?? "manual"),
          sourceUrl: entry.sourceUrl ? normalizeStringInput(entry.sourceUrl) : undefined,
          categoryLabel: entry.categoryLabel ? String(entry.categoryLabel) : undefined,
          requiresPayroll: Boolean(entry.requiresPayroll),
          requiresReceipts: Boolean(entry.requiresReceipts),
          requiresBizum: Boolean(entry.requiresBizum),
          requiresConditions: Boolean(entry.requiresConditions),
          liquidity: typeof entry.liquidity === "number" ? entry.liquidity : undefined,
        })),
      };
    }
  } catch {
    const fallback = buildFallbackCatalog();
    persistCatalog(fallback);
    return fallback;
  }

  const fallback = buildFallbackCatalog();
  persistCatalog(fallback);
  return fallback;
}

function persistCatalog(catalog: PersistedCatalog): void {
  const dir = dirname(CATALOG_FILE_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CATALOG_FILE_PATH, JSON.stringify(catalog, null, 2), "utf8");
}

let catalogCache: PersistedCatalog | null = null;

function getCatalog(): PersistedCatalog {
  if (!catalogCache) {
    catalogCache = loadCatalogFromFile();
  }
  return catalogCache;
}

function getDbClient() {
  const hasConn = Boolean(process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL);
  if (!hasConn) {
    return null;
  }

  try {
    return createDbClient();
  } catch (error) {
    logger.error("catalog-store db init failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function mapActorToUserId(actor?: string): number | null {
  if (!actor) {
    return null;
  }
  const asNumber = Number.parseInt(actor, 10);
  return Number.isFinite(asNumber) ? asNumber : null;
}

async function findOrCreateProduct(db: NonNullable<ReturnType<typeof getDbClient>>, raw: Omit<ProductCatalogRecord, "id">): Promise<number> {
  const bank = normalizeStringInput(raw.bank);
  const productName = normalizeStringInput(raw.productName);
  const kind = normalizeProductKind(raw.productKind);

  const existing = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.bank, bank), eq(products.name, productName), eq(products.kind, kind)))
    .limit(1);

  if (existing.length > 0 && existing[0]?.id !== undefined) {
    return existing[0].id;
  }

  const inserted = await db
    .insert(products)
    .values({
      bank,
      name: productName,
      kind,
      regulatory_category: kind === "deposito" ? "bank_deposit" : "bank_account",
      active: true,
    })
    .returning({ id: products.id });

  const productId = inserted[0]?.id;
  if (!productId) {
    throw new Error("No fue posible guardar el producto base en DB.");
  }
  return productId;
}

async function persistPendingDraft(
  db: NonNullable<ReturnType<typeof getDbClient>>,
  raw: Omit<ProductCatalogRecord, "id">,
  options: AddManualCatalogProductOptions = {},
): Promise<ProductCatalogRecord> {
  const productId = await findOrCreateProduct(db, raw);
  let evidence = parseEvidenceEntries(options.evidence);
  if (evidence.length === 0 && options.sourceUrl) {
    evidence = [
      {
        field: "source_url",
        value: options.sourceUrl,
        evidence: options.sourceUrl,
        confidence: 0.6,
        source_url: options.sourceUrl,
      },
    ];
  }
  if (evidence.length === 0) {
    evidence = [
      {
        field: "submission",
        value: "manual-or-import submission",
        evidence: "No structured evidence was provided from source text",
        confidence: 0.5,
      },
    ];
  }

  const requirements = parseRequirements(options.requirements);
  const inserted = await db
    .insert(productVersions)
    .values({
      product_id: productId,
      valid_from: new Date(),
      valid_to: null,
      status: "pending_review",
      tae: toDbNumeric(raw.tae),
      tin: options.tin !== undefined ? toDbNumeric(options.tin) : null,
      max_balance: toDbNumeric(raw.maxBalance),
      min_balance: toDbNumeric(raw.minBalance),
      fees_json: options.feesDetail?.length ? options.feesDetail : [],
      requirements_json: requirements,
      duration_months: normalizeNullableNumeric(raw.durationMonths),
      bonus_amount: options.bonusAmount !== undefined ? toDbNumeric(options.bonusAmount) : null,
      permanencia: options.permanencia ?? null,
      cancellation_fees: options.cancellationFees ?? null,
      evidence_json: evidence,
      source_scrape_id: options.sourceScrapeId ?? null,
      review_notes: options.reviewNotes,
    })
    .returning({ id: productVersions.id });

  const versionId = inserted[0]?.id;
  if (!versionId) {
    throw new Error("No fue posible guardar la versión pendiente en DB.");
  }

  return {
    id: String(versionId),
    bank: raw.bank,
    productName: raw.productName,
    productKind: raw.productKind,
    tae: normalizeNumeric(raw.tae, 0),
    fees: normalizeNumeric(raw.fees, 0),
    minBalance: normalizeNumeric(raw.minBalance, 0),
    maxBalance: normalizeNullableNumeric(raw.maxBalance),
    durationMonths: normalizeNullableNumeric(raw.durationMonths),
    validTo: null,
    status: "pending_review",
    source: options.sourceUrl ? "manual-review" : raw.source,
    sourceUrl: options.sourceUrl ?? raw.sourceUrl,
    categoryLabel: raw.categoryLabel ?? raw.productKind,
    requiresPayroll: Boolean(requirements.nomina || requirements.requiresPayroll),
    requiresReceipts: Boolean(requirements.recibos || requirements.requiresReceipts || requirements.recibo),
    requiresBizum: Boolean(requirements.bizum),
    requiresConditions: Boolean(requirements.plan_pago || requirements.inversion || requirements.tarjeta),
    liquidity: typeof raw.liquidity === "number" ? raw.liquidity : raw.productKind === "deposito" ? 25 : 80,
  };
}

function toFileRecord(row: Omit<ProductCatalogRecord, "id">, options: AddManualCatalogProductOptions): ProductCatalogRecord {
  return {
    ...row,
    id: randomUUID(),
    status: "pending_review",
    source: normalizeStringInput(row.source ?? "manual-fallback"),
    sourceUrl: normalizeStringInput(options.sourceUrl || row.sourceUrl || ""),
    requiresPayroll: Boolean(row.requiresPayroll),
    requiresReceipts: Boolean(row.requiresReceipts),
    requiresBizum: Boolean(row.requiresBizum),
    requiresConditions: Boolean(row.requiresConditions),
    liquidity: typeof row.liquidity === "number" ? row.liquidity : row.productKind === "deposito" ? 25 : 80,
  };
}

export async function getApprovedCatalog(): Promise<ProductCatalogRecord[]> {
  const db = getDbClient();
  if (!db) {
    return sortCatalog(
      getCatalog().products.filter((product) => product.status === "approved" && product.validTo === null),
    );
  }

  try {
    const rows = await db
      .select({
        versionId: productVersions.id,
        bank: products.bank,
        name: products.name,
        kind: products.kind,
        status: productVersions.status,
        tae: productVersions.tae,
        min_balance: productVersions.min_balance,
        max_balance: productVersions.max_balance,
        duration_months: productVersions.duration_months,
        fees_json: productVersions.fees_json,
        requirements_json: productVersions.requirements_json,
        evidence_json: productVersions.evidence_json,
        valid_to: productVersions.valid_to,
        review_notes: productVersions.review_notes,
        created_at: productVersions.created_at,
        valid_from: productVersions.valid_from,
        source_scrape_id: productVersions.source_scrape_id,
        product_id: products.id,
      })
      .from(productVersions)
      .innerJoin(products, eq(products.id, productVersions.product_id))
      .where(and(eq(productVersions.status, "approved"), isNull(productVersions.valid_to)))
      .orderBy(desc(productVersions.created_at));

    if (rows.length > 0) {
      return sortCatalog(rows.map((row) => mapDbRowToCatalogRecord(row as CandidateDbRow)));
    }
  } catch (error) {
    logger.error("catalog-store fallback to file after DB error in getApprovedCatalog", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return sortCatalog(getCatalog().products.filter((product) => product.status === "approved" && product.validTo === null));
}

export async function getAllCatalog(): Promise<ProductCatalogRecord[]> {
  const db = getDbClient();
  if (!db) {
    return sortCatalog(getCatalog().products.slice());
  }

  try {
    const rows = await db
      .select({
        versionId: productVersions.id,
        bank: products.bank,
        name: products.name,
        kind: products.kind,
        status: productVersions.status,
        tae: productVersions.tae,
        min_balance: productVersions.min_balance,
        max_balance: productVersions.max_balance,
        duration_months: productVersions.duration_months,
        fees_json: productVersions.fees_json,
        requirements_json: productVersions.requirements_json,
        evidence_json: productVersions.evidence_json,
        valid_to: productVersions.valid_to,
        review_notes: productVersions.review_notes,
        created_at: productVersions.created_at,
        valid_from: productVersions.valid_from,
        source_scrape_id: productVersions.source_scrape_id,
        product_id: products.id,
      })
      .from(productVersions)
      .innerJoin(products, eq(products.id, productVersions.product_id))
      .orderBy(desc(productVersions.created_at));

    return sortCatalog(rows.map((row) => mapDbRowToCatalogRecord(row as CandidateDbRow)));
  } catch (error) {
    logger.error("catalog-store fallback to file after DB error in getAllCatalog", {
      error: error instanceof Error ? error.message : String(error),
    });
    return sortCatalog(getCatalog().products.slice());
  }
}

export async function getPendingCatalogDrafts(): Promise<PendingCatalogDraft[]> {
  const db = getDbClient();
  if (!db) {
    return sortCatalog(
      getCatalog().products.filter((product) => product.status === "pending_review" && product.validTo === null),
    ).map(mapFileRecordToPendingDraft);
  }

  try {
    const rows = await db
      .select({
        id: productVersions.id,
        productId: productVersions.product_id,
        bank: products.bank,
        productName: products.name,
        productKind: products.kind,
        tae: productVersions.tae,
        minBalance: productVersions.min_balance,
        maxBalance: productVersions.max_balance,
        durationMonths: productVersions.duration_months,
        evidence_json: productVersions.evidence_json,
        reviewNotes: productVersions.review_notes,
        createdAt: productVersions.created_at,
      })
      .from(productVersions)
      .innerJoin(products, eq(products.id, productVersions.product_id))
      .where(eq(productVersions.status, "pending_review"))
      .orderBy(desc(productVersions.created_at));

    return rows.map((row) => {
      const evidence = parseEvidenceEntries(row.evidence_json);
      return {
        id: String(row.id),
        productId: row.productId ?? 0,
        bank: row.bank,
        productName: row.productName,
        productKind: normalizeProductKind(row.productKind),
        tae: normalizeNumeric(row.tae, 0),
        fees: 0,
        minBalance: normalizeNumeric(row.minBalance, 0),
        maxBalance: normalizeNullableNumeric(row.maxBalance),
        durationMonths: normalizeNullableNumeric(row.durationMonths),
        sourceUrl: getEvidenceSourceUrl(evidence),
        reviewNotes: row.reviewNotes ?? null,
        evidenceCount: evidence.length,
        createdAt: row.createdAt ? row.createdAt.toISOString() : nowIso(),
      };
    });
  } catch (error) {
    logger.error("catalog-store pending list failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return sortCatalog(
      getCatalog().products.filter((product) => product.status === "pending_review" && product.validTo === null),
    ).map(mapFileRecordToPendingDraft);
  }
}

export async function addManualCatalogProduct(
  raw: Omit<ProductCatalogRecord, "id">,
  options: AddManualCatalogProductOptions = {},
): Promise<ProductCatalogRecord> {
  const normalizedRaw: Omit<ProductCatalogRecord, "id"> = {
    ...raw,
    bank: normalizeStringInput(raw.bank),
    productName: normalizeStringInput(raw.productName),
    productKind: normalizeProductKind(raw.productKind),
    tae: normalizeNumeric(raw.tae, 0),
    fees: normalizeNumeric(raw.fees, 0),
    minBalance: normalizeNumeric(raw.minBalance, 0),
    maxBalance: normalizeNullableNumeric(raw.maxBalance),
    durationMonths: normalizeNullableNumeric(raw.durationMonths),
    validTo: null,
    status: "pending_review",
    source: normalizeStringInput(raw.source || "manual"),
    sourceUrl: raw.sourceUrl,
    categoryLabel: raw.categoryLabel ?? raw.productKind,
    requiresPayroll: Boolean(raw.requiresPayroll),
    requiresReceipts: Boolean(raw.requiresReceipts),
    requiresBizum: Boolean(raw.requiresBizum),
    requiresConditions: Boolean(raw.requiresConditions),
    liquidity: typeof raw.liquidity === "number" ? raw.liquidity : undefined,
  };

  const db = getDbClient();
  if (db) {
    try {
      return await persistPendingDraft(db, normalizedRaw, options);
    } catch (error) {
      logger.error("addManualCatalogProduct persist failed in DB, using file fallback", {
        bank: normalizedRaw.bank,
        productName: normalizedRaw.productName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const catalog = getCatalog();
  const draftRecord = toFileRecord(normalizedRaw, options);
  catalog.products = catalog.products.filter((entry) => {
    if (
      entry.bank.toLowerCase() === normalizedRaw.bank.toLowerCase() &&
      entry.productName.toLowerCase() === normalizedRaw.productName.toLowerCase() &&
      entry.productKind === normalizedRaw.productKind
    ) {
      return false;
    }
    return true;
  });
  catalog.products.push(draftRecord);
  catalog.id = randomUUID();
  catalog.generatedAt = nowIso();
  persistCatalog(catalog);
  catalogCache = catalog;
  return draftRecord;
}

function approveCatalogDraftFromFile(
  versionIdRaw: string,
  reviewNotes?: string,
  actor?: string,
): CatalogDraftDecision | null {
  if (getDbClient()) {
    return null;
  }

  const catalog = getCatalog();
  const now = nowIso();
  const target = catalog.products.find((product) => product.id === versionIdRaw && product.status === "pending_review");
  if (!target) {
    return { ok: false, message: "La versiÃ³n no existe o ya no estÃ¡ en revisiÃ³n." };
  }

  catalog.products = catalog.products.map((product) => {
    if (product.id === target.id) {
      return { ...product, status: "approved", validTo: null };
    }
    const sameProduct =
      product.id !== target.id &&
      product.bank.toLowerCase() === target.bank.toLowerCase() &&
      product.productName.toLowerCase() === target.productName.toLowerCase() &&
      product.productKind === target.productKind &&
      product.status === "approved" &&
      product.validTo === null;
    if (sameProduct) {
      return { ...product, status: "superseded", validTo: now };
    }
    return product;
  });
  catalog.id = randomUUID();
  catalog.generatedAt = now;
  persistCatalog(catalog);
  catalogCache = catalog;
  logger.info("catalog file draft approved", {
    versionId: versionIdRaw,
    actor: actor ?? "admin",
    reviewNotesPresent: Boolean(reviewNotes),
  });
  return { ok: true, message: "VersiÃ³n aprobada y publicada para ranking." };
}

function rejectCatalogDraftFromFile(
  versionIdRaw: string,
  reviewNotes?: string,
  actor?: string,
): CatalogDraftDecision | null {
  if (getDbClient()) {
    return null;
  }

  const catalog = getCatalog();
  const target = catalog.products.find((product) => product.id === versionIdRaw && product.status === "pending_review");
  if (!target) {
    return { ok: false, message: "La versiÃ³n no existe o no estÃ¡ pendiente." };
  }

  catalog.products = catalog.products.map((product) =>
    product.id === target.id ? { ...product, status: "rejected" } : product,
  );
  catalog.id = randomUUID();
  catalog.generatedAt = nowIso();
  persistCatalog(catalog);
  catalogCache = catalog;
  logger.info("catalog file draft rejected", {
    versionId: versionIdRaw,
    actor: actor ?? "admin",
    reviewNotesPresent: Boolean(reviewNotes),
  });
  return { ok: true, message: "RevisiÃ³n rechazada y cerrada." };
}

export async function approveCatalogDraft(
  versionIdRaw: string,
  reviewNotes?: string,
  actor?: string,
): Promise<CatalogDraftDecision> {
  const fileDecision = approveCatalogDraftFromFile(versionIdRaw, reviewNotes, actor);
  if (fileDecision) {
    return fileDecision;
  }

  const versionId = Number.parseInt(versionIdRaw, 10);
  if (!Number.isFinite(versionId)) {
    return { ok: false, message: "ID de versión inválido." };
  }

  const db = getDbClient();
  if (!db) {
    return { ok: false, message: "No hay conexión DB para aprobar revisiones." };
  }

  try {
    const now = new Date();
    const actorId = mapActorToUserId(actor);
    const targetRows = await db
      .select({ id: productVersions.id, productId: productVersions.product_id })
      .from(productVersions)
      .where(and(eq(productVersions.id, versionId), eq(productVersions.status, "pending_review")))
      .limit(1);

    const target = targetRows[0];
    if (!target || target.productId === null) {
      return { ok: false, message: "La versión no existe o ya no está en revisión." };
    }
    const targetProductId = target.productId;

    await db.transaction(async (tx) => {
      await tx
        .update(productVersions)
        .set({
          status: "superseded",
          valid_to: now,
        })
        .where(
          and(
            eq(productVersions.product_id, targetProductId),
            eq(productVersions.status, "approved"),
            isNull(productVersions.valid_to),
          ),
        );

      await tx
        .update(productVersions)
        .set({
          status: "approved",
          approved_at: now,
          approved_by: actorId ?? undefined,
          review_notes: reviewNotes ?? null,
        })
        .where(eq(productVersions.id, target.id));

      await tx.insert(auditLog).values({
        action: "product_version_approved",
        entity_type: "product_version",
        entity_id: target.id,
        payload_json: {
          versionId: target.id,
          productId: targetProductId,
          actor: actor ?? "admin",
          reviewNotes,
        },
        actor: actor ?? "admin",
      });
    });

    return { ok: true, message: "Versión aprobada y publicada para ranking." };
  } catch (error) {
    logger.error("approveCatalogDraft failed", {
      versionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: "No se pudo aprobar la versión en este momento." };
  }
}

export async function rejectCatalogDraft(
  versionIdRaw: string,
  reviewNotes?: string,
  actor?: string,
): Promise<CatalogDraftDecision> {
  const fileDecision = rejectCatalogDraftFromFile(versionIdRaw, reviewNotes, actor);
  if (fileDecision) {
    return fileDecision;
  }

  const versionId = Number.parseInt(versionIdRaw, 10);
  if (!Number.isFinite(versionId)) {
    return { ok: false, message: "ID de versión inválido." };
  }

  const db = getDbClient();
  if (!db) {
    return { ok: false, message: "No hay conexión DB para rechazar revisiones." };
  }

  try {
    const now = new Date();
    const actorId = mapActorToUserId(actor);
    const targetRows = await db
      .select({ id: productVersions.id })
      .from(productVersions)
      .where(and(eq(productVersions.id, versionId), eq(productVersions.status, "pending_review")))
      .limit(1);

    if (targetRows.length === 0) {
      return { ok: false, message: "La versión no existe o no está pendiente." };
    }
    const target = targetRows[0];

    await db.transaction(async (tx) => {
      await tx
        .update(productVersions)
        .set({
          status: "rejected",
          rejected_at: now,
          rejected_by: actorId ?? undefined,
          review_notes: reviewNotes,
        })
        .where(eq(productVersions.id, target.id));

      await tx.insert(auditLog).values({
        action: "product_version_rejected",
        entity_type: "product_version",
        entity_id: target.id,
        payload_json: {
          versionId: target.id,
          actor: actor ?? "admin",
          reviewNotes,
        },
        actor: actor ?? "admin",
      });
    });

    return { ok: true, message: "Revisión rechazada y cerrada." };
  } catch (error) {
    logger.error("rejectCatalogDraft failed", {
      versionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: "No se pudo rechazar la versión en este momento." };
  }
}
