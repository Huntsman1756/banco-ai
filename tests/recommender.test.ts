import { describe, expect, it } from "vitest";
import { rankApprovedProducts } from "../src/domain/recommender";

describe("recommender", () => {
  it("ranks only approved current versions", () => {
    const ranking = rankApprovedProducts([
      { id: "a", productName: "A", tae: 2, fees: 5, status: "approved", validTo: null, maxBalance: null, minBalance: null },
      { id: "b", productName: "B", tae: 4, fees: 5, status: "pending_review", validTo: null, maxBalance: null, minBalance: null },
      { id: "c", productName: "C", tae: 3, fees: 10, status: "approved", validTo: "2026-01-01T00:00:00Z", maxBalance: null, minBalance: null },
      { id: "d", productName: "D", tae: 3, fees: 2, status: "approved", validTo: null, maxBalance: null, minBalance: null },
    ]);

    expect(ranking.map((x) => x.id)).toEqual(["d", "a"]);
  });

  it("orders ties deterministically by normalized product name and id", () => {
    const ranking = rankApprovedProducts([
      { id: "z", productName: "Zeta", tae: 2.5, fees: 0, status: "approved", validTo: null, maxBalance: null, minBalance: null },
      { id: "a", productName: "alpha", tae: 2.5, fees: 0, status: "approved", validTo: null, maxBalance: null, minBalance: null },
      { id: "b", productName: "Alpha", tae: 2.5, fees: 0, status: "approved", validTo: null, maxBalance: null, minBalance: null },
    ]);

    expect(ranking.map((x) => x.id)).toEqual(["a", "b", "z"]);
  });

  it("respects requested result limit", () => {
    const ranking = rankApprovedProducts(
      [
        { id: "a", productName: "A", tae: 1, fees: 0, status: "approved", validTo: null, maxBalance: null, minBalance: null },
        { id: "b", productName: "B", tae: 3, fees: 0, status: "approved", validTo: null, maxBalance: null, minBalance: null },
      ],
      1,
    );

    expect(ranking).toHaveLength(1);
    expect(ranking[0].id).toBe("b");
  });
});
