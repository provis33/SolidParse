import { describe, expect, it } from "vitest";
import { detectCurrency, parseMoneyAmount } from "../src/signals/money.js";

describe("money locales", () => {
  it("parses US and EU formats", () => {
    expect(parseMoneyAmount("$1,299.00")).toBe(1299);
    expect(parseMoneyAmount("1.299,00 €")).toBe(1299);
    expect(parseMoneyAmount("59,90")).toBe(59.9);
    expect(parseMoneyAmount("1 299,50")).toBe(1299.5);
  });

  it("detects extra currencies", () => {
    expect(detectCurrency("¥1200")).toBe("JPY");
    expect(detectCurrency("₹999")).toBe("INR");
    expect(detectCurrency("₩50000")).toBe("KRW");
  });
});
