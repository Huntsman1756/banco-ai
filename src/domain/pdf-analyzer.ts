export type PdfAnalysisResult = {
  hasRemunerationSection: boolean;
  minBalance: number | null;
  maxBalance: number | null;
  confidence: number;
};

export function analyzePdfText(text: string): PdfAnalysisResult {
  const clean = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  const hasRemunerationSection = /\b(?:remuneracion|intereses|tae)\b/.test(clean);
  const minMatch = clean.match(/saldo(?:\s*de\s*apertura|\s*minimo|\s*desde)\s*[:\-]?\s*([0-9]+(?:[.,][0-9]{1,2})?)/);
  const maxMatch = clean.match(/\bsaldo\s*(?:maximo|hasta)\s*[:\-]?\s*([0-9]+(?:[.,][0-9]{1,2})?)/);

  const minBalance = minMatch ? Number.parseFloat(minMatch[1].replace(",", ".")) : null;
  const maxBalance = maxMatch ? Number.parseFloat(maxMatch[1].replace(",", ".")) : null;

  return {
    hasRemunerationSection,
    minBalance,
    maxBalance,
    confidence: hasRemunerationSection ? 0.75 : 0.35,
  };
}
