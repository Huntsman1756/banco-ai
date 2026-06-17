import { describe, expect, it } from "vitest";
import { classifyUserIntent } from "../src/domain/regulatory";

describe("regulatory", () => {
  it("blocks personalized investment advice intent", () => {
    const result = classifyUserIntent("Me recomiendas que comprare nvidia?");
    expect(result.blocked).toBe(true);
    expect(result.category).toBe("personalized_investment_advice");
  });

  it("blocks stock intent", () => {
    const result = classifyUserIntent("quiero invertir en acciones");
    expect(result.blocked).toBe(true);
    expect(result.category).toBe("stock");
  });

  it("blocks ETF intent", () => {
    const result = classifyUserIntent("quero comprar un etf de tecnologia");
    expect(result.blocked).toBe(true);
    expect(result.category).toBe("etf");
  });

  it("blocks crypto intent", () => {
    const result = classifyUserIntent("me interesa bitcoin");
    expect(result.blocked).toBe(true);
    expect(result.category).toBe("cryptoasset");
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
});
