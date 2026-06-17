import { createHash } from "node:crypto";

export type MarketProductKind = "cuenta_remunerada" | "deposito" | "cuenta_nomina";

export type MarketConditionProfile = "sin_condiciones" | "con_condiciones" | "mejora_nomina";

export type MarketSection =
  | "cuentas_remuneradas_sin_condiciones"
  | "cuentas_remuneradas_con_condiciones"
  | "depositos_sin_condiciones"
  | "depositos_con_condiciones"
  | "mejores_cuentas_nomina"
  | "remuneradas_otro_país_sin_sucursal"
  | "depositos_otro_país_sin_sucursal";

const BANK_CANONICALIZATION: Record<string, string> = {
  "pibank": "banco pichincha",
  "banco pichincha": "banco pichincha",
  "banco pichincha (pibank)": "banco pichincha",
};

export type MarketOfferRecord = {
  id: string;
  bank: string;
  productKind: MarketProductKind;
  section: MarketSection;
  conditionProfile: MarketConditionProfile;
  hasSpanishIban: boolean;
  sourceUrl: string;
  offerText: string;
  requiresVerification?: boolean;
  evidenceNotes?: string;
};

export type MarketSnapshotRecord = {
  asOfDate: string;
  offers: readonly MarketOfferRecord[];
};

export type ChangeKind =
  | "new_bank"
  | "removed_bank"
  | "new_product"
  | "removed_product"
  | "updated_product";

export type OfferConditionSignal =
  | "financial_rate"
  | "bonus_or_campaign"
  | "payroll_requirement"
  | "nomina_requirement"
  | "invoice_requirement"
  | "card_or_bizum"
  | "bonus_term_limit";

export type OfferChange = {
  kind: ChangeKind;
  productId: string;
  bank: string;
  productKind: MarketProductKind;
  sourceUrl: string;
  section: MarketSection;
  reason: string;
  previousSignature?: string;
  currentSignature?: string;
  signalDiffs?: OfferConditionSignal[];
};

export type BankIdentity = {
  displayName: string;
  canonicalName: string;
};

export function normalizeBankName(input: string): BankIdentity {
  const normalized = input
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const canonical = BANK_CANONICALIZATION[normalized] ?? normalized;
  return {
    displayName: input.trim(),
    canonicalName: canonical,
  };
}

export type CatalogDelta = {
  asOfDate: string;
  previousDate?: string;
  newBankCount: number;
  removedBankCount: number;
  newProductCount: number;
  removedProductCount: number;
  updatedProductCount: number;
  changes: OfferChange[];
};

const MAX_RATE_VALUES = 20;

export function normalizeOfferText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[\u00b0%]/g, "")
    .trim();
}

function extractRateHints(text: string): number[] {
  const normalized = normalizeOfferText(text);
  const matches = normalized.match(/\b\d{1,2}[.,]\d{1,2}\b/g) ?? [];
  const parsed = matches
    .map((value) => Number.parseFloat(value.replace(",", ".")))
    .filter((value) => Number.isFinite(value));
  return Array.from(new Set(parsed)).slice(0, MAX_RATE_VALUES).sort((a, b) => b - a);
}

type OfferSignals = {
  rates: number[];
  hasPayroll: boolean;
  hasNomina: boolean;
  hasInvoice: boolean;
  hasBonus: boolean;
  hasCardOrBizum: boolean;
  hasPerpetuityTerm: boolean;
};

function buildOfferSignals(text: string): OfferSignals {
  const normalized = normalizeOfferText(text);
  const rates = extractRateHints(text);
  const hasNomina = /\bnomina\b/.test(normalized);
  return {
    rates,
    hasPayroll:
      /\bnomina\b/.test(normalized) ||
      /\bdomicil.*(?:nomina|ingreso|salario|pension|pension\b)/.test(normalized) ||
      /\bingresos?\b/.test(normalized),
    hasNomina,
    hasInvoice:
      /\brecib\b/.test(normalized) ||
      /\bdomicil.*(?:luz|gas|agua|telefono|internet|movil|energia)\b/.test(normalized),
    hasBonus:
      /\bbono\b/.test(normalized) ||
      /\bbonus\b/.test(normalized) ||
      /\bdevolucion\b/.test(normalized) ||
      /\bpromocion\b/.test(normalized) ||
      /\bcampana\b/.test(normalized) ||
      /\boferta\b/.test(normalized) ||
      /\breembolso\b/.test(normalized),
    hasCardOrBizum: /\btarjeta\b/.test(normalized) || /\bbizum\b/.test(normalized),
    hasPerpetuityTerm:
      /\bpermanencia\b/.test(normalized) ||
      /\bpenalizacion\b/.test(normalized) ||
      /\bcancelacion\b/.test(normalized) ||
      /\bcancelable\b/.test(normalized) ||
      /\bplazo\b/.test(normalized) ||
      /\bduracion\b/.test(normalized),
  };
}

export function diffOfferSignals(previousOffer: MarketOfferRecord, currentOffer: MarketOfferRecord): OfferConditionSignal[] {
  const previousSignals = buildOfferSignals(previousOffer.offerText);
  const currentSignals = buildOfferSignals(currentOffer.offerText);
  const diffs: OfferConditionSignal[] = [];

  if (previousSignals.rates.join("|") !== currentSignals.rates.join("|")) {
    diffs.push("financial_rate");
  }
  if (previousSignals.hasBonus !== currentSignals.hasBonus) {
    diffs.push("bonus_or_campaign");
  }
  if (previousSignals.hasPayroll !== currentSignals.hasPayroll) {
    diffs.push("payroll_requirement");
  }
  if (previousSignals.hasNomina !== currentSignals.hasNomina) {
    diffs.push("nomina_requirement");
  }
  if (previousSignals.hasInvoice !== currentSignals.hasInvoice) {
    diffs.push("invoice_requirement");
  }
  if (previousSignals.hasCardOrBizum !== currentSignals.hasCardOrBizum) {
    diffs.push("card_or_bizum");
  }
  if (previousSignals.hasPerpetuityTerm !== currentSignals.hasPerpetuityTerm) {
    diffs.push("bonus_term_limit");
  }

  return Array.from(new Set(diffs)).sort() as OfferConditionSignal[];
}

export function buildOfferSignalFocusAreas(previousOffer: MarketOfferRecord, currentOffer: MarketOfferRecord): string[] {
  const diffs = diffOfferSignals(previousOffer, currentOffer);
  const has = new Set(diffs);
  const areas: string[] = [];
  if (has.has("financial_rate")) {
    areas.push("TAE y retribución financiera");
  }
  if (has.has("bonus_or_campaign")) {
    areas.push("bonificaciones/campañas");
  }
  if (has.has("payroll_requirement")) {
    areas.push("requisitos de nómina/ingresos recurrentes");
  }
  if (has.has("nomina_requirement")) {
    areas.push("condiciones ligadas a nómina");
  }
  if (has.has("invoice_requirement")) {
    areas.push("domiciliación de recibos");
  }
  if (has.has("card_or_bizum")) {
    areas.push("uso de tarjeta o Bizum");
  }
  if (has.has("bonus_term_limit")) {
    areas.push("permanencia, plazo o penalización");
  }
  if (areas.length === 0) {
    areas.push("condiciones comerciales del producto");
  }
  return areas;
}

export function buildOfferSignature(record: MarketOfferRecord): string {
  const payload = {
    productKind: record.productKind,
    section: record.section,
    conditionProfile: record.conditionProfile,
    hasSpanishIban: record.hasSpanishIban,
    rates: extractRateHints(record.offerText),
    offerText: normalizeOfferText(record.offerText),
    evidenceNotes: record.evidenceNotes ?? "",
    requiresVerification: record.requiresVerification ?? false,
  };
  const raw = JSON.stringify(payload);
  return createHash("sha256").update(raw).digest("hex");
}

export function diffCatalogSnapshots(
  previous: MarketSnapshotRecord | null,
  current: MarketSnapshotRecord,
): CatalogDelta {
  const previousById = new Map<string, MarketOfferRecord>();
  const previousBanks = new Map<string, string>();
  const currentById = new Map<string, MarketOfferRecord>();
  const currentBanks = new Map<string, string>();

  if (previous) {
    for (const offer of previous.offers) {
      previousById.set(offer.id, offer);
      const bankId = normalizeBankName(offer.bank).canonicalName;
      previousBanks.set(bankId, offer.bank);
    }
  }

  for (const offer of current.offers) {
    currentById.set(offer.id, offer);
    const bankId = normalizeBankName(offer.bank).canonicalName;
    currentBanks.set(bankId, offer.bank);
  }

  const changes: OfferChange[] = [];

  for (const [id, currentOffer] of currentById) {
    if (!previousById.has(id)) {
      const bank = normalizeBankName(currentOffer.bank);
      const isNewBank = !previousBanks.has(bank.canonicalName);
      changes.push({
        kind: "new_product",
        productId: id,
        bank: bank.displayName,
        productKind: currentOffer.productKind,
        sourceUrl: currentOffer.sourceUrl,
        section: currentOffer.section,
        reason: isNewBank ? "new bank discovered in snapshot" : "new product discovered for existing bank",
      });
      continue;
    }

    const previousOffer = previousById.get(id);
    if (!previousOffer) {
      continue;
    }

    const prevSignature = buildOfferSignature(previousOffer);
    const nextSignature = buildOfferSignature(currentOffer);
    if (prevSignature !== nextSignature) {
      const signalDiffs = diffOfferSignals(previousOffer, currentOffer);
      const changeReason = signalDiffs.length
        ? `financial terms changed: ${signalDiffs.join(", ")}`
        : "financial terms changed (signature mismatch)";
      changes.push({
        kind: "updated_product",
        productId: id,
        bank: currentOffer.bank,
        productKind: currentOffer.productKind,
        sourceUrl: currentOffer.sourceUrl,
        section: currentOffer.section,
        reason: changeReason,
        signalDiffs,
        previousSignature: prevSignature,
        currentSignature: nextSignature,
      });
    }
  }

  for (const [id, previousOffer] of previousById) {
    if (!currentById.has(id)) {
      const bank = normalizeBankName(previousOffer.bank);
      changes.push({
        kind: "removed_product",
        productId: id,
        bank: bank.displayName,
        productKind: previousOffer.productKind,
        sourceUrl: previousOffer.sourceUrl,
        section: previousOffer.section,
        reason: "product removed from new snapshot",
      });
    }
  }

  for (const [bankId, bankDisplay] of currentBanks) {
    if (!previousBanks.has(bankId)) {
      changes.push({
        kind: "new_bank",
        productId: `bank:${bankId}`,
        bank: bankDisplay,
        productKind: "cuenta_nomina",
        sourceUrl: "",
        section: "mejores_cuentas_nomina",
        reason: "new bank in snapshot",
      });
    }
  }

  for (const [bankId, bankDisplay] of previousBanks) {
    if (!currentBanks.has(bankId)) {
      changes.push({
        kind: "removed_bank",
        productId: `bank:${bankId}`,
        bank: bankDisplay,
        productKind: "cuenta_nomina",
        sourceUrl: "",
        section: "mejores_cuentas_nomina",
        reason: "bank no longer present in snapshot",
      });
    }
  }

  return {
    asOfDate: current.asOfDate,
    previousDate: previous?.asOfDate,
    newBankCount: changes.filter((change) => change.kind === "new_bank").length,
    removedBankCount: changes.filter((change) => change.kind === "removed_bank").length,
    newProductCount: changes.filter((change) => change.kind === "new_product").length,
    removedProductCount: changes.filter((change) => change.kind === "removed_product").length,
    updatedProductCount: changes.filter((change) => change.kind === "updated_product").length,
    changes,
  };
}
