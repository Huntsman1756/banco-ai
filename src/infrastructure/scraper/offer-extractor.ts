export type ScrapeSignal = {
  snippet: string;
  hasRemuneratedAccount: boolean;
  hasDeposit: boolean;
  hasPayroll: boolean;
  rates: number[];
  hasSpanishIbanSignal: boolean;
  hasPromotionSignals: boolean;
};

function parseRates(text: string): number[] {
  const values = text.match(/\b\d{1,2}(?:[.,]\d{1,3})?%/g) ?? [];
  const parsed = values
    .map((value) => Number.parseFloat(value.replace(",", ".").replace("%", "")))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);
  return Array.from(new Set(parsed)).slice(0, 30);
}

export function extractSignalsFromText(text: string): ScrapeSignal {
  const normalized = text.toLowerCase();
  const rates = parseRates(normalized);
  const snippet = normalized.slice(0, 640);
  return {
    snippet,
    hasRemuneratedAccount: /cuenta remunerada|cuentas remuneradas|interes|intereses|rentabilidad|tae/.test(normalized),
    hasDeposit: /dep[oó]sito|plazo fijo|plazos fijos|deposito/.test(normalized),
    hasPayroll: /n[oó]mina|nomina|domiciliar|recibo/.test(normalized),
    rates,
    hasSpanishIbanSignal: /es\d{22}/i.test(normalized),
    hasPromotionSignals: /promoci[oó]n|bonific|bono|oferta|inversi[oó]n/.test(normalized),
  };
}
