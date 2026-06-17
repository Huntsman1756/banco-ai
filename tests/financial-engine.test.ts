import { describe, expect, it } from "vitest";
import { calculateFirstYearReturn, calculatePayrollBonus } from "../src/domain/financial-engine";

describe("financial-engine", () => {
  it("calculates first-year return deterministically", () => {
    const result = calculateFirstYearReturn({ tae: 3.6, monthlyDeposit: 100 });
    expect(result.finalAmount).toBeCloseTo(1243.2, 2);
  });

  it("caps payroll bonus at max", () => {
    expect(calculatePayrollBonus(100, 250, 300)).toBe(300);
    expect(calculatePayrollBonus(100, 120, 400)).toBe(220);
  });
});
