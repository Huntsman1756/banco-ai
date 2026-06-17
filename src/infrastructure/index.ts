import { getScraperSourcesAsOf, getScrapeTargets, getMarketOffers } from "./scraper/source-manifest";
import { runSchedulerScan } from "./scraper/cycle";
import { loadLatestScrapeState } from "./scraper/state-store";
import { generateStructuredJson, generateText, getLlmConfig } from "./llm/client";
import {
  queuePdfForProcessing,
  getPdfQueueSnapshot,
  dequeueNextPdf,
  peekNextPdf,
} from "./pdf/upload-queue";

export type InfrastructureServices = {
  scraper: {
    runSchedulerScan: typeof runSchedulerScan;
    loadLatestScrapeState: typeof loadLatestScrapeState;
    getScrapeTargets: typeof getScrapeTargets;
  };
  offers: {
    getScraperSourcesAsOf: typeof getScraperSourcesAsOf;
    getMarketOffers: typeof getMarketOffers;
  };
  llm: {
    generateStructuredJson: typeof generateStructuredJson;
    generateText: typeof generateText;
    getLlmConfig: typeof getLlmConfig;
  };
  pdf: {
    queuePdfForProcessing: typeof queuePdfForProcessing;
    getPdfQueueSnapshot: typeof getPdfQueueSnapshot;
    dequeueNextPdf: typeof dequeueNextPdf;
    peekNextPdf: typeof peekNextPdf;
  };
};

export function createInfrastructureServices(): InfrastructureServices {
  return {
    scraper: {
      runSchedulerScan,
      loadLatestScrapeState,
      getScrapeTargets,
    },
    offers: {
      getScraperSourcesAsOf,
      getMarketOffers,
    },
    llm: {
      generateStructuredJson,
      generateText,
      getLlmConfig,
    },
    pdf: {
      queuePdfForProcessing,
      getPdfQueueSnapshot,
      dequeueNextPdf,
      peekNextPdf,
    },
  };
}

export const infrastructureServices = createInfrastructureServices();

export { getScraperSourcesAsOf, getScrapeTargets, getMarketOffers };
export { runSchedulerScan, loadLatestScrapeState };
export { queuePdfForProcessing, getPdfQueueSnapshot, dequeueNextPdf, peekNextPdf };
export { generateStructuredJson, generateText, getLlmConfig };

export type InfrastructureScanResult = ReturnType<typeof runSchedulerScan>;
