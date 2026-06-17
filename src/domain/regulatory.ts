const WHITESPACE_RE = /\s+/g;

export type AllowedRegulatoryCategory =
  | "bank_account"
  | "remunerated_account"
  | "payroll_account"
  | "bank_deposit";

export type BlockedRegulatoryCategory =
  | "stock"
  | "etf"
  | "investment_fund"
  | "structured_deposit"
  | "bond"
  | "cryptoasset"
  | "insurance"
  | "personalized_investment_advice"
  | "unknown";

export type RegulatoryCategory = AllowedRegulatoryCategory | BlockedRegulatoryCategory;

export type RegulatorySafeMode =
  | "normal_banking_comparison"
  | "refuse_personalized_advice"
  | "manual_review"
  | "educational_only";

export type RegulatoryDecision = {
  category: RegulatoryCategory;
  blocked: boolean;
  reason: string;
  safeResponseMode: RegulatorySafeMode;
};

type BlockRule = {
  category: Extract<RegulatoryCategory, BlockedRegulatoryCategory>;
  reason: string;
  patterns: string[];
  safeResponseMode: RegulatorySafeMode;
};

type AllowedRule = {
  category: AllowedRegulatoryCategory;
  reason: string;
  patterns: string[];
};

const BLOCKED_RULES: BlockRule[] = [
  {
    category: "personalized_investment_advice",
    reason: "Se detecto una solicitud de asesoramiento financiero personalizado.",
    safeResponseMode: "refuse_personalized_advice",
    patterns: [
      "quiero que me recomiendes",
      "recomiendame",
      "recomiendas",
      "donde invertir",
      "que compro",
      "recomendame",
      "crear cartera",
      "composicion de cartera",
    ],
  },
  {
    category: "stock",
    reason: "Se detectaron terminos de acciones.",
    safeResponseMode: "refuse_personalized_advice",
    patterns: ["acciones", "accion", "stock", "action", "acciones", "mercado", "bolsa"],
  },
  {
    category: "etf",
    reason: "Se detecto un producto tipo ETF.",
    safeResponseMode: "refuse_personalized_advice",
    patterns: ["etf", "fondos cotizados", "exchange traded fund"],
  },
  {
    category: "investment_fund",
    reason: "Se detecto un fondo de inversion.",
    safeResponseMode: "refuse_personalized_advice",
    patterns: ["fondo de inversion", "fondos de inversion", "inversion colectiva", "investment fund"],
  },
  {
    category: "bond",
    reason: "Se detecto intencion sobre bonos.",
    safeResponseMode: "refuse_personalized_advice",
    patterns: ["bono", "bonos", "obligacion", "obligacion", "bond"],
  },
  {
    category: "structured_deposit",
    reason: "Se detecto un deposito estructurado.",
    safeResponseMode: "manual_review",
    patterns: ["deposito estructurado", "deposito protegido", "estructura del deposit", "capital garantizado"],
  },
  {
    category: "cryptoasset",
    reason: "Se detecto intencion sobre criptoactivos.",
    safeResponseMode: "refuse_personalized_advice",
    patterns: ["bitcoin", "crypto", "criptomoneda", "criptomonedas", "blockchain", "stablecoin", "meme coin"],
  },
  {
    category: "insurance",
    reason: "Se detecto intencion sobre seguros.",
    safeResponseMode: "manual_review",
    patterns: ["seguro", "seguros", "poliza", "póliza", "aseguradora", "seguimiento"],
  },
];

const ALLOWED_RULES: AllowedRule[] = [
  {
    category: "payroll_account",
    reason: "Intento de cuenta de nomina detectado.",
    patterns: ["nomina", "nómina", "cuenta de nomina", "nomina", "nominar", "salario", "remunerado"],
  },
  {
    category: "remunerated_account",
    reason: "Intento de cuenta remunerada detectado.",
    patterns: ["cuenta remunerada", "remunerada", "remunerado"],
  },
  {
    category: "bank_deposit",
    reason: "Intento de deposito bancario detectado.",
    patterns: ["deposito", "depósito", "plazo fijo", "cdt", "certificado de deposito", "deposito", "depósitos"],
  },
  {
    category: "bank_account",
    reason: "Intento de cuenta bancaria detectado.",
    patterns: ["cuenta", "producto bancario", "banco", "entidad", "cuenta bancaria"],
  },
];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(WHITESPACE_RE, " ")
    .trim();
}

export function classifyUserIntent(input: string): RegulatoryDecision {
  const normalized = normalize(input);

  const blockedMatch = BLOCKED_RULES.find((rule) => rule.patterns.some((pattern) => normalized.includes(pattern)));
  if (blockedMatch) {
    return {
      category: blockedMatch.category,
      blocked: true,
      reason: blockedMatch.reason,
      safeResponseMode: blockedMatch.safeResponseMode,
    };
  }

  const allowedMatch = ALLOWED_RULES.find((rule) => rule.patterns.some((pattern) => normalized.includes(pattern)));
  if (allowedMatch) {
    return {
      category: allowedMatch.category,
      blocked: false,
      reason: allowedMatch.reason,
      safeResponseMode: "normal_banking_comparison",
    };
  }

  return {
    category: "unknown",
    blocked: true,
    reason: "No se pudo clasificar la intencion con confianza.",
    safeResponseMode: "manual_review",
  };
}

export function isAllowedCategory(category: RegulatoryCategory): boolean {
  return category === "bank_account" || category === "remunerated_account" || category === "payroll_account" || category === "bank_deposit";
}

export function blockedCategoryMessage(): string {
  return "No puedo prestar asesoramiento personalizado sobre instrumentos financieros. Puedo ayudarte con una comparativa informativa de cuentas y depositos bancarios.";
}
