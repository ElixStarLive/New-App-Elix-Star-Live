import {
  authSuccessSchema,
  REGISTER_WELCOME_STARTER,
  registerSuccessSchema,
  sessionUserSchema,
  verifyEmailSuccessSchema,
  type SessionUser,
} from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";
import { apiMutate, type MutationResult } from "@/lib/apiResult";
import { isRecord } from "@/lib/isRecord";

export type AuthLoginResult =
  | { ok: true; token: string; user: SessionUser }
  | { ok: false; error: string; code?: string };

export type AuthRegisterResult =
  | {
      ok: true;
      token: string | null;
      user: SessionUser;
      needsEmailConfirmation: boolean;
      confirmationEmailSent: boolean;
      welcomeMessage: string;
    }
  | { ok: false; error: string; code?: string };

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function tokenFromAuthPayload(data: Record<string, unknown>): string | null {
  const direct = asNonEmptyString(data.token);
  if (direct) return direct;
  const session = recordFromUnknown(data.session);
  if (!session) return null;
  return asNonEmptyString(session.access_token) || asNonEmptyString(session.accessToken) || null;
}

function authPayloadRecord(data: unknown): Record<string, unknown> | null {
  if (typeof data === "string") {
    try {
      return recordFromUnknown(JSON.parse(data));
    } catch {
      return null;
    }
  }
  const root = recordFromUnknown(data);
  if (!root) return null;
  if (recordFromUnknown(root.user) || recordFromUnknown(root.session) || asNonEmptyString(root.token)) {
    return root;
  }
  const nested = recordFromUnknown(root.data);
  if (nested && (recordFromUnknown(nested.user) || recordFromUnknown(nested.session) || asNonEmptyString(nested.token))) {
    return nested;
  }
  return root;
}

function sessionUserFromAuthPayload(data: Record<string, unknown>): SessionUser | null {
  const direct = sessionUserSchema.safeParse(data.user);
  if (direct.success) return direct.data;
  const user = recordFromUnknown(data.user);
  if (!user) return null;
  const meta = recordFromUnknown(user.user_metadata);
  const profile = recordFromUnknown(data.profile_meta);
  const id = user.id === undefined || user.id === null ? "" : String(user.id).trim();
  const username = asNonEmptyString(user.username) || asNonEmptyString(meta?.username);
  const displayName =
    asNonEmptyString(user.displayName) ||
    asNonEmptyString(user.display_name) ||
    asNonEmptyString(meta?.full_name) ||
    username;
  const email = asNonEmptyString(user.email);
  const avatarRaw =
    typeof user.avatarUrl === "string"
      ? user.avatarUrl
      : typeof user.avatar_url === "string"
        ? user.avatar_url
        : typeof meta?.avatar_url === "string"
          ? meta.avatar_url
          : null;
  const parsed = sessionUserSchema.safeParse({
    id,
    username: username || "user",
    displayName: displayName || username || "user",
    avatarUrl: avatarRaw === "" ? null : avatarRaw,
    bio: typeof user.bio === "string" ? user.bio : "",
    isVerified: user.isVerified === true || user.is_verified === true,
    followerCount: typeof user.followerCount === "number" ? user.followerCount : 0,
    followingCount: typeof user.followingCount === "number" ? user.followingCount : 0,
    email,
    isAdmin: user.isAdmin === true || profile?.is_admin === true,
    emailConfirmed:
      user.emailConfirmed === true ||
      Boolean(asNonEmptyString(user.email_confirmed_at) || user.email_confirmed_at === true),
  });
  return parsed.success ? parsed.data : null;
}

function parseRegisterSuccess(data: unknown): AuthRegisterResult {
  const parsed = registerSuccessSchema.safeParse(data);
  if (parsed.success) return { ok: true, ...parsed.data };
  const payload = authPayloadRecord(data);
  if (!payload) return { ok: false, error: "Invalid registration response from server." };
  const user = sessionUserFromAuthPayload(payload);
  if (!user) return { ok: false, error: "Invalid registration response from server." };
  const confirmationEmailSent =
    payload.confirmationEmailSent === true || payload.confirmation_email_sent === true;
  const welcomeMessage =
    asNonEmptyString(payload.welcomeMessage) ||
    asNonEmptyString(payload.welcome_message) ||
    (payload.needsEmailConfirmation === true
      ? "Please check your email to confirm your account."
      : REGISTER_WELCOME_STARTER);
  return {
    ok: true,
    token: tokenFromAuthPayload(payload),
    user,
    needsEmailConfirmation: payload.needsEmailConfirmation === true || tokenFromAuthPayload(payload) === null,
    confirmationEmailSent,
    welcomeMessage,
  };
}

function registerDisplayName(email: string, username?: string): string {
  const fromUsername = username?.trim();
  if (fromUsername) return fromUsername.slice(0, 48);
  const local = (email.split("@")[0] ?? "user").trim() || "user";
  return local.slice(0, 48);
}

export type AuthMeResult =
  | { ok: true; token: string | null; user: SessionUser }
  | { ok: false; error: string; isAuthFailure: boolean };

function isAuthFailureMessage(msg: string, status: number): boolean {
  return (
    status === 401 ||
    status === 403 ||
    /invalid|expired|revoked|unauthorized|forbidden|session|unauthenticated/i.test(msg)
  );
}

function parseAuthSuccess(data: unknown): { token: string; user: SessionUser } | null {
  const parsed = authSuccessSchema.safeParse(data);
  if (parsed.success) return parsed.data;
  const payload = authPayloadRecord(data);
  if (!payload) return null;
  const token = tokenFromAuthPayload(payload) || asNonEmptyString(payload.access_token) || asNonEmptyString(payload.accessToken);
  const user = sessionUserFromAuthPayload(payload);
  if (!token || !user) return null;
  return { token, user };
}

export async function authLoginWithPassword(
  emailOrUsername: string,
  password: string,
): Promise<AuthLoginResult> {
  if (!emailOrUsername || !password) {
    return { ok: false, error: "Please enter both email and password." };
  }
  const { data, error } = await apiRequest<unknown>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: emailOrUsername.trim(),
      password,
    }),
  });
  if (error) return { ok: false, error: error.message || "Login failed. Please try again.", code: error.code };
  const parsed = parseAuthSuccess(data);
  if (!parsed) return { ok: false, error: "Invalid login response from server." };
  return { ok: true, token: parsed.token, user: parsed.user };
}

export async function authRegister(body: {
  email: string;
  password: string;
  username?: string;
  displayName?: string;
  ageConfirmed13Plus: true;
  consentVersion: "2026-07-21";
}): Promise<AuthRegisterResult> {
  const username = body.username?.trim() || undefined;
  const payload = {
    email: body.email,
    password: body.password,
    username,
    displayName: (body.displayName?.trim() || registerDisplayName(body.email, username)).slice(0, 48),
    ageConfirmed13Plus: body.ageConfirmed13Plus,
    consentVersion: body.consentVersion,
  };
  const { data, error } = await apiRequest<unknown>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (error) return { ok: false, error: error.message || "Registration failed.", code: error.code };
  return parseRegisterSuccess(data);
}

export async function authGetMe(): Promise<AuthMeResult> {
  const { data, error } = await apiRequest<unknown>("/api/auth/me");
  if (error) {
    return {
      ok: false,
      error: error.message,
      isAuthFailure: isAuthFailureMessage(error.message, error.status),
    };
  }
  const parsed = parseAuthSuccess(data);
  if (parsed) return { ok: true, token: parsed.token, user: parsed.user };
  const payload = authPayloadRecord(data);
  const mapped = payload ? sessionUserFromAuthPayload(payload) : null;
  if (mapped) return { ok: true, token: null, user: mapped };
  const userOnly = sessionUserSchema.safeParse(isRecord(data) ? data.user ?? data : data);
  if (!userOnly.success) {
    return { ok: false, error: "Invalid session response", isAuthFailure: false };
  }
  return { ok: true, token: null, user: userOnly.data };
}

export async function authLogout(): Promise<MutationResult> {
  return apiMutate("/api/auth/logout");
}

export async function authForgotPassword(email: string): Promise<MutationResult> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { ok: false, error: "Email is required." };
  }
  return apiMutate(
    "/api/auth/forgot-password",
    "POST",
    { email: trimmed },
    "Unable to process request. Please try again.",
  );
}

export async function authVerifyEmail(
  token: string,
): Promise<{ ok: true; alreadyConfirmed: boolean } | { ok: false; error: string }> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "This verification link is missing a token." };
  const { data, error } = await apiRequest<unknown>("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token: trimmed }),
  });
  if (error) return { ok: false, error: error.message || "Email confirmation failed. Please try again." };
  const parsed = verifyEmailSuccessSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Invalid verification response from server." };
  return { ok: true, alreadyConfirmed: parsed.data.alreadyConfirmed };
}

export async function authResetPassword(
  token: string,
  password: string,
): Promise<MutationResult> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, error: "Invalid or missing reset link. Please request a new password reset." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  return apiMutate(
    "/api/auth/reset-password",
    "POST",
    { token: trimmed, password },
    "Failed to reset password. Please try again.",
  );
}

export async function authAppleNative(
  identityToken: string,
  nonce?: string,
): Promise<AuthLoginResult> {
  const { data, error } = await apiRequest<unknown>("/api/auth/apple/native", {
    method: "POST",
    body: JSON.stringify({ identityToken, nonce }),
  });
  if (error) return { ok: false, error: error.message || "Apple sign-in failed." };
  const parsed = parseAuthSuccess(data);
  if (!parsed) return { ok: false, error: "Invalid Apple sign-in response." };
  return { ok: true, token: parsed.token, user: parsed.user };
}

export async function authDeleteAccount(password?: string): Promise<MutationResult> {
  return apiMutate("/api/auth/delete-account", "POST", { password });
}

export async function authSaveConsent(): Promise<MutationResult> {
  return apiMutate("/api/auth/consent", "POST", {
    consent_type: "terms_privacy_and_age_13_plus",
    version: "2026-07-21",
    age_confirmed_13_plus: true,
  });
}
