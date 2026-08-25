import { afterEach, describe, expect, it } from "vitest";
import { isPushConfigured, isUnregisteredPushError, pushNotifyUser } from "./send.js";

describe("PAGE-043 push_notify honesty", () => {
  const keys = [
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "FIREBASE_SERVICE_ACCOUNT_BASE64",
    "FIREBASE_PROJECT_ID",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("does not treat a missing provider as delivered", async () => {
    for (const key of keys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    expect(isPushConfigured()).toBe(false);
    const result = await pushNotifyUser("11111111-1111-4111-8111-111111111111", "Title", "Body");
    expect(result).toEqual({
      configured: false,
      sent: 0,
      failed: 0,
      reason: "not_configured",
    });
  });

  it("marks provider unregistered tokens for cleanup", () => {
    expect(isUnregisteredPushError(404, "")).toBe(true);
    expect(isUnregisteredPushError(410, "Unregistered")).toBe(true);
    expect(isUnregisteredPushError(400, '{"error":{"status":"UNREGISTERED"}}')).toBe(true);
    expect(isUnregisteredPushError(500, "unavailable")).toBe(false);
  });
});
