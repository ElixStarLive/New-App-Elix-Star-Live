import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const incr = vi.fn(async (key: string) => {
  const next = Number(store.get(key) ?? "0") + 1;
  store.set(key, String(next));
  return next;
});
const get = vi.fn(async (key: string) => store.get(key) ?? null);
const expire = vi.fn(async () => 1);

vi.mock("../../infra/env.js", () => ({
  env: () => ({ valkeyUrl: "redis://test" }),
}));

vi.mock("../../infra/valkey.js", () => ({
  requireValkey: () => ({ get, incr, expire }),
}));

vi.mock("../../infra/postgres.js", () => ({
  getPool: () => {
    throw new Error("postgres should not be used in rate-limit tests");
  },
  withTransaction: async () => {
    throw new Error("postgres should not be used in rate-limit tests");
  },
}));

import {
  assertPasswordResetRequestAllowed,
  PASSWORD_RESET_REQUEST_MAX,
  passwordResetRequestKey,
  recordPasswordResetRequest,
} from "./passwordReset.js";

describe("password reset request rate limit", () => {
  beforeEach(() => {
    store.clear();
    get.mockClear();
    incr.mockClear();
    expire.mockClear();
  });

  it("uses a hash of the normalized email so known and unknown share a key", () => {
    expect(passwordResetRequestKey("andrei@example.com")).toMatch(/^auth:reset:req:[a-f0-9]{64}$/);
    expect(passwordResetRequestKey("andrei@example.com")).toBe(passwordResetRequestKey("andrei@example.com"));
    expect(passwordResetRequestKey("andrei@example.com")).not.toBe(passwordResetRequestKey("other@example.com"));
  });

  it("allows the configured number of requests then rate-limits", async () => {
    for (let i = 0; i < PASSWORD_RESET_REQUEST_MAX; i += 1) {
      await assertPasswordResetRequestAllowed("andrei@example.com");
      await recordPasswordResetRequest("andrei@example.com");
    }
    await expect(assertPasswordResetRequestAllowed("andrei@example.com")).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
      message: "Too many reset requests. Please try again later.",
    });
  });
});
