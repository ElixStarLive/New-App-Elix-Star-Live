import { describe, expect, it } from "vitest";
import { formatPence, poundsInputToPence } from "./formatPence";

describe("PAGE-045 pence display", () => {
  it("formats integer pence for display only", () => {
    expect(formatPence(12345)).toBe("£123.45");
    expect(formatPence(0)).toBe("£0.00");
    expect(formatPence(-10)).toBe("£0.00");
  });

  it("accepts a two-decimal pounds input and rejects malformed amounts", () => {
    expect(poundsInputToPence("50")).toBe(5000);
    expect(poundsInputToPence("50.00")).toBe(5000);
    expect(poundsInputToPence("50.01")).toBe(5001);
    expect(poundsInputToPence("0")).toBeNull();
    expect(poundsInputToPence("-1")).toBeNull();
    expect(poundsInputToPence("1.234")).toBeNull();
    expect(poundsInputToPence("1e2")).toBeNull();
    expect(poundsInputToPence("abc")).toBeNull();
  });
});
