import { calculateFirstYearReturn } from "./financial-engine.js";

export type ProductVersion = {
  id: string;
  productName: string;
  tae: number;
  fees: number;
  maxBalance?: number | null;
  minBalance?: number | null;
  status: "approved" | "pending_review" | "rejected" | "superseded";
  validTo: string | null;
};

export type RankedProduct = {
  id: string;
  score: number;
  recommended: boolean;
};

export type ProductCatalogKind = "cuenta_remunerada" | "cuenta_nomina" | "deposito" | "cuenta";

export type ProductCatalogRecord = {
  id: string;
  bank: string;
  productName: string;
  productKind: ProductCatalogKind;
  tae: number;
  fees: number;
  minBalance: number;
  maxBalance: number | null;
  durationMonths: number | null;
  validTo: string | null;
  status: "approved" | "pending_review" | "rejected" | "superseded";
  source: string;
  sourceUrl?: string;
  categoryLabel?: string;
  requiresPayroll?: boolean;
  requiresReceipts?: boolean;
  requiresBizum?: boolean;
  requiresConditions?: boolean;
  liquidity?: number;
};

export type AssistantObjective = "rentabilidad" | "nomina" | "liquidez" | "deposito";
export type AssistantVinculacion = "sin_condiciones" | "con_condiciones" | "indiferente";
export type AssistantHorizon = "corto" | "medio" | "largo";
export type AssistantCapitalBand = "hasta_1000" | "1000_10000" | "10000_plus";
export type AssistantPayrollNeed = "no_importante" | "si_tengo_nomina" | "prioriza_nomina";

export type AssistantProfile = {
  objective: AssistantObjective;
  vinculacion: AssistantVinculacion;
  horizonte: AssistantHorizon;
  capitalBand: AssistantCapitalBand;
  payrollNeed: AssistantPayrollNeed;
};

function toSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

function toSafeString(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

export type AssistantRecommendation = {
  rank: number;
  product: {
    id: string;
    bank: string;
    name: string;
    category: string;
    family: "remunerada" | "nomina" | "cuenta" | "deposito";
    tae: number;
    fee: number;
    minBalance: number;
    maxBalance: number | null;
    requiresPayroll: boolean;
    requiresReceipts: boolean;
    requiresBizum: boolean;
    requiresConditions: boolean;
    liquidity: number;
    durationMonths: number | null;
    source: string;
  };
  score: number;
  why: string;
  benefit: string;
  fit: string;
  recommended: boolean;
};

function normalizeAssistantProfile(raw: Partial<AssistantProfile> | undefined): AssistantProfile {
  return {
    objective: raw?.objective ?? "rentabilidad",
    vinculacion: raw?.vinculacion ?? "indiferente",
    horizonte: raw?.horizonte ?? "medio",
    capitalBand: raw?.capitalBand ?? "1000_10000",
    payrollNeed: raw?.payrollNeed ?? "no_importante",
  };
}

const HORIZON_MONTHS: Record<AssistantHorizon, number> = {
  corto: 3,
  medio: 12,
  largo: 24,
};

const BASE_LIQUIDITY_BY_KIND: Record<ProductCatalogKind, number> = {
  cuenta_remunerada: 92,
  cuenta_nomina: 88,
  deposito: 20,
  cuenta: 70,
};

function estimateCapitalByBand(band: AssistantCapitalBand): number {
  if (band === "hasta_1000") {
    return 500;
  }
  if (band === "10000_plus") {
    return 12000;
  }
  return 5000;
}

function mapKindToFamily(kind: ProductCatalogKind): "remunerada" | "nomina" | "cuenta" | "deposito" {
  if (kind === "cuenta_nomina") {
    return "nomina";
  }
  if (kind === "cuenta_remunerada") {
    return "remunerada";
  }
  if (kind === "deposito") {
    return "deposito";
  }
  return "cuenta";
}

function safeLocaleCurrency(value: number): string {
  return value.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function isApprovedCatalogProduct(item: ProductCatalogRecord): boolean {
  return item.status === "approved" && item.validTo === null;
}

function isApprovedProductVersion(item: ProductVersion): boolean {
  return item.status === "approved" && item.validTo === null;
}

function rankProductVersion(product: ProductVersion): RankedProduct {
  const tae = toSafeNumber(product.tae);
  const fees = toSafeNumber(product.fees);
  return {
    id: product.id,
    score: tae - fees / 100,
    recommended: tae > 0,
  };
}

export function rankApprovedProducts(versions: ProductVersion[], maxResults = 10): RankedProduct[] {
  const results = versions.filter(isApprovedProductVersion).map((product) => {
    const ranked = rankProductVersion(product);
    return {
      ...ranked,
      normalizedName: toSafeString(product.productName || ""),
    };
  });

  const sorted = results.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    if (a.normalizedName !== b.normalizedName) {
      return a.normalizedName.localeCompare(b.normalizedName, "en-US");
    }
    return a.id.localeCompare(b.id);
  });

  const limit = Number.isFinite(maxResults) ? Math.max(0, Math.floor(maxResults)) : 10;
  return sorted.slice(0, limit).map(({ normalizedName: _ignored, ...ranked }) => ranked);
}

export function rankCatalogForProfile(
  records: readonly ProductCatalogRecord[],
  profile: Partial<AssistantProfile>,
  maxResults = 4,
): AssistantRecommendation[] {
  const normalizedProfile = normalizeAssistantProfile(profile);
  const capital = estimateCapitalByBand(normalizedProfile.capitalBand);
  const horizonMonths = HORIZON_MONTHS[normalizedProfile.horizonte];

  const scored = records
    .filter(isApprovedCatalogProduct)
    .map((record) => {
      const reasons: string[] = [];
      const family = mapKindToFamily(record.productKind);
      const liquidity = record.liquidity ?? BASE_LIQUIDITY_BY_KIND[record.productKind];

      let score = 0;
      const requiresPayroll = Boolean(record.requiresPayroll);
      const requiresReceipts = Boolean(record.requiresReceipts);
      const requiresBizum = Boolean(record.requiresBizum);
      const requiresConditions = Boolean(record.requiresConditions || requiresReceipts || requiresBizum);

      if (normalizedProfile.objective === "rentabilidad") {
        if (family === "remunerada") {
          score += 35;
          reasons.push("prioridad en rentabilidad y TAE");
        }
        if (family === "deposito") {
          score += 22;
          reasons.push("encaja con comparación a plazo");
        }
      }

      if (normalizedProfile.objective === "nomina") {
        if (family === "nomina") {
          score += 45;
          reasons.push("encaja con producto de nómina");
        }
        if (requiresPayroll) {
          score += normalizedProfile.payrollNeed === "prioriza_nomina" ? 12 : 4;
          reasons.push("incorpora condiciones con vinculación recurrente");
        }
      }

      if (normalizedProfile.objective === "liquidez") {
        if (family === "cuenta" || family === "remunerada") {
          score += 35;
          reasons.push("prioriza liquidez diaria");
        }
        score += liquidity * 0.2;
      }

      if (normalizedProfile.objective === "deposito") {
        if (family === "deposito") {
          score += 38;
          reasons.push("alineado con horizontes de vencimiento");
        }
        if (record.durationMonths) {
          score += Math.min(12, record.durationMonths / 3);
        }
      }

      if (normalizedProfile.vinculacion === "sin_condiciones" && requiresConditions) {
        score -= 20;
        reasons.push("penaliza por condiciones extras");
      }
      if (normalizedProfile.vinculacion === "con_condiciones" && requiresConditions) {
        score += 8;
        reasons.push("acepta condiciones extra con posible compensación en retorno");
      }

      if ((record.tae ?? 0) > 0) {
        score += (record.tae ?? 0) * 8;
      }
      if (record.fees > 0) {
        score -= record.fees * 12;
      }
      score += liquidity * 0.2;

      if (normalizedProfile.horizonte === "corto" && family === "deposito") {
        score -= 18;
        reasons.push("menos adecuado para horizonte corto");
      }
      if (normalizedProfile.horizonte === "largo" && family !== "deposito") {
        score -= 6;
      }
      if (normalizedProfile.payrollNeed === "prioriza_nomina" && requiresPayroll) {
        score += 12;
      }

      const minBalance = record.minBalance ?? 0;
      if (minBalance > capital) {
        const penalty = Math.min(30, ((minBalance - capital) / Math.max(capital, 1)) * 12);
        score -= penalty;
        reasons.push("umbral mínimo por encima del capital de referencia");
      }

      const effectiveMonths = family === "deposito" && record.durationMonths ? Math.min(horizonMonths, record.durationMonths) : horizonMonths;
      const estimatedBenefit = calculateFirstYearReturn({
        tae: record.tae ?? 0,
        monthlyDeposit: capital,
        months: effectiveMonths,
      }).grossInterest * (effectiveMonths / 12);
      const fit = family === "deposito" ? `${record.durationMonths ?? 1} meses` : "acceso rápido";

      return {
        id: record.id,
        product: {
          id: record.id,
          bank: record.bank,
          name: record.productName,
          category: record.productKind === "cuenta_remunerada" ? "Cuenta remunerada" : record.productKind === "cuenta_nomina" ? "Cuenta nómina" : "Depósito",
          family,
          tae: record.tae,
          fee: record.fees,
          minBalance,
          maxBalance: record.maxBalance,
          requiresPayroll,
          requiresReceipts,
          requiresBizum,
          requiresConditions,
          liquidity,
          durationMonths: record.durationMonths,
          source: record.source,
        },
        score,
        why: reasons.join(" · "),
        benefit: `${safeLocaleCurrency(estimatedBenefit)} estimados en ${effectiveMonths} meses`,
        fit,
        recommended: (record.tae ?? 0) > 0,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.product.name.localeCompare(b.product.name);
    })
    .slice(0, maxResults)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }));

  return scored;
}
