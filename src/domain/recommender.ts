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

export function rankApprovedProducts(versions: ProductVersion[], maxResults = 10): RankedProduct[] {
  const approved = versions.filter((item) => item.status === "approved" && item.validTo === null);
  return approved
    .map((product) => ({
      id: product.id,
      score: (product.tae ?? 0) - (product.fees ?? 0) / 100,
      recommended: (product.tae ?? 0) > 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}
