export type PdfAnalysisResult = {
  hasRemunerationSection: boolean;
  minBalance: number | null;
  maxBalance: number | null;
  confidence: number;
};

export function analyzePdfText(text: string): PdfAnalysisResult {
  const clean = text.toLowerCase();
  const hasRemunerationSection = /remuneraci[o|ó]n|intereses|tae/.test(clean);
  const minMatch = clean.match(/saldo m[ií]nimo\s*[:\\-]?\s*([0-9]+(?:[.,][0-9]{1,2})?)/);
  const maxMatch = clean.match(/saldo m[aá]ximo\s*[:\\-]?\s*([0-9]+(?:[.,][0-9]{1,2})?)/);

  const minBalance = minMatch ? Number.parseFloat(minMatch[1].replace(",", ".")) : null;
  const maxBalance = maxMatch ? Number.parseFloat(maxMatch[1].replace(",", ".")) : null;

  return {
    hasRemunerationSection,
    minBalance,
    maxBalance,
    confidence: hasRemunerationSection ? 0.75 : 0.35,
  };
}
