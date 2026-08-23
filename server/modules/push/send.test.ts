import { describe, expect, it } from "vitest";
import { isPushConfigured, isUnregisteredPushError, pushNotifyUser } from "./send.js";

describe("PAGE-043 push_notify honesty", () => {
  it("does not treat a missing provider as delivered", async () => {
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
