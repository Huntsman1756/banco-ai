import {
  getScrapeTargets,
  MARKET_SNAPSHOT_2026_06_12,
} from "../src/data/market-snapshot-2026-06-12";
import { logger } from "../src/shared/logger";

type SectionStats = {
  section: string;
  count: number;
};

function buildSectionStats() {
  const bySection = new Map<string, number>();
  for (const offer of MARKET_SNAPSHOT_2026_06_12.offers) {
    bySection.set(offer.section, (bySection.get(offer.section) ?? 0) + 1);
  }
  return Array.from(bySection.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([section, count]) => ({ section, count } satisfies SectionStats));
}

function printReadable() {
  const sectionStats = buildSectionStats();
  const sources = getScrapeTargets();
  const needsVerification = MARKET_SNAPSHOT_2026_06_12.offers.filter((offer) => (offer as { requiresVerification?: boolean }).requiresVerification);

  logger.info("market catalog snapshot loaded", {
    asOfDate: MARKET_SNAPSHOT_2026_06_12.asOfDate,
    nextUpdateExpected: MARKET_SNAPSHOT_2026_06_12.nextUpdateExpected,
    totalOffers: MARKET_SNAPSHOT_2026_06_12.offers.length,
    totalSources: sources.length,
    needsVerification: needsVerification.length,
    sectionStats,
  });
}

function printJson() {
  console.log(JSON.stringify(MARKET_SNAPSHOT_2026_06_12, null, 2));
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--json")) {
    printJson();
    return;
  }
  printReadable();
}

main();
