import { describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache } from "./env.js";

describe("env", () => {
  it("refuses to boot production without Valkey", () => {
    resetEnvCache();
    expect(() =>
      loadEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://localhost/elix",
        JWT_SECRET: "a".repeat(64),
        VALKEY_URL: "",
        REDIS_URL: "",
      }),
    ).toThrow(/VALKEY_URL is required in production/);
  });

  it("allows development without Valkey", () => {
    resetEnvCache();
    const parsed = loadEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgres://localhost/elix",
      JWT_SECRET: "a".repeat(32),
      VALKEY_URL: "",
    });
    expect(parsed.valkeyUrl).toBeNull();
  });
});
