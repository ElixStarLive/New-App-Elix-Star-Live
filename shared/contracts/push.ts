import { z } from "zod";

export const deviceTokenPlatformSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => (value === "iphone" ? "ios" : value))
  .pipe(z.enum(["android", "ios", "web"]));

export const deviceTokenRegisterBodySchema = z.object({
  token: z.string().trim().min(8).max(4096),
  platform: deviceTokenPlatformSchema,
});

export const deviceTokenDeleteBodySchema = z.object({
  platform: deviceTokenPlatformSchema,
});

export const deviceTokenMutationSchema = z.object({
  ok: z.literal(true),
});

export const pushNotifyResultSchema = z.object({
  configured: z.boolean(),
  sent: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  reason: z.enum(["not_configured", "no_tokens", "delivered", "provider_rejected", "unavailable"]).optional(),
});
