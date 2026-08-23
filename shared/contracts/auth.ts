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
  ageConfirmed13Plus: z.literal(true).optional(),
  consentVersion: z.literal(REGISTER_CONSENT_VERSION).optional(),
});

export const loginBodySchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

/** Login identifier is posted as `email` and may be a username or an email address. */
export function loginIdentifier(body: z.infer<typeof loginBodySchema>): string {
  return body.email.trim();
}

export const authSuccessSchema = z.object({
  token: z.string(),
  user: sessionUserSchema,
});

export const productionLoginUserSchema = z.object({
  id: z.string().min(1),
  email: z.string(),
  user_metadata: z.object({
    username: z.string(),
    full_name: z.string(),
    avatar_url: z.string(),
  }),
  email_confirmed_at: z.string(),
  created_at: z.string(),
});

export const productionLoginSessionSchema = z.object({
  access_token: z.string().min(1),
  accessToken: z.string().min(1).optional(),
});

export const productionLoginProfileMetaSchema = z.object({
  is_admin: z.boolean(),
  is_creator: z.boolean(),
  banned_until: z.string().nullable(),
  starter_coin_balance: z.number(),
  total_xp: z.number(),
  level: z.number(),
});

/** Production login / Apple success body. `{ token, user }` is not this contract. */
export const productionLoginSuccessSchema = z.object({
  user: productionLoginUserSchema,
  session: productionLoginSessionSchema,
  profile_meta: productionLoginProfileMetaSchema,
});

export type ProductionLoginSuccess = z.infer<typeof productionLoginSuccessSchema>;

function sessionEmailFromProduction(email: string, userId: string): string {
  const trimmed = email.trim();
  return sessionUserSchema.shape.email.safeParse(trimmed).success ? trimmed : `${userId}@users.invalid`;
}

export function sessionUserFromProductionLogin(data: ProductionLoginSuccess): SessionUser | null {
  const parsed = sessionUserSchema.safeParse({
    id: data.user.id,
    username: data.user.user_metadata.username,
    displayName: data.user.user_metadata.full_name,
    avatarUrl: data.user.user_metadata.avatar_url || null,
    bio: "",
    isVerified: data.profile_meta.is_creator,
    followerCount: 0,
    followingCount: 0,
    email: sessionEmailFromProduction(data.user.email, data.user.id),
    isAdmin: data.profile_meta.is_admin,
    emailConfirmed: Boolean(data.user.email_confirmed_at),
  });
  return parsed.success ? parsed.data : null;
}

export const meSuccessSchema = z.object({
  user: sessionUserSchema,
});

export const productionRegisterSuccessSchema = z.object({
  user: productionLoginUserSchema,
  session: productionLoginSessionSchema.nullable(),
  profile_meta: productionLoginProfileMetaSchema.optional(),
  needsEmailConfirmation: z.boolean(),
  confirmation_email_sent: z.boolean().optional().default(false),
  welcome_message: z.string(),
});

export type ProductionRegisterSuccess = z.infer<typeof productionRegisterSuccessSchema>;

export function sessionUserFromProductionRegister(data: ProductionRegisterSuccess): SessionUser | null {
  if (data.session && data.profile_meta) {
    return sessionUserFromProductionLogin({
      user: data.user,
      session: data.session,
      profile_meta: data.profile_meta,
    });
  }
  const parsed = sessionUserSchema.safeParse({
    id: data.user.id,
    username: data.user.user_metadata.username,
    displayName: data.user.user_metadata.full_name,
    avatarUrl: data.user.user_metadata.avatar_url || null,
    bio: "",
    isVerified: false,
    followerCount: 0,
    followingCount: 0,
    email: data.user.email,
    isAdmin: false,
    emailConfirmed: Boolean(data.user.email_confirmed_at),
  });
  return parsed.success ? parsed.data : null;
}

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

/** OLD production Apple native body. Owns the `idToken` field with optional name parts. */
export const appleNativeBodySchema = z.object({
  idToken: z.string().min(10),
  givenName: z.string().trim().max(64).optional().nullable(),
  familyName: z.string().trim().max(64).optional().nullable(),
});

export const deleteAccountBodySchema = z.object({
  password: z.string().min(1).optional(),
});

export const twoFactorCodeBodySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export const twoFactorStatusSchema = z.object({
  enabled: z.boolean(),
});

export const twoFactorEnrollSchema = z.object({
  secret: z.string().min(8),
  otpauth: z.string().min(1).optional(),
  otpauth_url: z.string().min(1).optional(),
});

export const twoFactorMutationSchema = z.object({
  ok: z.literal(true),
  enabled: z.boolean(),
});
