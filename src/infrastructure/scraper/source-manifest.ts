import { getScrapeTargets as getRawScrapeTargets, getMarketOffers, type MarketScrapeTarget } from "../../data/market-snapshot-2026-06-12";
import { normalizeBankName } from "../../domain/market-change-detection";

function normalizeTargetUrl(input: string): string {
  try {
    const parsed = new URL(input);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  } catch {
    return input.replace(/\/+$/, "").toLowerCase();
  }
}

export { getMarketOffers };

export function getScrapeTargets(): readonly MarketScrapeTarget[] {
  const byKey = new Map<string, MarketScrapeTarget>();
  for (const target of getRawScrapeTargets()) {
    const canonicalBank = normalizeBankName(target.bankName).canonicalName;
    const normalizedUrl = normalizeTargetUrl(target.sourceUrl);
    const key = `${canonicalBank}|${normalizedUrl}|${target.productKind}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...target,
        bankName: target.bankName,
        sourceUrl: normalizedUrl,
        sectionSummary: target.sectionSummary,
        offerCount: target.offerCount,
      });
      continue;
    }
    existing.offerCount += target.offerCount;
    if (!existing.sectionSummary.includes(target.sectionSummary)) {
      existing.sectionSummary = `${existing.sectionSummary},${target.sectionSummary}`;
    }
  }
  return Array.from(byKey.values());
}

export function getScraperSourcesAsOf(_date: string): readonly MarketScrapeTarget[] {
  void _date;
  return getScrapeTargets();
}
