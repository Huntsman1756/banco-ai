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

  it("returns zero for zero deposit", () => {
    const result = calculateFirstYearReturn({ tae: 3.6, monthlyDeposit: 0 });
    expect(result.finalAmount).toBe(0);
  });

  it("returns zero for zero TAE", () => {
    const result = calculateFirstYearReturn({ tae: 0, monthlyDeposit: 100 });
    expect(result.finalAmount).toBe(1200);
  });

  it("handles large deposits", () => {
    const result = calculateFirstYearReturn({ tae: 3.6, monthlyDeposit: 10000 });
    expect(result.finalAmount).toBeCloseTo(124320, 2);
  });

  it("payroll bonus with zero values", () => {
    expect(calculatePayrollBonus(0, 0, 0)).toBe(0);
    expect(calculatePayrollBonus(50, 0, 100)).toBe(50);
  });

  it("payroll bonus with zero bonus returns net amount", () => {
    expect(calculatePayrollBonus(100, 0, 200)).toBe(100);
  });

  it("payroll bonus with null bonus treated as zero", () => {
    expect(calculatePayrollBonus(100, null, 200)).toBe(100);
  });

  it("first year return with high TAE", () => {
    const result = calculateFirstYearReturn({ tae: 5, monthlyDeposit: 500 });
    expect(result.finalAmount).toBeGreaterThan(6250);
  });
});
