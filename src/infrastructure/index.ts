import { getScraperSourcesAsOf, getScrapeTargets, getMarketOffers } from "./scraper/source-manifest.js";
import { runSchedulerScan } from "./scraper/cycle.js";
import { loadLatestScrapeState } from "./scraper/state-store.js";
import { generateStructuredJson, generateText, getLlmConfig } from "./llm/client.js";
import {
  addManualCatalogProduct,
  approveCatalogDraft,
  getAllCatalog,
  getApprovedCatalog,
  getPendingCatalogDrafts,
  rejectCatalogDraft,
} from "./products/catalog-store.js";
import { extractManualConditions, extractPdfConditions } from "./products/condition-parser.js";
import { extractAssistantProfileFromQuestion } from "./products/assistant-parser.js";
import {
  queuePdfForProcessing,
  getPdfQueueSnapshot,
  dequeueNextPdf,
  peekNextPdf,
} from "./pdf/upload-queue.js";

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
    catalog: {
      getApprovedCatalog: typeof getApprovedCatalog;
      getAllCatalog: typeof getAllCatalog;
      approveCatalogDraft: typeof approveCatalogDraft;
      getPendingCatalogDrafts: typeof getPendingCatalogDrafts;
      rejectCatalogDraft: typeof rejectCatalogDraft;
      addManualCatalogProduct: typeof addManualCatalogProduct;
      extractManualConditions: typeof extractManualConditions;
      extractPdfConditions: typeof extractPdfConditions;
      extractAssistantProfileFromQuestion: typeof extractAssistantProfileFromQuestion;
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
    catalog: {
      getApprovedCatalog,
      getAllCatalog,
      approveCatalogDraft,
      getPendingCatalogDrafts,
      rejectCatalogDraft,
      addManualCatalogProduct,
      extractManualConditions,
      extractPdfConditions,
      extractAssistantProfileFromQuestion,
    },
};
}

export const infrastructureServices = createInfrastructureServices();

export { getScraperSourcesAsOf, getScrapeTargets, getMarketOffers };
export { runSchedulerScan, loadLatestScrapeState };
export { addManualCatalogProduct, getAllCatalog, getApprovedCatalog, getPendingCatalogDrafts, approveCatalogDraft, rejectCatalogDraft };
export { extractManualConditions, extractPdfConditions };
export { extractAssistantProfileFromQuestion };
export { queuePdfForProcessing, getPdfQueueSnapshot, dequeueNextPdf, peekNextPdf };
export { generateStructuredJson, generateText, getLlmConfig };

export type InfrastructureScanResult = ReturnType<typeof runSchedulerScan>;
