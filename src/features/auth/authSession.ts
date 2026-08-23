import {
  meSuccessSchema,
  productionLoginSuccessSchema,
  productionRegisterSuccessSchema,
  sessionUserFromProductionLogin,
  sessionUserFromProductionRegister,
  verifyEmailSuccessSchema,
  type SessionUser,
} from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";

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

function registerDisplayName(email: string, username?: string): string {
  const fromUsername = username?.trim();
  if (fromUsername) return fromUsername.slice(0, 48);
  const local = (email.split("@")[0] ?? "user").trim() || "user";
  return local.slice(0, 48);
}

export function displayLoginError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid") || lower.includes("credentials")) {
    return "Incorrect email/username or password.";
  }
  if (lower.includes("confirm")) {
    return "Please verify your email address before logging in.";
  }
  return message || "Login failed. Please try again.";
}

function parseProductionLogin(data: unknown): AuthLoginResult {
  const parsed = productionLoginSuccessSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Invalid login response from server." };
  const user = sessionUserFromProductionLogin(parsed.data);
  if (!user) return { ok: false, error: "Invalid login response from server." };
  return { ok: true, token: parsed.data.session.access_token, user };
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
  return parseProductionLogin(data);
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
  const parsed = productionRegisterSuccessSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Invalid registration response from server." };
  const user = sessionUserFromProductionRegister(parsed.data);
  if (!user) return { ok: false, error: "Invalid registration response from server." };
  return {
    ok: true,
    token: parsed.data.session?.access_token ?? null,
    user,
    needsEmailConfirmation: parsed.data.needsEmailConfirmation,
    confirmationEmailSent: parsed.data.confirmation_email_sent,
    welcomeMessage: parsed.data.welcome_message,
  };
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
  const parsed = meSuccessSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Invalid session response", isAuthFailure: false };
  }
  return { ok: true, token: null, user: parsed.data.user };
}

export async function authLogout(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>("/api/auth/logout", { method: "POST" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function authResendConfirmation(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, error: "Email is required." };
  const { error } = await apiRequest<unknown>("/api/auth/resend-confirmation", {
    method: "POST",
    body: JSON.stringify({ email: trimmed }),
  });
  if (error) return { ok: false, error: error.message || "Unable to resend confirmation email." };
  return { ok: true };
}

export async function authForgotPassword(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { ok: false, error: "Email is required." };
  }
  const { error } = await apiRequest<unknown>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: trimmed }),
  });
  if (error) return { ok: false, error: error.message || "Unable to process request. Please try again." };
  return { ok: true };
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
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, error: "Invalid or missing reset link. Please request a new password reset." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  const { error } = await apiRequest<unknown>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: trimmed, password }),
  });
  if (error) return { ok: false, error: error.message || "Failed to reset password. Please try again." };
  return { ok: true };
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
  const parsed = parseProductionLogin(data);
  if (!parsed.ok) return { ok: false, error: "Invalid Apple sign-in response." };
  return parsed;
}

export async function authDeleteAccount(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>("/api/auth/delete", { method: "POST" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function authSaveConsent(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>("/api/auth/consent", {
    method: "POST",
    body: JSON.stringify({
      consent_type: "terms_privacy_and_age_13_plus",
      version: "2026-07-21",
      age_confirmed_13_plus: true,
    }),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
