import { describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret } from "./secretBox.js";
import { loadEnv, resetEnvCache } from "./env.js";

describe("secretBox", () => {
  it("round-trips a TOTP secret", () => {
    resetEnvCache();
    loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://localhost/elix",
      JWT_SECRET: "a".repeat(32),
    });
    const secret = "totp-secret-value";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });
});
