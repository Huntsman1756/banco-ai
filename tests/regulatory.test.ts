import { describe, expect, it } from "vitest";
import { classifyUserIntent, isAllowedCategory, blockedCategoryMessage } from "../src/domain/regulatory";

describe("regulatory classifyUserIntent", () => {
  it("blocks personalized investment advice intents", () => {
    const result = classifyUserIntent("Me recomiendas que comprarie nvidia?");
    expect(result.blocked).toBe(true);
    expect(result.category).toBe("personalized_investment_advice");
  });

  it("blocks stock intents", () => {
    const result = classifyUserIntent("quiero invertir en acciones");
    expect(result.blocked).toBe(true);
    expect(result.category).toBe("stock");
  });

  it("blocks ETF intents", () => {
    const result = classifyUserIntent("quero comprar un etf de tecnologia");
    expect(result.blocked).toBe(true);
    expect(result.category).toBe("etf");
  });

  it("blocks investment fund intents", () => {
    const result = classifyUserIntent("quiero un fondo de inversion");
    expect(result.blocked).toBe(true);
    expect(result.category).toBe("investment_fund");
  });

  it("blocks bond intents", () => {
    const result = classifyUserIntent("busco bonos del estado");
    expect(result.blocked).toBe(true);
    expect(result.category).toBe("bond");
  });

  it("blocks structured deposit intents", () => {
    const result = classifyUserIntent("me interesa un deposito estructurado");
    expect(result.blocked).toBe(true);
    expect(result.category).toBe("structured_deposit");
  });

  it("blocks cryptoasset intents", () => {
    const result = classifyUserIntent("me interesa bitcoin");
    expect(result.blocked).toBe(true);
    expect(result.category).toBe("cryptoasset");
  });

  it("blocks insurance intents", () => {
    const result = classifyUserIntent("quiero un seguro de vida");
    expect(result.blocked).toBe(true);
    expect(result.category).toBe("insurance");
  });

  it("allows bank account intents", () => {
    const result = classifyUserIntent("quiero abrir una cuenta remunerada");
    expect(result.blocked).toBe(false);
    expect(result.category).toBe("remunerated_account");
  });

  it("allows payroll account intents", () => {
    const result = classifyUserIntent("necesito una cuenta de nomina");
    expect(result.blocked).toBe(false);
    expect(result.category).toBe("payroll_account");
  });

  it("allows bank deposit intents", () => {
    const result = classifyUserIntent("quiero comparar depositos a plazo fijo");
    expect(result.blocked).toBe(false);
    expect(result.category).toBe("bank_deposit");
  });

  it("blocks unknown intents", () => {
    const result = classifyUserIntent("me interesa esto pero no se de que hablo");
    expect(result.blocked).toBe(true);
    expect(result.category).toBe("unknown");
  });

  it("handles empty input", () => {
    const result = classifyUserIntent("");
    expect(result.blocked).toBe(true);
    expect(result.category).toBe("unknown");
  });

  it("handles unicode normalization", () => {
    const result = classifyUserIntent("quiero una cuenta de nómina");
    expect(result.blocked).toBe(false);
    expect(result.category).toBe("payroll_account");
  });

  it("handles uppercase input", () => {
    const result = classifyUserIntent("QUIERO UNA CUENTA REMUNERADA");
    expect(result.blocked).toBe(false);
    expect(result.category).toBe("remunerated_account");
  });

  it("returns safe response mode for blocked advice", () => {
    const result = classifyUserIntent("recomiendame donde invertir");
    expect(result.safeResponseMode).toBe("refuse_personalized_advice");
  });

  it("returns safe response mode for blocked crypto", () => {
    const result = classifyUserIntent("quiero comprar criptomonedas");
    expect(result.safeResponseMode).toBe("refuse_personalized_advice");
  });

  it("returns safe response mode for blocked insurance", () => {
    const result = classifyUserIntent("busco un seguro");
    expect(result.safeResponseMode).toBe("manual_review");
  });
});

describe("regulatory isAllowedCategory", () => {
  it("returns true for allowed categories", () => {
    expect(isAllowedCategory("bank_account")).toBe(true);
    expect(isAllowedCategory("remunerated_account")).toBe(true);
    expect(isAllowedCategory("payroll_account")).toBe(true);
    expect(isAllowedCategory("bank_deposit")).toBe(true);
  });

  it("returns false for blocked categories", () => {
    expect(isAllowedCategory("stock")).toBe(false);
    expect(isAllowedCategory("etf")).toBe(false);
    expect(isAllowedCategory("investment_fund")).toBe(false);
    expect(isAllowedCategory("cryptoasset")).toBe(false);
    expect(isAllowedCategory("insurance")).toBe(false);
    expect(isAllowedCategory("unknown")).toBe(false);
  });
});

describe("regulatory blockedCategoryMessage", () => {
  it("returns a non-advice message", () => {
    const message = blockedCategoryMessage();
    expect(message).toContain("comparativa");
    expect(message).toContain("cuentas");
    expect(message).not.toContain("recomiendo");
    expect(message).not.toContain("personalized");
  });
});
