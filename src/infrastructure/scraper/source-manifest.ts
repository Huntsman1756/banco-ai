/**
 * Source manifest for Banco AI scraper.
 * 
 * Defines public bank pages to scrape for product conditions.
 * Each source has: bank name, product kind, URL, and expected fields.
 * 
 * This manifest is the single source of truth for scraper targets.
 * Financial changes detected by scraper create pending_review items.
 * Nothing is auto-approved.
 */

export type ScraperSource = {
  id: string;
  bank: string;
  productKind: "cuenta_remunerada" | "cuenta_nomina" | "deposito" | "cuenta";
  sourceUrl: string;
  description: string;
  expectedFields: Array<{
    field: string;
    type: "tae" | "fees" | "minBalance" | "maxBalance" | "durationMonths" | "condition";
  }>;
  lastScrapedAt?: string;
  lastScrapeStatus?: "ok" | "error" | "blocked";
  lastScrapeFingerprint?: string;
};

/**
 * Returns the canonical list of scraper sources.
 * Sources are manually curated from public bank pages.
 */
export function getScraperSources(): readonly ScraperSource[] {
  return [
    {
      id: "cajamar-remunerada",
      bank: "Cajamar",
      productKind: "cuenta_remunerada",
      sourceUrl: "https://www.cajamar.com/particulares/productos/cuentas/cuenta-online.html",
      description: "Cuenta Online Cajamar - condiciones y TAE",
      expectedFields: [
        { field: "tae", type: "tae" },
        { field: "fees", type: "fees" },
        { field: "minBalance", type: "minBalance" },
        { field: "condition_vinculacion", type: "condition" },
      ],
    },
    {
      id: "n26-ahorro",
      bank: "N26",
      productKind: "cuenta_remunerada",
      sourceUrl: "https://n26.com/es-es/eu/savings-account",
      description: "N26 Savings Account - TAE y condiciones",
      expectedFields: [
        { field: "tae", type: "tae" },
        { field: "fees", type: "fees" },
        { field: "minBalance", type: "minBalance" },
        { field: "maxBalance", type: "maxBalance" },
      ],
    },
    {
      id: "pibank-remunerada",
      bank: "Pibank",
      productKind: "cuenta_remunerada",
      sourceUrl: "https://www.pibank.es/particulares/cuentas/cuenta-remunerada.html",
      description: "Cuenta Remunerada Pibank",
      expectedFields: [
        { field: "tae", type: "tae" },
        { field: "fees", type: "fees" },
        { field: "condition_nomina", type: "condition" },
      ],
    },
    {
      id: "pibank-ahorro",
      bank: "Pibank",
      productKind: "cuenta_remunerada",
      sourceUrl: "https://www.pibank.es/particulares/cuentas/cuenta-ahorro.html",
      description: "Cuenta Ahorro Pibank - sin condiciones",
      expectedFields: [
        { field: "tae", type: "tae" },
        { field: "fees", type: "fees" },
      ],
    },
    {
      id: "wizink-ahorro",
      bank: "WiZink",
      productKind: "cuenta_remunerada",
      sourceUrl: "https://www.wizink.es/particulares/cuentas/cuenta-ahorro.html",
      description: "Cuenta de Ahorro WiZink",
      expectedFields: [
        { field: "tae", type: "tae" },
        { field: "fees", type: "fees" },
      ],
    },
    {
      id: "bankinter-remunerada",
      bank: "Bankinter",
      productKind: "cuenta_remunerada",
      sourceUrl: "https://www.bankinter.com/hamburguesa/particulares/productos/cuentas/cuenta-no-nomina",
      description: "Cuenta No-nómina Bankinter",
      expectedFields: [
        { field: "tae", type: "tae" },
        { field: "fees", type: "fees" },
        { field: "minBalance", type: "minBalance" },
        { field: "maxBalance", type: "maxBalance" },
        { field: "condition_nomina", type: "condition" },
      ],
    },
    {
      id: "globalcaja-online",
      bank: "Globalcaja",
      productKind: "cuenta_remunerada",
      sourceUrl: "https://www.globalcaja.es/particulares/cuentas/cuenta-online.html",
      description: "Cuenta Online Globalcaja",
      expectedFields: [
        { field: "tae", type: "tae" },
        { field: "fees", type: "fees" },
        { field: "minBalance", type: "minBalance" },
        { field: "maxBalance", type: "maxBalance" },
      ],
    },
    {
      id: "ing-deposito-bienvenida",
      bank: "ING",
      productKind: "cuenta_remunerada",
      sourceUrl: "https://www.ing.es/particulares/productos/cuentas/ing-ahorro-clientes-nuevos",
      description: "Depósito Bienvenida ING",
      expectedFields: [
        { field: "tae", type: "tae" },
        { field: "fees", type: "fees" },
        { field: "durationMonths", type: "durationMonths" },
      ],
    },
    {
      id: "kutxabank-remunerada",
      bank: "Kutxabank",
      productKind: "cuenta_remunerada",
      sourceUrl: "https://www.kutxabank.es/es/personas/productos/cuentas/cuenta-remunerada",
      description: "Cuenta Remunerada Kutxabank",
      expectedFields: [
        { field: "tae", type: "tae" },
        { field: "fees", type: "fees" },
      ],
    },
    {
      id: "march-avantio",
      bank: "March",
      productKind: "cuenta_remunerada",
      sourceUrl: "https://www.bmarch.es/particulares/cuentas/cuenta-online-avantio",
      description: "Cuenta Online Avantio Banca March",
      expectedFields: [
        { field: "tae", type: "tae" },
        { field: "fees", type: "fees" },
        { field: "minBalance", type: "minBalance" },
        { field: "maxBalance", type: "maxBalance" },
      ],
    },
    {
      id: "revolut-remunerada",
      bank: "Revolut",
      productKind: "cuenta_remunerada",
      sourceUrl: "https://www.revolut.com/es-es/home/savings/",
      description: "Cuenta Remunerada Revolut - TAE promocional",
      expectedFields: [
        { field: "tae", type: "tae" },
        { field: "fees", type: "fees" },
        { field: "maxBalance", type: "maxBalance" },
        { field: "condition_promo_end", type: "condition" },
      ],
    },
    {
      id: "sabadell-online",
      bank: "Sabadell",
      productKind: "cuenta_remunerada",
      sourceUrl: "https://www.bancosabadell.com/particulares/productos/cuentas/cuenta-online.html",
      description: "Cuenta Online Sabadell",
      expectedFields: [
        { field: "tae", type: "tae" },
        { field: "fees", type: "fees" },
        { field: "condition_bonos", type: "condition" },
      ],
    },
    {
      id: "trade-republic-efectivo",
      bank: "Trade Republic",
      productKind: "cuenta_remunerada",
      sourceUrl: "https://traderepublic.com/es-es/savings-account",
      description: "Cuenta Remunerada Trade Republic - efectivo",
      expectedFields: [
        { field: "tae", type: "tae" },
        { field: "fees", type: "fees" },
        { field: "minBalance", type: "minBalance" },
        { field: "maxBalance", type: "maxBalance" },
      ],
    },
    {
      id: "volkswagen-bank-remunerada",
      bank: "Volkswagen Bank",
      productKind: "cuenta_remunerada",
      sourceUrl: "https://www.volkswagenbank.com/es/cuenta-de-alta-remuneracion",
      description: "Cuenta de Alta Remuneración Volkswagen Bank",
      expectedFields: [
        { field: "tae", type: "tae" },
        { field: "fees", type: "fees" },
      ],
    },
  ];
}

/**
 * Returns sources filtered by product kind.
 */
export function getScraperSourcesByKind(kind: ScraperSource["productKind"]): readonly ScraperSource[] {
  return getScraperSources().filter((s) => s.productKind === kind);
}

/**
 * Returns sources that haven't been scraped yet or need rescraping.
 */
export function getPendingScraperSources(lastScrapeThresholdMs: number): readonly ScraperSource[] {
  const now = Date.now();
  return getScraperSources().filter((source) => {
    if (!source.lastScrapedAt) return true;
    const last = new Date(source.lastScrapedAt).getTime();
    return now - last > lastScrapeThresholdMs;
  });
}

/**
 * DEPRECATED: Compatibility stub for legacy code.
 * Returns the market snapshot as scrape targets.
 */
import type { MarketScrapeTarget, MarketOffer } from "../../data/market-snapshot-2026-06-12.js";
import { MARKET_SNAPSHOT_2026_06_12 } from "../../data/market-snapshot-2026-06-12.js";
import { normalizeBankName } from "../../domain/market-change-detection.js";

function normalizeTargetUrl(input: string): string {
  try {
    const parsed = new URL(input);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  } catch {
    return input.replace(/\/+$/, "").toLowerCase();
  }
}

export function getScrapeTargets(): readonly MarketScrapeTarget[] {
  const byKey = new Map<string, MarketScrapeTarget>();
  for (const offer of MARKET_SNAPSHOT_2026_06_12.offers) {
    const canonicalBank = normalizeBankName(offer.bank).canonicalName;
    const normalizedUrl = normalizeTargetUrl(offer.sourceUrl);
    const key = `${canonicalBank}|${normalizedUrl}|${offer.productKind}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        bankName: offer.bank,
        productKind: offer.productKind,
        sourceUrl: normalizedUrl,
        hasSpanishIban: offer.hasSpanishIban,
        offerCount: 1,
        sectionSummary: offer.section,
      });
    } else {
      existing.offerCount += 1;
    }
  }
  return Array.from(byKey.values());
}

export function getMarketOffers(): readonly MarketOffer[] {
  return MARKET_SNAPSHOT_2026_06_12.offers;
}

export function getScraperSourcesAsOf(_date: string): readonly MarketScrapeTarget[] {
  void _date;
  return getScrapeTargets();
}
