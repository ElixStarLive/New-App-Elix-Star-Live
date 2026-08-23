import { describe, expect, it } from "vitest";
import {
  loginBodySchema,
  loginIdentifier,
  productionLoginSuccessSchema,
  productionRegisterSuccessSchema,
  sessionUserFromProductionLogin,
  sessionUserFromProductionRegister,
  registerBodySchema,
  resetPasswordBodySchema,
  wsEnvelopeSchema,
  battleStateSchema,
  sendGiftBodySchema,
  liveTokenQuerySchema,
  cohostLayoutSchema,
  inboxMessageEventSchema,
  inboxThreadDetailSchema,
  callInviteEventSchema,
  twoFactorCodeBodySchema,
  twoFactorStatusSchema,
  deviceTokenRegisterBodySchema,
  deviceTokenDeleteBodySchema,
  appleNativeBodySchema,
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

  it("accepts the production register body without consent fields", () => {
    const result = registerBodySchema.safeParse({
      email: "ok@example.com",
      username: "andrei",
      password: "password12",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional username and optional consent", () => {
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

  it("accepts the production login success body and rejects { token, user }", () => {
    const production = productionLoginSuccessSchema.safeParse({
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "andrei@example.com",
        user_metadata: { username: "andrei", full_name: "Andrei", avatar_url: "" },
        email_confirmed_at: "2026-08-01T00:00:00.000Z",
        created_at: "2026-08-01T00:00:00.000Z",
      },
      session: { access_token: "prod-tok", accessToken: "prod-tok" },
      profile_meta: {
        is_admin: false,
        is_creator: true,
        banned_until: null,
        starter_coin_balance: 50000,
        total_xp: 0,
        level: 1,
      },
    });
    expect(production.success).toBe(true);
    if (production.success) {
      const user = sessionUserFromProductionLogin(production.data);
      expect(user?.username).toBe("andrei");
      expect(user?.isVerified).toBe(true);
    }
    expect(
      productionLoginSuccessSchema.safeParse({
        token: "tok",
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          username: "andrei",
          displayName: "Andrei",
          avatarUrl: null,
          bio: "",
          isVerified: false,
          followerCount: 0,
          followingCount: 0,
          email: "andrei@example.com",
          isAdmin: false,
          emailConfirmed: true,
        },
      }).success,
    ).toBe(false);
  });

  it("accepts the production register success body and rejects { token, user }", () => {
    const confirmed = productionRegisterSuccessSchema.safeParse({
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "andrei@example.com",
        user_metadata: { username: "andrei", full_name: "andrei", avatar_url: "" },
        email_confirmed_at: "2026-08-01T00:00:00.000Z",
        created_at: "2026-08-01T00:00:00.000Z",
      },
      session: { access_token: "prod-tok", accessToken: "prod-tok" },
      profile_meta: {
        is_admin: false,
        is_creator: false,
        banned_until: null,
        starter_coin_balance: 50000,
        total_xp: 0,
        level: 0,
      },
      needsEmailConfirmation: false,
      welcome_message: "Welcome! You received 50,000 Starter Coins to explore gifts and support creators.",
    });
    expect(confirmed.success).toBe(true);
    if (confirmed.success) {
      const user = sessionUserFromProductionRegister(confirmed.data);
      expect(user?.username).toBe("andrei");
      expect(confirmed.data.confirmation_email_sent).toBe(false);
    }

    const pending = productionRegisterSuccessSchema.safeParse({
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "andrei@example.com",
        user_metadata: { username: "andrei", full_name: "andrei", avatar_url: "" },
        email_confirmed_at: "",
        created_at: "2026-08-01T00:00:00.000Z",
      },
      session: null,
      needsEmailConfirmation: true,
      confirmation_email_sent: true,
      welcome_message: "Check your email to confirm your account before signing in.",
    });
    expect(pending.success).toBe(true);
    if (pending.success) {
      expect(sessionUserFromProductionRegister(pending.data)?.emailConfirmed).toBe(false);
    }

    expect(
      productionRegisterSuccessSchema.safeParse({
        token: "tok",
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          username: "andrei",
          displayName: "Andrei",
          avatarUrl: null,
          bio: "",
          isVerified: false,
          followerCount: 0,
          followingCount: 0,
          email: "andrei@example.com",
          isAdmin: false,
          emailConfirmed: true,
        },
        needsEmailConfirmation: false,
        confirmationEmailSent: false,
        welcomeMessage: "Welcome! You received 50,000 Starter Coins to explore gifts and support creators.",
      }).success,
    ).toBe(false);
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

  it("accepts PAGE-033 inbox message and thread detail contracts", () => {
    expect(
      inboxMessageEventSchema.safeParse({
        threadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        message: {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          threadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          senderId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          body: "hello",
          createdAt: "2026-08-21T00:00:00.000Z",
        },
      }).success,
    ).toBe(true);
    expect(
      inboxThreadDetailSchema.safeParse({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        otherUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        otherUsername: "peer",
        otherDisplayName: "Peer",
        otherAvatarUrl: null,
        otherLevel: 1,
        blocked: false,
        otherUnavailable: false,
        canSend: true,
      }).success,
    ).toBe(true);
    expect(
      callInviteEventSchema.safeParse({
        callId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        callerId: "11111111-1111-4111-8111-111111111111",
        calleeId: "22222222-2222-4222-8222-222222222222",
        callerUsername: "Maya",
        callerAvatar: "",
        threadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        roomName: "call_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }).success,
    ).toBe(true);
    expect(
      callInviteEventSchema.safeParse({
        callId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        callerId: "11111111-1111-4111-8111-111111111111",
        calleeId: "22222222-2222-4222-8222-222222222222",
        callerUsername: "Maya",
        callerAvatar: "",
        threadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        roomName: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }).success,
    ).toBe(false);
  });

  it("requires a 6-digit 2FA code and an enabled boolean on status", () => {
    expect(twoFactorCodeBodySchema.safeParse({ code: "123456" }).success).toBe(true);
    expect(twoFactorCodeBodySchema.safeParse({ code: "12345" }).success).toBe(false);
    expect(twoFactorCodeBodySchema.safeParse({ code: "abcdef" }).success).toBe(false);
    expect(twoFactorCodeBodySchema.safeParse({ userId: "other", code: "123456" }).success).toBe(true);
    expect(twoFactorStatusSchema.safeParse({ enabled: false }).success).toBe(true);
    expect(twoFactorStatusSchema.safeParse({ enrolled: true }).success).toBe(false);
    expect(loginBodySchema.safeParse({ email: "andrei", password: "secret-password" }).success).toBe(true);
    expect(loginBodySchema.safeParse({ email: "andrei", password: "secret-password", totpCode: "123456" }).success).toBe(
      true,
    );
    expect(
      appleNativeBodySchema.safeParse({
        idToken: "apple-id-token-value-long-enough",
        givenName: "Andrei",
        familyName: "Berica",
      }).success,
    ).toBe(true);
    expect(
      appleNativeBodySchema.safeParse({
        identityToken: "apple-id-token-value-long-enough",
      }).success,
    ).toBe(false);
    expect(appleNativeBodySchema.safeParse({ idToken: "short" }).success).toBe(false);
  });

  it("accepts only real device-token platforms and rejects empty tokens", () => {
    expect(deviceTokenRegisterBodySchema.safeParse({ token: "device-token-1", platform: "android" }).success).toBe(true);
    expect(deviceTokenRegisterBodySchema.safeParse({ token: "device-token-1", platform: "iphone" }).success).toBe(true);
    expect(deviceTokenRegisterBodySchema.parse({ token: "device-token-1", platform: "iphone" }).platform).toBe("ios");
    expect(deviceTokenRegisterBodySchema.safeParse({ token: "   ", platform: "ios" }).success).toBe(false);
    expect(deviceTokenRegisterBodySchema.safeParse({ token: "short", platform: "ios" }).success).toBe(false);
    expect(deviceTokenRegisterBodySchema.safeParse({ token: "device-token-1", platform: "windows" }).success).toBe(false);
    expect(deviceTokenDeleteBodySchema.safeParse({ platform: "ios" }).success).toBe(true);
    expect(deviceTokenDeleteBodySchema.safeParse({ platform: "unknown" }).success).toBe(false);
  });
});
