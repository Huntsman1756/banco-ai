/**
 * Offer extractor for Banco AI scraper.
 * 
 * Extracts structured financial fields from scraped HTML text.
 * Detects changes vs last scrape and creates manual review items.
 * Never auto-approves financial fields — all changes go to pending_review.
 */

import { normalizeBankName } from "../../domain/market-change-detection.js";
import type { ScraperSource } from "./source-manifest.js";

export type ExtractedField = {
  field: string;
  type: "tae" | "fees" | "balance" | "condition";
  rawValue: string;
  normalizedValue: number | boolean | null;
};

export type ScraperOfferSignal = {
  bank: string;
  productKind: string;
  field: string;
  signalType: "new" | "updated" | "removed" | "unchanged";
  oldValue: number | boolean | null;
  newValue: number | boolean | null;
  confidence: number;
  requiresVerification: boolean;
};

export type ScraperManualReviewItem = {
  sourceId: string;
  bank: string;
  productKind: string;
  sourceUrl: string;
  signal: ScraperOfferSignal;
  focusAreas: string[];
  estimatedEffort: "low" | "medium" | "high";
  checksToConfirm: string[];
};

/**
 * Extracts TAE values from text. Looks for patterns like "1,76% TAE", "TAE 2,5%", etc.
 */
export function extractTaeFromText(text: string): number | null {
  const patterns = [
    /(\d{1,3}[.,]\d{1,2})\s*%\s*TAE/i,
    /TAE\s*(\d{1,3}[.,]\d{1,2})\s*%/i,
    /tasa?\s*(?:de\s*)?(\d{1,3}[.,]\d{1,2})\s*%/i,
    /(\d{1,3}[.,]\d{1,2})\s*%\s*rentabilidad/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const raw = match[1].replace(",", ".");
      const value = parseFloat(raw);
      if (value > 0 && value < 100) {
        return value;
      }
    }
  }
  
  return null;
}

/**
 * Extracts fee values from text. Looks for patterns like "0€ comisiones", "sin comisiones".
 */
export function extractFeesFromText(text: string): number {
  // Check for "sin comisiones" or "no comisiones"
  if (/sin\s+comisiones/i.test(text) || /no\s+comisiones/i.test(text) || /comisiones?\s*0\s*€/i.test(text)) {
    return 0;
  }
  
  // Try to find explicit fee amount
  const match = text.match(/comisiones?\s*(\d{1,3}[.,]\d{0,2})\s*€/i);
  if (match) {
    const raw = match[1].replace(",", ".");
    return parseFloat(raw);
  }
  
  return 0;
}

/**
 * Extracts balance limits from text.
 */
export function extractBalanceInfo(text: string): { minBalance: number | null; maxBalance: number | null } {
  const minMatch = text.match(/saldo\s*(?:mín?imo| minimo)\s*(\d{1,6}[.,]\d{0,2})\s*€/i);
  const maxMatch = text.match(/(?:hasta|max(?:imo)?)\s*(?:importe|saldo|cantidad)\s*(\d{1,6}[.,]\d{0,2})\s*€/i);
  
  return {
    minBalance: minMatch ? parseFloat(minMatch[1].replace(",", ".")) : null,
    maxBalance: maxMatch ? parseFloat(maxMatch[1].replace(",", ".")) : null,
  };
}

/**
 * Extracts duration/plazo from text.
 */
export function extractDurationFromText(text: string): number | null {
  const match = text.match(/(?:plazo|vigencia|permanencia)\s*(\d{1,2})\s*(?:mes|meses|ms?)/i);
  if (match) {
    const value = parseInt(match[1], 10);
    if (value > 0 && value < 60) {
      return value;
    }
  }
  return null;
}

/**
 * Detects special conditions from text.
 */
export function extractConditionsFromText(text: string): Record<string, boolean> {
  return {
    requiresPayroll: /(?:requiere|necesita|vincula|condiciona).*(?:nomina|nómina|incorporar)/i.test(text),
    requiresReceipts: /(?:requiere|necesita|condiciona).*(?:recibo|justificante|comprobante)/i.test(text),
    requiresBizum: /(?:requiere|necesita|condiciona).*(?:bizum)/i.test(text),
    promoEnded: /(?:promoción|promocional|tasa mejorada|tasa especial).+(?:finaliza|vige|hasta|vigente).+(\d{4}[-/]\d{2}[-/]\d{2})/i.test(text),
    newClientOnly: /(?:solo|exclusivo).*(?:nuevo|nueva|reciente)/i.test(text),
  };
}

/**
 * Main extraction function - extracts all financial fields from scraped HTML text.
 * Returns structured extraction result.
 */
export function extractFinancialFields(text: string, _source: ScraperSource): ExtractedField[] {
  const tae = extractTaeFromText(text);
  const fees = extractFeesFromText(text);
  const balance = extractBalanceInfo(text);
  const duration = extractDurationFromText(text);
  const conditions = extractConditionsFromText(text);
  
  const fields: ExtractedField[] = [];
  
  if (tae !== null) {
    fields.push({ field: "tae", type: "tae", rawValue: `${tae}%`, normalizedValue: tae });
  }
  
  if (fees > 0) {
    fields.push({ field: "fees", type: "fees", rawValue: `${fees}€`, normalizedValue: fees });
  }
  
  if (balance.minBalance !== null) {
    fields.push({ field: "minBalance", type: "balance", rawValue: `${balance.minBalance}€`, normalizedValue: balance.minBalance });
  }
  
  if (balance.maxBalance !== null) {
    fields.push({ field: "maxBalance", type: "balance", rawValue: `${balance.maxBalance}€`, normalizedValue: balance.maxBalance });
  }
  
  if (duration !== null) {
    fields.push({ field: "durationMonths", type: "balance", rawValue: `${duration} meses`, normalizedValue: duration });
  }
  
  for (const [conditionName, conditionValue] of Object.entries(conditions)) {
    if (conditionValue) {
      fields.push({
        field: conditionName,
        type: "condition",
        rawValue: conditionName,
        normalizedValue: conditionValue,
      });
    }
  }
  
  return fields;
}

/**
 * Compares current extraction vs previous extraction to detect changes.
 */
export function detectFieldChanges(
  currentFields: ExtractedField[],
  previousFields: ExtractedField[],
  source: ScraperSource
): ScraperOfferSignal[] {
  const currentMap = new Map<string, ExtractedField>();
  for (const field of currentFields) {
    currentMap.set(field.field, field);
  }
  
  const previousMap = new Map<string, ExtractedField>();
  for (const field of previousFields) {
    previousMap.set(field.field, field);
  }
  
  const signals: ScraperOfferSignal[] = [];
  const bank = normalizeBankName(source.bank).canonicalName;
  
  // Check for new/updated/unchanged fields
  for (const [fieldName, current] of currentMap) {
    const previous = previousMap.get(fieldName);
    
    if (!previous) {
      signals.push({
        bank,
        productKind: source.productKind,
        field: fieldName,
        signalType: "new",
        oldValue: null,
        newValue: current.normalizedValue,
        confidence: 0.9,
        requiresVerification: true,
      });
    } else if (previous.normalizedValue !== current.normalizedValue) {
      signals.push({
        bank,
        productKind: source.productKind,
        field: fieldName,
        signalType: "updated",
        oldValue: previous.normalizedValue,
        newValue: current.normalizedValue,
        confidence: 0.85,
        requiresVerification: true,
      });
    } else {
      signals.push({
        bank,
        productKind: source.productKind,
        field: fieldName,
        signalType: "unchanged",
        oldValue: previous.normalizedValue,
        newValue: current.normalizedValue,
        confidence: 0.95,
        requiresVerification: false,
      });
    }
  }
  
  // Check for removed fields
  for (const [fieldName, previous] of previousMap) {
    if (!currentMap.has(fieldName)) {
      signals.push({
        bank,
        productKind: source.productKind,
        field: fieldName,
        signalType: "removed",
        oldValue: previous.normalizedValue,
        newValue: null,
        confidence: 0.7,
        requiresVerification: true,
      });
    }
  }
  
  return signals;
}

/**
 * Converts signals into manual review items.
 */
export function buildReviewItems(signals: ScraperOfferSignal[], source: ScraperSource): ScraperManualReviewItem[] {
  return signals
    .filter((signal) => signal.signalType !== "unchanged")
    .map((signal) => {
      const focusAreas: string[] = [];
      const checksToConfirm: string[] = [];
      let effort: "low" | "medium" | "high" = "low";
      
      if (signal.field === "tae") {
        focusAreas.push(`TAE: ${signal.oldValue ?? "N/A"}% → ${signal.newValue ?? "N/A"}%`);
        checksToConfirm.push("Verificar TAE en PDF/original");
        checksToConfirm.push("Comprobar si es promoción temporal");
        effort = "medium";
      } else if (signal.field === "fees") {
        focusAreas.push(`Comisiones: ${signal.oldValue ?? "N/A"}€ → ${signal.newValue ?? "N/A"}€`);
        checksToConfirm.push("Verificar condiciones de comisiones");
      } else if (signal.field.includes("nomina") || signal.field.includes("bizum")) {
        focusAreas.push(`Condicción: ${signal.field} ${signal.signalType}`);
        checksToConfirm.push("Verificar si la condición es real o error de extracción");
        effort = "high";
      } else {
        focusAreas.push(`${signal.field}: ${signal.signalType} (${signal.oldValue ?? "N/A"} → ${signal.newValue ?? "N/A"})`);
        checksToConfirm.push("Verificar cambio en fuente original");
      }
      
      if (signal.signalType === "updated") {
        effort = signal.requiresVerification ? "high" as const : effort;
      }
      
      return {
        sourceId: source.id,
        bank: signal.bank,
        productKind: signal.productKind,
        sourceUrl: source.sourceUrl,
        signal,
        focusAreas,
        estimatedEffort: effort,
        checksToConfirm,
      };
    });
}

/**
 * DEPRECATED: Compatibility wrapper for legacy cycle.ts.
 * Wraps modern extraction into the old signal format expected by cycle.ts.
 */
export type ExtractionSignals = {
  rates: number[];
  hasRemuneratedAccount: boolean;
  hasDeposit: boolean;
  hasPayroll: boolean;
  hasPromotionSignals: boolean;
  snippet: string;
};

export function extractSignalsFromText(text: string): ExtractionSignals {
  // Heuristic extraction for legacy cycle API
  const rates: number[] = [];
  const taeMatches = text.matchAll(/(\d{1,3}[.,]\d{1,2})\s*%\s*TAE/gi);
  for (const match of taeMatches) {
    const rate = parseFloat(match[1].replace(",", "."));
    if (rate > 0 && rate < 50) {
      rates.push(rate);
    }
  }
  
  const hasRemuneratedAccount = /cuenta\s*(remunerada|ahorro)/i.test(text) || rates.length > 0;
  const hasDeposit = /depósito|deposito|plazo|fijo/i.test(text) || /(?:12|24|36)\s*mes/i.test(text);
  const hasPayroll = /nomina|nómina|incorporar.*(?:salario|pago)/i.test(text);
  const hasPromotionSignals = /(?:promoción|promocional|tasa mejorada|tasa especial)/i.test(text);
  
  return {
    rates,
    hasRemuneratedAccount,
    hasDeposit,
    hasPayroll,
    hasPromotionSignals,
    snippet: text.slice(0, 200),
  };
}
