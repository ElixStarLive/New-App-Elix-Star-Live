import { z } from "zod";

export const errorCodeSchema = z.enum([
  "unauthenticated",
  "forbidden",
  "invalid_credentials",
  "requires_2fa",
  "validation_error",
  "not_found",
  "conflict",
  "rate_limited",
  "unavailable",
  "banned",
  "session_expired",
  "insufficient_balance",
  "duplicate",
  "livekit_error",
  "payment_failed",
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorSchema = z.object({
  error: errorCodeSchema,
  message: z.string(),
});

export const userPublicSchema = z.object({
  id: z.string().min(1),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  bio: z.string(),
  isVerified: z.boolean(),
  followerCount: z.number().int().nonnegative(),
  followingCount: z.number().int().nonnegative(),
  likeCount: z.number().int().nonnegative().optional(),
  viewCount: z.number().int().nonnegative().optional(),
  isLive: z.boolean().optional(),
  isFollowing: z.boolean().optional(),
});

export type UserPublic = z.infer<typeof userPublicSchema>;

export const sessionUserSchema = userPublicSchema.extend({
  email: z.string().email(),
  isAdmin: z.boolean(),
  emailConfirmed: z.boolean(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

export function canonicalizeUsername(username: string): string {
  return username.trim().replace(/\s+/g, " ");
}

export const usernameSchema = z
  .string()
  .transform(canonicalizeUsername)
  .pipe(
    z
      .string()
      .min(3)
      .max(24)
      .regex(
        /^[a-zA-Z0-9_]+(?: [a-zA-Z0-9_]+)*$/,
        "Username can only use letters, numbers, underscores, and spaces.",
      ),
  );

export const REGISTER_CONSENT_TYPE = "terms_privacy_and_age_13_plus";
export const REGISTER_CONSENT_VERSION = "2026-07-21";
export const REGISTER_WELCOME_STARTER =
  "Welcome! You received 50,000 Starter Coins to explore gifts and support creators.";

export const registerBodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  username: z.preprocess((value) => {
    if (typeof value !== "string") return undefined;
    return value.trim() === "" ? undefined : value;
  }, usernameSchema.optional()),
  displayName: z.string().trim().min(1).max(48).optional(),
  ageConfirmed13Plus: z.literal(true),
  consentVersion: z.literal(REGISTER_CONSENT_VERSION),
});

export const loginBodySchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
  totpCode: z.string().regex(/^\d{6}$/).optional(),
});

/** Login identifier: `email` may be a username (PAGE-001 / OLD contract). */
export function loginIdentifier(body: z.infer<typeof loginBodySchema>): string {
  return body.email.trim();
}

export const authSuccessSchema = z.object({
  token: z.string(),
  user: sessionUserSchema,
});

export const registerSuccessSchema = z.object({
  token: z.string().nullable(),
  user: sessionUserSchema,
  needsEmailConfirmation: z.boolean(),
  confirmationEmailSent: z.boolean(),
  welcomeMessage: z.string(),
});

export const forgotPasswordBodySchema = z.object({
  email: z.string().trim().email(),
});

export const resetPasswordBodySchema = z.object({
  token: z.string().trim().min(10),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
});

export const verifyEmailBodySchema = z.object({
  token: z.string().trim().min(10),
});

export const verifyEmailSuccessSchema = z.object({
  ok: z.literal(true),
  alreadyConfirmed: z.boolean(),
});

export const appleNativeBodySchema = z.object({
  identityToken: z.string().min(10),
  nonce: z.string().optional(),
  totpCode: z.string().regex(/^\d{6}$/).optional(),
});

export const deleteAccountBodySchema = z.object({
  password: z.string().min(1).optional(),
});
