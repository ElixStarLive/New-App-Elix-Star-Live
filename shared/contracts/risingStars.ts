import { z } from "zod";

export const risingStarsSeasonStatusSchema = z.enum(["draft", "active", "closed"]);

export const risingStarsChallengeStatusSchema = z.enum([
  "scheduled",
  "open",
  "voting",
  "qualified",
  "final",
  "closed",
]);

export const risingStarsRewardKindSchema = z.enum([
  "badge",
  "cosmetic",
  "featured",
  "cash_off_platform",
  "creator_credit_manual",
  "none",
]);

export const risingStarsSeasonSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string(),
  description: z.string().nullable(),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  status: risingStarsSeasonStatusSchema,
  created_by: z.string().nullable(),
  created_at: z.string().min(1),
});

export const risingStarsCurrentSeasonResponseSchema = z.object({
  season: risingStarsSeasonSchema.nullable(),
});

export const risingStarsSeasonResponseSchema = z.object({
  season: risingStarsSeasonSchema,
});

export const risingStarsCategorySchema = z.object({
  id: z.string().min(1),
  season_id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string(),
  sort_order: z.number().int(),
  is_active: z.boolean(),
});

export const risingStarsCategoriesResponseSchema = z.object({
  categories: z.array(risingStarsCategorySchema),
});

export const risingStarsRegionSchema = z.object({
  id: z.string().min(1),
  season_id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string(),
  country_codes: z.array(z.string()),
  sort_order: z.number().int(),
  is_active: z.boolean(),
});

export const risingStarsRegionsResponseSchema = z.object({
  regions: z.array(risingStarsRegionSchema),
});

export const risingStarsChallengeSchema = z.object({
  id: z.string().min(1),
  season_id: z.string().min(1),
  category_id: z.string().min(1),
  region_id: z.string().nullable(),
  week_index: z.number().int(),
  title: z.string(),
  description: z.string().nullable(),
  sound_track_id: z.string(),
  opens_at: z.string().min(1),
  closes_at: z.string().min(1),
  status: risingStarsChallengeStatusSchema,
  leaderboard_frozen: z.boolean(),
});

export const risingStarsChallengesResponseSchema = z.object({
  challenges: z.array(risingStarsChallengeSchema),
});

export const risingStarsStandingSchema = z.object({
  rank: z.number().int().positive(),
  creator_user_id: z.string().min(1),
  username: z.string(),
  avatar_url: z.string().nullable(),
  total_votes: z.number().int().nonnegative(),
  entries: z.number().int().nonnegative(),
});

export const risingStarsStandingsResponseSchema = z.object({
  standings: z.array(risingStarsStandingSchema),
});

export const risingStarsTeamSchema = z.object({
  id: z.string().min(1),
  season_id: z.string().min(1),
  region_id: z.string().nullable(),
  name: z.string(),
  slug: z.string().min(1),
  captain_user_id: z.string().nullable(),
  team_votes: z.number().int().nonnegative(),
  member_count: z.number().int().nonnegative(),
});

export const risingStarsTeamsResponseSchema = z.object({
  teams: z.array(risingStarsTeamSchema),
});

export const risingStarsRewardSchema = z.object({
  id: z.string().min(1),
  season_id: z.string().min(1),
  place_from: z.number().int().positive(),
  place_to: z.number().int().positive(),
  category_id: z.string().nullable(),
  region_id: z.string().nullable(),
  reward_kind: risingStarsRewardKindSchema,
  payload: z.record(z.string(), z.unknown()),
  is_active: z.boolean(),
});

export const risingStarsRewardsResponseSchema = z.object({
  rewards: z.array(risingStarsRewardSchema),
});

export const risingStarsBadgeSchema = z.object({
  badge_id: z.string().min(1),
  season_id: z.string().min(1),
  code: z.string().min(1),
  title: z.string(),
  image_url: z.string().nullable(),
  kind: z.string().min(1),
  challenge_id: z.string().nullable(),
  awarded_at: z.string().min(1),
});

export const risingStarsBadgesResponseSchema = z.object({
  badges: z.array(risingStarsBadgeSchema),
});

export const risingStarsChallengeDetailSchema = risingStarsChallengeSchema.extend({
  sound_meta: z.record(z.string(), z.unknown()),
  live_qualifier_room_id: z.string().nullable(),
  live_final_room_id: z.string().nullable(),
});

export const risingStarsEntryStatusSchema = z.enum([
  "pending",
  "active",
  "disqualified",
  "advanced",
  "eliminated",
  "withdrawn",
]);

export const risingStarsEntrySchema = z.object({
  id: z.string().min(1),
  challenge_id: z.string().min(1),
  creator_user_id: z.string().min(1),
  video_id: z.string().nullable(),
  team_id: z.string().nullable(),
  status: risingStarsEntryStatusSchema,
  vote_count: z.number().int().nonnegative(),
  created_at: z.string().min(1),
  username: z.string(),
  avatar_url: z.string().nullable(),
});

export const risingStarsChallengeDetailResponseSchema = z.object({
  challenge: risingStarsChallengeDetailSchema,
  voted_today: z.boolean(),
  my_entry: risingStarsEntrySchema.nullable(),
  my_team_ids: z.array(z.string().min(1)),
});

export const risingStarsEntriesResponseSchema = z.object({
  entries: z.array(risingStarsEntrySchema),
});

export const risingStarsLeaderboardRowSchema = z.object({
  rank: z.number().int().positive(),
  entry_id: z.string().min(1),
  creator_user_id: z.string().min(1),
  video_id: z.string().nullable(),
  team_id: z.string().nullable(),
  vote_count: z.number().int().nonnegative(),
  status: risingStarsEntryStatusSchema,
  username: z.string(),
  avatar_url: z.string().nullable(),
});

export const risingStarsLeaderboardResponseSchema = z.object({
  leaderboard: z.array(risingStarsLeaderboardRowSchema),
});

export const risingStarsChallengeLiveSchema = z.object({
  qualifier_room_id: z.string().nullable(),
  final_room_id: z.string().nullable(),
  status: risingStarsChallengeStatusSchema,
});

export const risingStarsChallengeLiveResponseSchema = z.object({
  live: risingStarsChallengeLiveSchema,
});

export const risingStarsEnterResponseSchema = z.object({
  entry: risingStarsEntrySchema,
});

export const risingStarsVoteResponseSchema = z.object({
  ok: z.literal(true),
  entry_id: z.string().min(1),
  challenge_id: z.string().min(1),
  vote_count: z.number().int().nonnegative(),
});

export const risingStarsWithdrawResponseSchema = z.object({
  ok: z.literal(true),
});

export const risingStarsCreateTeamBodySchema = z.object({
  seasonId: z.string().uuid(),
  regionId: z.string().uuid().nullable().optional(),
  name: z.string().min(2).max(60),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
});

export const risingStarsCreateTeamResponseSchema = z.object({
  team: risingStarsTeamSchema,
});

export const risingStarsJoinTeamResponseSchema = z.object({
  ok: z.literal(true),
});

export const risingStarsAttachLiveBodySchema = z.object({
  phase: z.enum(["qualifier", "final"]),
  roomId: z.string().min(1).max(200),
});

export const risingStarsAttachLiveResponseSchema = z.object({
  challenge: risingStarsChallengeDetailSchema,
});

export type RisingStarsSeason = z.infer<typeof risingStarsSeasonSchema>;
export type RisingStarsCategory = z.infer<typeof risingStarsCategorySchema>;
export type RisingStarsRegion = z.infer<typeof risingStarsRegionSchema>;
export type RisingStarsChallenge = z.infer<typeof risingStarsChallengeSchema>;
export type RisingStarsChallengeDetail = z.infer<typeof risingStarsChallengeDetailSchema>;
export type RisingStarsStanding = z.infer<typeof risingStarsStandingSchema>;
export type RisingStarsTeam = z.infer<typeof risingStarsTeamSchema>;
export type RisingStarsReward = z.infer<typeof risingStarsRewardSchema>;
export type RisingStarsBadge = z.infer<typeof risingStarsBadgeSchema>;
export type RisingStarsEntry = z.infer<typeof risingStarsEntrySchema>;
export type RisingStarsLeaderboardRow = z.infer<typeof risingStarsLeaderboardRowSchema>;
export type RisingStarsChallengeLive = z.infer<typeof risingStarsChallengeLiveSchema>;
