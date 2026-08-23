import { z } from "zod";

export const engagementDailyLoginSchema = z.object({
  can_claim: z.boolean(),
  streak_day: z.number().int().nonnegative(),
  claimed_today: z.boolean(),
});

export const engagementHubSchema = z.object({
  promotional_coins: z.number().int().nonnegative(),
  battle_energy: z.number().int().nonnegative(),
  total_xp: z.number().int().nonnegative(),
  fan_level: z.number().int().nonnegative(),
  fan_tier: z.string().min(1),
  missions_open: z.number().int().nonnegative(),
  daily_login: engagementDailyLoginSchema,
  starter_coin_balance: z.number().int().nonnegative(),
});

export const engagementHubResponseSchema = z.object({
  hub: engagementHubSchema,
});

export const engagementMissionSchema = z.object({
  id: z.string().min(1),
  scope: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  goal_count: z.number().int().positive(),
  reward_xp: z.number().int().nonnegative(),
  reward_promo_coins: z.number().int().nonnegative(),
  reward_energy: z.number().int().nonnegative(),
  metric_key: z.string().min(1),
  period_key: z.string().min(1),
  progress: z.number().int().nonnegative(),
  completed: z.boolean(),
  claimed: z.boolean(),
});

export const engagementMissionsResponseSchema = z.object({
  missions: z.array(engagementMissionSchema),
});

export const engagementMissionClaimResponseSchema = z.object({
  ok: z.literal(true),
  alreadyClaimed: z.boolean().optional(),
});

export const engagementFanLevelSchema = z.object({
  level: z.number().int().nonnegative(),
  tier: z.string().min(1),
  total_xp: z.number().int().nonnegative(),
  title: z.string().nullable(),
  badge_code: z.string().nullable(),
  next_level_total_xp: z.number().int().nonnegative().nullable(),
  xp_to_next_level: z.number().int().nonnegative().nullable(),
});

export const engagementFanLevelResponseSchema = z.object({
  fan_level: engagementFanLevelSchema,
});

export const engagementMvpPeriodSchema = z.enum(["today", "week", "all"]);

export const engagementMvpRowSchema = z.object({
  rank: z.number().int().positive(),
  user_id: z.string().min(1),
  points: z.number().int().nonnegative(),
});

export const engagementMvpResponseSchema = z.object({
  period: engagementMvpPeriodSchema,
  leaderboard: z.array(engagementMvpRowSchema),
  viewer_id: z.string().min(1),
});

export const engagementAchievementSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  icon: z.string().min(1),
  goal_count: z.number().int().positive(),
  reward_xp: z.number().int().nonnegative(),
  reward_promo_coins: z.number().int().nonnegative(),
  rarity: z.string().min(1),
  progress: z.number().int().nonnegative(),
  unlocked: z.boolean(),
  unlocked_at: z.string().nullable(),
  claimed: z.boolean(),
});

export const engagementAchievementsResponseSchema = z.object({
  achievements: z.array(engagementAchievementSchema),
});

export const engagementRewardWalletSchema = z.object({
  purchasedCoins: z.number().int().nonnegative(),
  starterCoins: z.number().int().nonnegative(),
  promotionalCoins: z.number().int().nonnegative(),
  totalGiftSpendable: z.number().int().nonnegative(),
  battleEnergy: z.number().int().nonnegative(),
  totalXp: z.number().int().nonnegative(),
  fanLevel: z.number().int().nonnegative(),
  fanTier: z.string().min(1),
});

export const engagementRewardWalletResponseSchema = z.object({
  wallet: engagementRewardWalletSchema,
});

export const engagementDailyRewardSchema = z.object({
  streak_day: z.number().int().min(1).max(7),
  reward_xp: z.number().int().nonnegative(),
  reward_promo_coins: z.number().int().nonnegative(),
  reward_label: z.string().min(1),
});

export const engagementDailyLoginStateSchema = engagementDailyLoginSchema.extend({
  streak_day: z.number().int().min(1).max(7),
  next_reward: engagementDailyRewardSchema.nullable(),
  days: z.array(engagementDailyRewardSchema).length(7),
});

export const engagementDailyLoginResponseSchema = z.object({
  daily: engagementDailyLoginStateSchema,
});

export const engagementDailyLoginClaimResponseSchema = z.object({
  ok: z.literal(true),
  alreadyClaimed: z.boolean().optional(),
  daily: engagementDailyLoginStateSchema,
  reward: engagementDailyRewardSchema.nullable(),
});

export type EngagementDailyLogin = z.infer<typeof engagementDailyLoginSchema>;
export type EngagementHub = z.infer<typeof engagementHubSchema>;
export type EngagementHubResponse = z.infer<typeof engagementHubResponseSchema>;
export type EngagementMission = z.infer<typeof engagementMissionSchema>;
export type EngagementMissionsResponse = z.infer<typeof engagementMissionsResponseSchema>;
export type EngagementMissionClaimResponse = z.infer<typeof engagementMissionClaimResponseSchema>;
export type EngagementFanLevel = z.infer<typeof engagementFanLevelSchema>;
export type EngagementFanLevelResponse = z.infer<typeof engagementFanLevelResponseSchema>;
export type EngagementMvpPeriod = z.infer<typeof engagementMvpPeriodSchema>;
export type EngagementMvpRow = z.infer<typeof engagementMvpRowSchema>;
export type EngagementMvpResponse = z.infer<typeof engagementMvpResponseSchema>;
export type EngagementAchievement = z.infer<typeof engagementAchievementSchema>;
export type EngagementAchievementsResponse = z.infer<typeof engagementAchievementsResponseSchema>;
export type EngagementRewardWallet = z.infer<typeof engagementRewardWalletSchema>;
export type EngagementRewardWalletResponse = z.infer<typeof engagementRewardWalletResponseSchema>;
export type EngagementDailyReward = z.infer<typeof engagementDailyRewardSchema>;
export type EngagementDailyLoginState = z.infer<typeof engagementDailyLoginStateSchema>;
export type EngagementDailyLoginResponse = z.infer<typeof engagementDailyLoginResponseSchema>;
export type EngagementDailyLoginClaimResponse = z.infer<typeof engagementDailyLoginClaimResponseSchema>;

export const engagementChestCatalogSchema = z.object({
  id: z.string().min(1),
  rarity: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  reward_xp: z.number().int().nonnegative(),
  reward_promo_coins: z.number().int().nonnegative(),
  reward_energy: z.number().int().nonnegative(),
  reward_label: z.string().min(1),
});

export const engagementChestSchema = z.object({
  id: z.string().min(1),
  chest_def_id: z.string().min(1),
  title: z.string().min(1),
  rarity: z.string().min(1),
  status: z.enum(["found", "opened", "expired"]),
  source: z.string(),
  location_hint: z.string(),
  reward_label: z.string(),
  reward_xp: z.number().int().nonnegative(),
  reward_promo_coins: z.number().int().nonnegative(),
  reward_energy: z.number().int().nonnegative(),
  created_at: z.string().min(1),
  opened_at: z.string().nullable(),
});

export const engagementTreasureResponseSchema = z.object({
  catalog: z.array(engagementChestCatalogSchema),
  chests: z.array(engagementChestSchema),
});

export const engagementChestRewardSchema = z.object({
  reward_xp: z.number().int().nonnegative(),
  reward_promo_coins: z.number().int().nonnegative(),
  reward_energy: z.number().int().nonnegative(),
  reward_label: z.string(),
  title: z.string(),
  rarity: z.string(),
});

export const engagementChestOpenResponseSchema = z.object({
  ok: z.literal(true),
  alreadyOpened: z.boolean().optional(),
  reward: engagementChestRewardSchema,
});

export const engagementStickerItemSchema = z.object({
  id: z.string().min(1),
  set_id: z.string().min(1),
  name: z.string().min(1),
  emoji: z.string().min(1),
  rarity: z.string().min(1),
  owned: z.number().int().nonnegative(),
  unlocked: z.boolean(),
});

export const engagementStickerSetSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  theme: z.string(),
  complete_reward_label: z.string(),
  progress: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  complete: z.boolean(),
  stickers: z.array(engagementStickerItemSchema),
});

export const engagementStickersResponseSchema = z.object({
  sets: z.array(engagementStickerSetSchema),
});

export const engagementCreatorCardTierSchema = z.object({
  tier: z.string().min(1),
  title: z.string().min(1),
  stars: z.number().int().nonnegative(),
  watch_minutes_required: z.number().int().nonnegative(),
  gifts_required: z.number().int().nonnegative(),
});

export const engagementCreatorCardSchema = z.object({
  creator_id: z.string().min(1),
  tier: z.string().min(1),
  unlocked_at: z.string().min(1),
});

export const engagementCreatorCardProgressSchema = z.object({
  creator_id: z.string().min(1),
  watch_minutes: z.number().int().nonnegative(),
  gifts_count: z.number().int().nonnegative(),
});

export const engagementCreatorCardsResponseSchema = z.object({
  tiers: z.array(engagementCreatorCardTierSchema),
  unlocked: z.array(engagementCreatorCardSchema),
  progress: z.array(engagementCreatorCardProgressSchema),
});

export type EngagementChestCatalog = z.infer<typeof engagementChestCatalogSchema>;
export type EngagementChest = z.infer<typeof engagementChestSchema>;
export type EngagementTreasureResponse = z.infer<typeof engagementTreasureResponseSchema>;
export type EngagementChestReward = z.infer<typeof engagementChestRewardSchema>;
export type EngagementChestOpenResponse = z.infer<typeof engagementChestOpenResponseSchema>;
export type EngagementStickerItem = z.infer<typeof engagementStickerItemSchema>;
export type EngagementStickerSet = z.infer<typeof engagementStickerSetSchema>;
export type EngagementStickersResponse = z.infer<typeof engagementStickersResponseSchema>;
export type EngagementCreatorCardTier = z.infer<typeof engagementCreatorCardTierSchema>;
export type EngagementCreatorCard = z.infer<typeof engagementCreatorCardSchema>;
export type EngagementCreatorCardProgress = z.infer<typeof engagementCreatorCardProgressSchema>;
export type EngagementCreatorCardsResponse = z.infer<typeof engagementCreatorCardsResponseSchema>;
