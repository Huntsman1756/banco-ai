import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import type { MarketOfferRecord, MarketSnapshotRecord } from "../../domain/market-change-detection.js";
import type { HermesReviewPlan } from "../../domain/hermes-review.js";

export type SourceScanSummary = {
  sourceUrl: string;
  bankName: string;
  productKind: string;
  hasSpanishIban: boolean;
  fetchedAt: string;
  fetchStatus: "ok" | "blocked_robots" | "http_error" | "timeout" | "error";
  signature: string;
  rates: number[];
  hasPromotedSignals: boolean;
  hasRemuneratedAccount: boolean;
  hasDeposit: boolean;
  hasPayroll: boolean;
  snippet: string;
  error?: string;
};

export type ScrapeRunState = {
  runId: string;
  sourceAsOfDate: string;
  generatedAt: string;
  sourceCount: number;
  scansBySource: SourceScanSummary[];
  catalogSnapshot: MarketSnapshotRecord;
  hermesReviewPlan?: HermesReviewPlan;
};

const STATE_PATH = join(process.cwd(), "data", "scrape", "latest-market-scan.json");

function makeSignature(parts: object): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export function makeSourceSignature(scan: Pick<SourceScanSummary, "rates" | "hasRemuneratedAccount" | "hasDeposit" | "hasPayroll" | "snippet">): string {
  return makeSignature(scan);
}

export async function loadLatestScrapeState(): Promise<ScrapeRunState | null> {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    return JSON.parse(raw) as ScrapeRunState;
  } catch {
    return null;
  }
}

export async function persistScrapeState(state: ScrapeRunState): Promise<void> {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function buildCatalogSnapshot(offers: readonly MarketOfferRecord[], asOfDate: string): MarketSnapshotRecord {
  return {
    asOfDate,
    offers: [...offers],
  };
}

