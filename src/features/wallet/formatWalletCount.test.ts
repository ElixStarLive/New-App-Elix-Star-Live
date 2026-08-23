import { describe, expect, it } from "vitest";
import { formatWalletCount } from "./formatWalletCount";

describe("formatWalletCount", () => {
  it("formats ready integers with grouping", () => {
    expect(formatWalletCount(0, "ready")).toBe("0");
    expect(formatWalletCount(1, "ready")).toBe("1");
    expect(formatWalletCount(1000, "ready")).toBe("1,000");
  });

  it("does not present loading or error as zero", () => {
    expect(formatWalletCount(null, "loading")).toBe("…");
    expect(formatWalletCount(0, "loading")).toBe("…");
    expect(formatWalletCount(null, "error")).toBe("unavailable");
    expect(formatWalletCount(0, "error")).toBe("unavailable");
    expect(formatWalletCount(null, "idle")).toBe("…");
  });
});
