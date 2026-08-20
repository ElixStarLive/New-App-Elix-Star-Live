import { z } from "zod";

export const coinBucketSchema = z.enum(["paid", "promo", "starter", "test"]);

export const walletBalanceSchema = z.object({
  paidCoins: z.number().int().nonnegative(),
  promoCoins: z.number().int().nonnegative(),
  starterCoins: z.number().int().nonnegative(),
  testCoins: z.number().int().nonnegative(),
});

export type CoinBucket = z.infer<typeof coinBucketSchema>;
export type WalletBalance = z.infer<typeof walletBalanceSchema>;

/** Onboarding starter coins (not paid lots, not IAP). */
export const REGISTER_STARTER_COINS = 50_000;

export const sendGiftBodySchema = z.object({
  giftId: z.string().min(1),
  recipientId: z.string().uuid(),
  streamId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  bucket: coinBucketSchema.default("paid"),
});

export const giftCatalogItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  coinCost: z.number().int().positive(),
  animationUrl: z.string().nullable(),
});

export type GiftCatalogItem = z.infer<typeof giftCatalogItemSchema>;

export const iapVerifyBodySchema = z.object({
  provider: z.enum(["apple", "google"]),
  productId: z.string().min(1),
  receipt: z.string().min(1),
});

export const withdrawalBodySchema = z.object({
  amountPence: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
});
