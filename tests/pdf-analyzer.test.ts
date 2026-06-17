import { describe, expect, it } from "vitest";
import { analyzePdfText } from "../src/domain/pdf-analyzer";

describe("pdf-analyzer", () => {
  it("extracts balance signals from text", () => {
    const result = analyzePdfText("Saldo mínimo: 1000. Saldo máximo: 10000. TAE de remuneración 3%");
    expect(result.hasRemunerationSection).toBe(true);
    expect(result.minBalance).toBe(1000);
    expect(result.maxBalance).toBe(10000);
  });
});
