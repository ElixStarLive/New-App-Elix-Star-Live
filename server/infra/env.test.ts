import { describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache } from "./env.js";

const prodBase = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://localhost/elix",
  JWT_SECRET: "a".repeat(64),
  CLIENT_URL: "https://www.elixstarlive.co.uk",
  VALKEY_URL: "redis://valkey.internal:6379",
  LIVEKIT_URL: "https://elix-star-live-1hh1nz1d.livekit.cloud",
  LIVEKIT_API_KEY: "APIrealkey12",
  LIVEKIT_API_SECRET: "s".repeat(40),
  BUNNY_STORAGE_ZONE: "elix-storage",
  BUNNY_STORAGE_API_KEY: "real-bunny-key-not-fake",
  BUNNY_CDN_HOSTNAME: "elixstorage.b-cdn.net",
} as const;

describe("env", () => {
  it("refuses to boot production without Valkey", () => {
    resetEnvCache();
    expect(() =>
      loadEnv({
        ...prodBase,
        VALKEY_URL: "",
        REDIS_URL: "",
      }),
    ).toThrow(/VALKEY_URL is required in production/);
  });

  it("refuses production without LiveKit", () => {
    resetEnvCache();
    expect(() =>
      loadEnv({
        ...prodBase,
        LIVEKIT_URL: "",
        LIVEKIT_API_KEY: "",
        LIVEKIT_API_SECRET: "",
      }),
    ).toThrow(/LIVEKIT_URL/);
  });

  it("refuses production without Bunny", () => {
    resetEnvCache();
    expect(() =>
      loadEnv({
        ...prodBase,
        BUNNY_STORAGE_ZONE: "",
        BUNNY_STORAGE_API_KEY: "",
        BUNNY_CDN_HOSTNAME: "",
      }),
    ).toThrow(/BUNNY_STORAGE_ZONE/);
  });

  it("refuses production fake Bunny markers", () => {
    resetEnvCache();
    expect(() =>
      loadEnv({
        ...prodBase,
        BUNNY_STORAGE_API_KEY: "integration-key",
        BUNNY_CDN_HOSTNAME: "cdn.test",
      }),
    ).toThrow(/forbidden test\/fake marker/);
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
