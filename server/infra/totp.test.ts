import { describe, expect, it } from "vitest";
import { generateTotpSecret, totpNow, verifyTotp } from "./totp.js";

describe("totp", () => {
  it("accepts the current code and rejects a wrong code", () => {
    const secret = generateTotpSecret();
    const code = totpNow(secret);
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, "000000")).toBe(false);
    expect(verifyTotp(secret, totpNow(secret, Date.now() - 120_000))).toBe(false);
  });
});
