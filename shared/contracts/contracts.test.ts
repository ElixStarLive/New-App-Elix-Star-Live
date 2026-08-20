import { describe, expect, it } from "vitest";
import {
  loginBodySchema,
  loginIdentifier,
  registerBodySchema,
  resetPasswordBodySchema,
  wsEnvelopeSchema,
  battleStateSchema,
  sendGiftBodySchema,
  liveTokenQuerySchema,
  cohostLayoutSchema,
} from "./index.js";

describe("contracts", () => {
  it("rejects weak register payloads", () => {
    const result = registerBodySchema.safeParse({
      email: "bad",
      username: "ab",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("requires 13+ terms consent on register", () => {
    const result = registerBodySchema.safeParse({
      email: "ok@example.com",
      username: "andrei",
      password: "password12",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional username and required consent", () => {
    const result = registerBodySchema.safeParse({
      email: "ok@example.com",
      password: "password12",
      ageConfirmed13Plus: true,
      consentVersion: "2026-07-21",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBeUndefined();
    }
  });

  it("accepts usernames with spaces", () => {
    const result = registerBodySchema.safeParse({
      email: "ok@example.com",
      username: "Anya Emily",
      password: "password12",
      ageConfirmed13Plus: true,
      consentVersion: "2026-07-21",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe("Anya Emily");
    }
  });

  it("collapses extra spaces in usernames", () => {
    const result = registerBodySchema.safeParse({
      email: "ok@example.com",
      username: "  Anya   Emily  ",
      password: "password12",
      ageConfirmed13Plus: true,
      consentVersion: "2026-07-21",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe("Anya Emily");
    }
  });

  it("accepts login email or username in the email field", () => {
    const byUsername = loginBodySchema.safeParse({
      email: "andrei",
      password: "secret-password",
    });
    const byEmail = loginBodySchema.safeParse({
      email: "andrei@example.com",
      password: "secret-password",
    });
    const legacyAlias = loginBodySchema.safeParse({
      emailOrUsername: "andrei",
      password: "secret-password",
    });
    expect(byUsername.success).toBe(true);
    expect(byEmail.success).toBe(true);
    expect(legacyAlias.success).toBe(false);
    if (byUsername.success) {
      expect(loginIdentifier(byUsername.data)).toBe("andrei");
    }
  });

  it("uses a single envelope for websocket events", () => {
    const result = wsEnvelopeSchema.safeParse({
      event: "chat_message",
      data: { body: "hi" },
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("does not allow a second name for battle types", () => {
    expect(battleStateSchema.shape.type.safeParse("1v1").success).toBe(false);
    expect(battleStateSchema.shape.type.safeParse("1x1").success).toBe(true);
  });

  it("requires gift idempotency keys", () => {
    const result = sendGiftBodySchema.safeParse({
      giftId: "rose",
      recipientId: "00000000-0000-4000-8000-000000000001",
      streamId: "00000000-0000-4000-8000-000000000002",
      idempotencyKey: "00000000-0000-4000-8000-000000000003",
    });
    expect(result.success).toBe(true);
  });

  it("limits co-host seats to eight", () => {
    const seats = Array.from({ length: 9 }, (_, seatIndex) => ({
      seatIndex,
      userId: "00000000-0000-4000-8000-000000000001",
      displayName: "x",
      avatarUrl: null,
      status: "live" as const,
    }));
    expect(
      cohostLayoutSchema.safeParse({
        streamId: "room",
        bigScreenUserId: null,
        seats,
      }).success,
    ).toBe(false);
  });

  it("authorizes live token roles", () => {
    expect(liveTokenQuerySchema.safeParse({ roomId: "abc", role: "host" }).success).toBe(true);
    expect(liveTokenQuerySchema.safeParse({ roomId: "abc", role: "publisher" }).success).toBe(false);
  });

  it("requires an 8-character password and a reset token in the body", () => {
    expect(resetPasswordBodySchema.safeParse({ token: "shorttok", password: "password12" }).success).toBe(false);
    expect(resetPasswordBodySchema.safeParse({ token: "fresh-reset-token-value", password: "short" }).success).toBe(
      false,
    );
    const parsed = resetPasswordBodySchema.safeParse({
      token: "  fresh-reset-token-value  ",
      password: "password12",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.token).toBe("fresh-reset-token-value");
  });
});
