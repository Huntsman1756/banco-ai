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
});
