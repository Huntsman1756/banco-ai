import { logger } from "../../shared/logger";
import {
  diffCatalogSnapshots,
  type CatalogDelta,
  type MarketSnapshotRecord,
  type OfferConditionSignal,
} from "../../domain/market-change-detection";
import {
  buildHermesReviewPlan,
  type HermesReviewPlan,
  type HermesReviewSourceItem,
} from "../../domain/hermes-review";
import { getScrapeTargets } from "./source-manifest";
import type { MarketScrapeTarget } from "../../data/market-snapshot-2026-06-12";
import { fetchSourcePageText } from "./fetcher";
import { extractSignalsFromText } from "./offer-extractor";
import {
  buildCatalogSnapshot,
  loadLatestScrapeState,
  makeSourceSignature,
  persistScrapeState,
  type ScrapeRunState,
  type SourceScanSummary,
} from "./state-store";
import { getMarketOffers, MARKET_SNAPSHOT_2026_06_12 } from "../../data/market-snapshot-2026-06-12";

export type ScraperCycleChange = {
  type:
    | "new_source"
    | "changed_source"
    | "source_error"
    | "removed_source";
  sourceUrl: string;
  reason: string;
};

export type ScraperManualReviewItem = {
  sourceUrl: string;
  bank: string;
  productKind: string;
  kind:
    | "new_bank"
    | "removed_bank"
    | "new_product"
    | "removed_product"
    | "updated_product"
    | "source_new"
    | "source_changed"
    | "source_removed"
    | "source_error";
  section: string;
  reason: string;
  priority: "high" | "medium" | "low";
  focusAreas: string[];
};

export type ScraperCycleResult = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  catalogDelta: CatalogDelta;
  sourceChanges: ScraperCycleChange[];
  manualReviewItems: ScraperManualReviewItem[];
  hermesReviewPlan: HermesReviewPlan;
  sourcesScanned: number;
  sourcesWithErrors: number;
  requiresManualReviewCount: number;
};

const PRIORITY_RANK: Record<"high" | "medium" | "low", number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const UPDATED_SIGNAL_FOCUS: Record<OfferConditionSignal, string> = {
  financial_rate: "TAE y condiciones financieras",
  bonus_or_campaign: "Bonificaciones / campaña de bienvenida",
  payroll_requirement: "Requisito de nómina o ingresos recurrentes",
  nomina_requirement: "Condición vinculada a nómina",
  invoice_requirement: "Domiciliación de recibos",
  card_or_bizum: "Tarjeta o Bizum requerido",
  bonus_term_limit: "Permanencia o penalización de cancelación",
};

function sortByPriority<T extends { priority: "high" | "medium" | "low" }>(items: T[]): T[] {
  return [...items].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
}

function inferUpdatedProductPriority(signalDiffs: readonly OfferConditionSignal[] = []): "high" | "medium" | "low" {
  if (signalDiffs.includes("financial_rate") || signalDiffs.includes("nomina_requirement") || signalDiffs.includes("payroll_requirement")) {
    return "high";
  }
  if (
    signalDiffs.includes("bonus_or_campaign") ||
    signalDiffs.includes("bonus_term_limit") ||
    signalDiffs.includes("card_or_bizum") ||
    signalDiffs.includes("invoice_requirement")
  ) {
    return "medium";
  }
  return "low";
}

function inferUpdatedProductFocus(signalDiffs: readonly OfferConditionSignal[] = []): string[] {
  if (signalDiffs.length === 0) {
    return ["Revisión textual de condiciones comerciales y vigencia"];
  }
  return Array.from(new Set(signalDiffs.map((signal) => UPDATED_SIGNAL_FOCUS[signal])));
}

function inferSourceChangePriority(change: ScraperCycleChange): "high" | "medium" | "low" {
  if (change.type === "source_error") {
    return "high";
  }
  if (
    change.reason.toLowerCase().includes("blocked") ||
    change.reason.toLowerCase().includes("inaccessible") ||
    change.reason.toLowerCase().includes("robots")
  ) {
    return "high";
  }
  if (change.type === "changed_source") {
    return "medium";
  }
  return "low";
}

function inferSourceChangeFocus(change: ScraperCycleChange): string[] {
  if (change.type === "source_error") {
    return [
      "Revisión de estado HTTP y mensaje de error",
      "Comprobar robots.txt y posibles bloqueos de bot",
      "Confirmar disponibilidad manual de la página",
    ];
  }
  if (change.type === "changed_source") {
    return [
      "Comparar contenido visible y detectar si el cambio es estructural o comercial",
      "Verificar si el cambio afecta a condiciones de producto o a texto estático",
      "Validar que no sea ruido del sitio (navegación/footer)",
    ];
  }
  if (change.type === "new_source") {
    return [
      "Confirmar que la URL es oficial y se corresponde con un producto",
      "Asignar sección y cobertura de producto para evitar duplicados",
    ];
  }
  return [
    "Verificar si el source desaparecido se consolidó en otro dominio o fue temporal",
    "Registrar posible expiración y fallback disponible",
  ];
}

function normalizeTargetUrl(input: string): string {
  return input.replace(/\/+$/, "").toLowerCase();
}

function buildRunId(now: Date): string {
  return `run-${now.toISOString()}`;
}

function buildSourceChanges(previous: ScrapeRunState | null, current: ScrapeRunState): ScraperCycleChange[] {
  const previousMap = new Map<string, { signature: string; fetchStatus: SourceScanSummary["fetchStatus"] }>();
  if (previous) {
    for (const item of previous.scansBySource) {
      previousMap.set(normalizeTargetUrl(item.sourceUrl), {
        signature: item.signature,
        fetchStatus: item.fetchStatus,
      });
    }
  }

  const currentMap = new Map<string, SourceScanSummary>();
  for (const item of current.scansBySource) {
    currentMap.set(normalizeTargetUrl(item.sourceUrl), item);
  }

  const changes: ScraperCycleChange[] = [];

  for (const [url, currentItem] of currentMap.entries()) {
    const normalized = normalizeTargetUrl(url);
    const prevSignature = previousMap.get(normalized);
    if (!prevSignature) {
      changes.push({
        type: "new_source",
        sourceUrl: currentItem.sourceUrl,
        reason: "new source URL detected",
      });
      continue;
    }
    if (currentItem.fetchStatus !== "ok") {
      changes.push({
        type: "source_error",
        sourceUrl: currentItem.sourceUrl,
        reason: `fetch failed with status ${currentItem.fetchStatus}${currentItem.error ? ` (${currentItem.error})` : ""}`,
      });
      continue;
    }
    if (prevSignature.fetchStatus !== "ok" && currentItem.fetchStatus === "ok") {
      changes.push({
        type: "changed_source",
        sourceUrl: currentItem.sourceUrl,
        reason: "source recovered after previous scrape failure",
      });
      continue;
    }
    if (prevSignature.signature !== currentItem.signature) {
      changes.push({
        type: "changed_source",
        sourceUrl: currentItem.sourceUrl,
        reason: "financially relevant text changed",
      });
      continue;
    }
  }

  if (previous) {
    for (const prevUrl of previousMap.keys()) {
      if (!currentMap.has(prevUrl)) {
        changes.push({
          type: "removed_source",
          sourceUrl: prevUrl,
          reason: "source not found in current run",
        });
      }
    }
  }

  return changes;
}

function catalogChangeToReviewItems(catalogDelta: CatalogDelta): ScraperManualReviewItem[] {
  const result: ScraperManualReviewItem[] = [];
  for (const change of catalogDelta.changes) {
    if (change.kind === "updated_product") {
      result.push({
        sourceUrl: change.sourceUrl,
        bank: change.bank,
        productKind: change.productKind,
        kind: "updated_product",
        section: change.section,
        reason: `Condiciones financieras modificadas: ${change.reason}`,
        priority: inferUpdatedProductPriority(change.signalDiffs ?? []),
        focusAreas: inferUpdatedProductFocus(change.signalDiffs ?? []),
      });
      continue;
    }

    if (change.kind === "new_product") {
      const priority: "high" | "medium" = change.reason.includes("new bank") ? "high" : "medium";
      result.push({
        sourceUrl: change.sourceUrl,
        bank: change.bank,
        productKind: change.productKind,
        kind: "new_product",
        section: change.section,
        reason: `Producto nuevo detectado: ${change.reason}`,
        priority,
        focusAreas: ["TAE, límite, requisitos y bonificaciones iniciales"],
      });
      continue;
    }

    if (change.kind === "removed_product") {
      result.push({
        sourceUrl: change.sourceUrl,
        bank: change.bank,
        productKind: change.productKind,
        kind: "removed_product",
        section: change.section,
        reason: `Producto desaparecido del catalogo: ${change.reason}`,
        priority: "low",
        focusAreas: ["Comprobar si la retirada está comunicada oficialmente o es error de scrapeo"],
      });
      continue;
    }

    if (change.kind === "new_bank") {
      result.push({
        sourceUrl: "",
        bank: change.bank,
        productKind: change.productKind,
        kind: "new_bank",
        section: change.section,
        reason: `Nuevo banco detectado en el snapshot: ${change.reason}`,
        priority: "high",
        focusAreas: ["Validar entrada oficial, cobertura y fecha de vigencia"],
      });
      continue;
    }

    result.push({
      sourceUrl: change.sourceUrl,
      bank: change.bank,
      productKind: change.productKind,
      kind: "removed_bank",
      section: change.section,
      reason: `Banco que ya no aparece: ${change.reason}`,
      priority: "low",
      focusAreas: ["Confirmar cierre, rebranding o baja real del banco"],
    });
  }
  return sortByPriority(result);
}

function sourceChangeToReviewItems(sourceChanges: ScraperCycleChange[]): ScraperManualReviewItem[] {
  return sourceChanges.map((change) => {
    const normalizedReason = change.reason.toLowerCase();
    const kind =
      change.type === "changed_source"
        ? ("source_changed" as const)
        : change.type === "source_error"
          ? ("source_error" as const)
          : change.type === "new_source"
            ? ("source_new" as const)
            : ("source_removed" as const);

    return {
      sourceUrl: change.sourceUrl,
      bank: "",
      productKind: "scrape_source",
      kind,
      section: "scraper",
      reason: normalizedReason.includes("source recovered after previous scrape failure")
        ? "Revisión de recuperación tras error previo"
        : normalizedReason,
      priority: inferSourceChangePriority(change),
      focusAreas: inferSourceChangeFocus(change),
    };
  });
}

async function scanSourceBatch(sources: readonly MarketScrapeTarget[]): Promise<SourceScanSummary[]> {
  const scans: SourceScanSummary[] = [];
  for (const source of sources) {
    const result = await fetchSourcePageText(source.sourceUrl);
    const signatureSeed = {
      rates: [],
      hasRemuneratedAccount: false,
      hasDeposit: false,
      hasPayroll: false,
      snippet: "",
    };
    if (!result.ok) {
      scans.push({
        sourceUrl: source.sourceUrl,
        bankName: source.bankName,
        productKind: source.productKind,
        hasSpanishIban: source.hasSpanishIban,
        fetchedAt: new Date().toISOString(),
        fetchStatus: result.status === 403 ? "blocked_robots" : result.status === 0 ? "error" : "http_error",
        signature: makeSourceSignature(signatureSeed),
        rates: [],
        hasPromotedSignals: false,
        hasRemuneratedAccount: false,
        hasDeposit: false,
        hasPayroll: false,
        snippet: "",
        error: result.error,
      });
      continue;
    }

    const signals = extractSignalsFromText(result.text);
    const signature = makeSourceSignature({
      rates: signals.rates,
      hasRemuneratedAccount: signals.hasRemuneratedAccount,
      hasDeposit: signals.hasDeposit,
      hasPayroll: signals.hasPayroll,
      snippet: signals.snippet,
    });
    scans.push({
      sourceUrl: source.sourceUrl,
      bankName: source.bankName,
      productKind: source.productKind,
      hasSpanishIban: source.hasSpanishIban,
      fetchedAt: new Date().toISOString(),
      fetchStatus: "ok",
      signature,
      rates: signals.rates,
      hasPromotedSignals: signals.hasPromotionSignals,
      hasRemuneratedAccount: signals.hasRemuneratedAccount,
      hasDeposit: signals.hasDeposit,
      hasPayroll: signals.hasPayroll,
      snippet: signals.snippet,
    });
  }
  return scans;
}

function groupByDomain<T extends { sourceUrl: string }>(targets: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const target of targets) {
    const domain = new URL(target.sourceUrl).hostname;
    const bucket = map.get(domain) ?? [];
    bucket.push(target);
    map.set(domain, bucket);
  }
  return map;
}

export async function runSchedulerScan(
  asOfDate = MARKET_SNAPSHOT_2026_06_12.asOfDate,
  options?: { maxSources?: number; ignoreRemovedSources?: boolean },
): Promise<ScraperCycleResult> {
  const now = new Date();
  const runId = buildRunId(now);
  const startedAt = now.toISOString();
  const snapshotOffers = getMarketOffers();
  const catalog: MarketSnapshotRecord = buildCatalogSnapshot(snapshotOffers, asOfDate);
  const sourceTargetsAll = getScrapeTargets();
  const sourceTargets =
    options?.maxSources && options.maxSources > 0 ? sourceTargetsAll.slice(0, options.maxSources) : sourceTargetsAll;

  const scansByDomain = groupByDomain(sourceTargets);
  const scanned: SourceScanSummary[] = [];
  for (const [, group] of scansByDomain.entries()) {
    const sorted = [...group].sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl));
    const groupScans = await scanSourceBatch(sorted);
    scanned.push(...groupScans);
  }

  const currentRun: ScrapeRunState = {
    runId,
    sourceAsOfDate: asOfDate,
    generatedAt: new Date().toISOString(),
    sourceCount: scanned.length,
    scansBySource: scanned,
    catalogSnapshot: catalog,
  };

  const previousRun = await loadLatestScrapeState();
  const catalogDelta = diffCatalogSnapshots(previousRun?.catalogSnapshot ?? { asOfDate: "1970-01-01", offers: [] }, catalog);
  const sourceChanges = buildSourceChanges(
    previousRun,
    currentRun,
  ).filter((change) => {
    if (options?.ignoreRemovedSources === true && change.type === "removed_source") {
      return false;
    }
    return true;
  });
  const manualReviewItems = sortByPriority([
    ...catalogChangeToReviewItems(catalogDelta),
    ...sourceChangeToReviewItems(sourceChanges),
  ]);
  const hermesInputs: HermesReviewSourceItem[] = manualReviewItems.map((item) => ({
    sourceUrl: item.sourceUrl,
    bank: item.bank,
    productKind: item.productKind,
    kind: item.kind as HermesReviewSourceItem["kind"],
    section: item.section,
    reason: item.reason,
    priority: item.priority,
    focusAreas: item.focusAreas,
  }));
  const hermesReviewPlan = buildHermesReviewPlan(runId, hermesInputs);
  await persistScrapeState({ ...currentRun, hermesReviewPlan });

  const requiresManualReviewCount = manualReviewItems.length;
  const hasHighPriorityReviews = manualReviewItems.some((item) => item.priority === "high");

  logger.info("scraper cycle completed", {
    runId,
    sourceCount: sourceTargets.length,
    scanned: scanned.length,
    catalogDelta: {
      newBanks: catalogDelta.newBankCount,
      newProducts: catalogDelta.newProductCount,
      updatedProducts: catalogDelta.updatedProductCount,
      removedProducts: catalogDelta.removedProductCount,
      removedBanks: catalogDelta.removedBankCount,
    },
    sourceChanges: {
      total: sourceChanges.length,
      new: sourceChanges.filter((item) => item.type === "new_source").length,
      changed: sourceChanges.filter((item) => item.type === "changed_source").length,
      removed: sourceChanges.filter((item) => item.type === "removed_source").length,
      review: requiresManualReviewCount,
    },
    manualReviewPriority: hasHighPriorityReviews ? "high" : "low",
  });

  return {
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    catalogDelta,
    sourceChanges,
    manualReviewItems,
    hermesReviewPlan,
    sourcesScanned: scanned.length,
    sourcesWithErrors: scanned.filter((scan) => scan.fetchStatus !== "ok").length,
    requiresManualReviewCount,
  };
}
