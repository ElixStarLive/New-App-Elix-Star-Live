import { z } from "zod";

export const coinBucketSchema = z.enum(["paid", "promo", "starter", "test"]);

/** GET /api/wallet wire contract. Test coins are never included. One key per bucket. */
export const walletBalanceSchema = z.object({
  user_id: z.string().min(1).optional(),
  coin_balance: z.number().int().nonnegative(),
  starter_balance: z.number().int().nonnegative(),
  promotional_balance: z.number().int().nonnegative(),
});

export const testCoinBalanceSchema = z.object({
  balance: z.number().int().nonnegative(),
});

export type CoinBucket = z.infer<typeof coinBucketSchema>;
export type WalletBalance = z.infer<typeof walletBalanceSchema>;
export type TestCoinBalance = z.infer<typeof testCoinBalanceSchema>;

export type WalletMoneyBalances = {
  paidCoins: number;
  starterCoins: number;
  promoCoins: number;
};

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
  productId: z.string().min(1).optional(),
  packageId: z.string().min(1).optional(),
  receipt: z.string().min(1),
  transactionId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
}).refine((body) => Boolean((body.productId || body.packageId || "").trim()), {
  message: "productId is required",
});

export const creatorWithdrawBodySchema = z.object({
  amount_pence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  idempotency_key: z.string().min(8).max(120),
});

export const creatorPayoutMethodBodySchema = z.object({
  type: z.enum(["bank", "paypal"]),
  details: z.record(z.string(), z.unknown()),
});

export const creatorBalanceGbpSchema = z.object({
  pending_pence: z.number().int(),
  available_pence: z.number().int(),
  withdrawn_pence: z.number().int(),
  reversed_pence: z.number().int(),
  held_pence: z.number().int(),
});

export const creatorBalanceSchema = z.object({
  pending_coins: z.number().int(),
  available_coins: z.number().int(),
  locked_coins: z.number().int(),
  total_earned: z.number().int(),
  total_withdrawn: z.number().int(),
  gbp: creatorBalanceGbpSchema,
  rewards: z.object({
    qualified_views_30d: z.number().int(),
    current_reward_pence: z.number().int(),
    next_milestone_views: z.number().int().nullable(),
    next_milestone_reward_pence: z.number().int().nullable(),
  }),
  earnings_by_source: z.object({
    gifts_pence: z.number().int(),
    subscriptions_pence: z.number().int(),
    rewards_pence: z.number().int(),
    reversals_pence: z.number().int(),
  }),
  active_subscribers: z.number().int(),
});

export const creatorLedgerRowSchema = z.object({
  id: z.string().min(1),
  revenue_source: z.string(),
  creator_amount_pence: z.number().int(),
  status: z.string(),
  created_at: z.string().optional(),
});

export const creatorLedgerResponseSchema = z.object({
  ledger: z.array(creatorLedgerRowSchema),
});

export const creatorWithdrawalRowSchema = z.object({
  id: z.string().min(1),
  amount_pence: z.number().int(),
  status: z.string(),
  created_at: z.string().optional(),
  payout_provider_ref: z.string().nullable().optional(),
});

export const creatorWithdrawalsResponseSchema = z.object({
  withdrawals: z.array(creatorWithdrawalRowSchema),
});

export const creatorPayoutMethodSchema = z.object({
  id: z.string().min(1),
  type: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  is_default: z.boolean().optional(),
});

export const creatorPayoutMethodsResponseSchema = z.object({
  methods: z.array(creatorPayoutMethodSchema),
});

export const creatorPayoutAccountSchema = z.object({
  ok: z.literal(true),
  accountId: z.string().nullable(),
  onboardingUrl: z.string().nullable().optional(),
  payouts_enabled: z.boolean(),
  charges_enabled: z.boolean(),
  verificationStatus: z.string(),
  status: z.string(),
});

export const creatorOnboardResponseSchema = z.object({
  ok: z.literal(true),
  onboardingUrl: z.string().min(1),
  payouts_enabled: z.literal(false),
});

export const creatorWithdrawResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string().min(1),
  status: z.string(),
  already_exists: z.boolean(),
});

export type CreatorBalance = z.infer<typeof creatorBalanceSchema>;
export type CreatorLedgerRow = z.infer<typeof creatorLedgerRowSchema>;
export type CreatorWithdrawalRow = z.infer<typeof creatorWithdrawalRowSchema>;
export type CreatorPayoutMethod = z.infer<typeof creatorPayoutMethodSchema>;
export type CreatorPayoutAccount = z.infer<typeof creatorPayoutAccountSchema>;
