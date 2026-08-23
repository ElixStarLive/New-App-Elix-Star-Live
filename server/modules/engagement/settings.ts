import type { Pool, PoolClient } from "pg";
import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { isEngagementHubEnabled } from "./flags.js";

export const ENGAGEMENT_FLAG_KEYS = [
  "engagementHubEnabled",
  "promotionalCoinsEnabled",
  "battleEnergyEnabled",
  "dailyLoginEnabled",
  "missionRewardsEnabled",
  "promoGiftSpendEnabled",
  "treasureHuntEnabled",
  "stickerCollectionEnabled",
  "creatorCollectionsEnabled",
  "engagementNeonApproved",
  "liveQuestsEnabled",
  "petEvolutionEnabled",
  "worldEventsEnabled",
  "guildsEnabled",
  "appleSignInEnabled",
] as const;

export type EngagementFlagKey = (typeof ENGAGEMENT_FLAG_KEYS)[number];

export type EngagementFlags = Record<EngagementFlagKey, boolean>;

export type EngagementFlagRow = {
  key: EngagementFlagKey;
  effective: boolean;
  default_value: boolean;
  env_value: boolean;
  admin_value: boolean | null;
  last_changed_by: string | null;
  last_changed_at: string | null;
  reason: string | null;
};

export type DailyRewardPolicy = {
  streak_reset_policy: "miss_one_day" | "never";
  effective_start: string | null;
  effective_end: string | null;
  active: boolean;
};

export type BattleEnergyCaps = {
  watch_amount: number;
  comment_amount: number;
  share_amount: number;
  watch_cap: number;
  comment_cap: number;
  share_cap: number;
  storage_cap: number;
  session_cap: number;
  daily_cap: number;
  minimum_boost: number;
  allowed_boost_values: number[];
  fan_energy_threshold: number;
  score_multiplier: number;
  boost_duration_sec: number;
  enabled: boolean;
};

export const HIGH_IMPACT_FLAG_KEYS = [
  "engagementNeonApproved",
  "promotionalCoinsEnabled",
  "promoGiftSpendEnabled",
  "battleEnergyEnabled",
] as const;

export const DEFAULT_BATTLE_ENERGY_CAPS: BattleEnergyCaps = {
  watch_amount: 5,
  comment_amount: 2,
  share_amount: 20,
  watch_cap: 300,
  comment_cap: 20,
  share_cap: 1,
  storage_cap: 10_000,
  session_cap: 500,
  daily_cap: 2_000,
  minimum_boost: 1,
  allowed_boost_values: [1, 2, 5, 10],
  fan_energy_threshold: 10_000,
  score_multiplier: 1.2,
  boost_duration_sec: 5,
  enabled: true,
};

export const DEFAULT_DAILY_REWARD_POLICY: DailyRewardPolicy = {
  streak_reset_policy: "miss_one_day",
  effective_start: null,
  effective_end: null,
  active: true,
};

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return fallback;
}

export function postgresUnavailableCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : undefined;
}

export function isSchemaUnavailable(error: unknown): boolean {
  const code = postgresUnavailableCode(error);
  return code === "42P01" || code === "42703";
}

export function mapEngagementDbError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (isSchemaUnavailable(error)) {
    throw new AppError("SCHEMA_UNAVAILABLE", "SCHEMA_UNAVAILABLE", 503);
  }
  throw new AppError("DATABASE_UNAVAILABLE", "DATABASE_UNAVAILABLE", 503);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function getEngagementFlagsFromEnv(): EngagementFlags {
  const engagementNeonApproved = envBool("ENGAGEMENT_NEON_APPROVED", true);
  return {
    engagementHubEnabled: isEngagementHubEnabled(),
    promotionalCoinsEnabled: engagementNeonApproved && envBool("PROMOTIONAL_COINS_ENABLED", true),
    battleEnergyEnabled: engagementNeonApproved && envBool("BATTLE_ENERGY_ENABLED", true),
    dailyLoginEnabled: envBool("DAILY_LOGIN_ENABLED", true),
    missionRewardsEnabled: envBool("MISSION_REWARDS_ENABLED", true),
    promoGiftSpendEnabled: engagementNeonApproved && envBool("PROMO_GIFT_SPEND_ENABLED", true),
    treasureHuntEnabled: envBool("TREASURE_HUNT_ENABLED", true),
    stickerCollectionEnabled: envBool("STICKER_COLLECTION_ENABLED", true),
    creatorCollectionsEnabled: envBool("CREATOR_COLLECTIONS_ENABLED", true),
    engagementNeonApproved,
    liveQuestsEnabled: envBool("LIVE_QUESTS_ENABLED", false),
    petEvolutionEnabled: envBool("PET_EVOLUTION_ENABLED", false),
    worldEventsEnabled: envBool("WORLD_EVENTS_ENABLED", false),
    guildsEnabled: envBool("GUILDS_ENABLED", false),
    appleSignInEnabled: envBool("APPLE_SIGN_IN_ENABLED", false),
  };
}

async function readSetting(db: Queryable, key: string): Promise<unknown> {
  try {
    const { rows } = await db.query<{ value_json: unknown }>(
      `SELECT value_json FROM engagement_settings WHERE key = $1`,
      [key],
    );
    return rows[0]?.value_json ?? null;
  } catch (error) {
    if (isSchemaUnavailable(error)) {
      throw new AppError("SCHEMA_UNAVAILABLE", "SCHEMA_UNAVAILABLE", 503);
    }
    throw error;
  }
}

export function parseFlagOverrides(raw: unknown): Partial<EngagementFlags> {
  const obj = asRecord(raw);
  const out: Partial<EngagementFlags> = {};
  for (const key of ENGAGEMENT_FLAG_KEYS) {
    if (typeof obj[key] === "boolean") out[key] = obj[key];
  }
  return out;
}

export function mergeEngagementFlags(
  envFlags: EngagementFlags,
  overrides: Partial<EngagementFlags>,
): EngagementFlags {
  const merged: EngagementFlags = { ...envFlags, ...overrides };
  merged.engagementHubEnabled = envFlags.engagementHubEnabled && overrides.engagementHubEnabled !== false;
  if (!envFlags.engagementNeonApproved) {
    merged.engagementNeonApproved = false;
    merged.promotionalCoinsEnabled = false;
    merged.battleEnergyEnabled = false;
    merged.promoGiftSpendEnabled = false;
  }
  return merged;
}

export async function resolveEngagementFlags(db: Queryable = getPool()): Promise<EngagementFlags> {
  const envFlags = getEngagementFlagsFromEnv();
  const overrides = parseFlagOverrides(await readSetting(db, "feature_flags"));
  return mergeEngagementFlags(envFlags, overrides);
}

export async function listEngagementFlagDetail(db: Queryable = getPool()): Promise<{
  flags: EngagementFlags;
  rows: EngagementFlagRow[];
}> {
  const envFlags = getEngagementFlagsFromEnv();
  const overrides = parseFlagOverrides(await readSetting(db, "feature_flags"));
  const flags = mergeEngagementFlags(envFlags, overrides);
  const meta = asRecord(await readSetting(db, "feature_flags_meta"));
  const rows: EngagementFlagRow[] = ENGAGEMENT_FLAG_KEYS.map((key) => {
    const entry = asRecord(meta[key]);
    return {
      key,
      effective: flags[key],
      default_value: envFlags[key],
      env_value: envFlags[key],
      admin_value: typeof overrides[key] === "boolean" ? overrides[key] : null,
      last_changed_by: typeof entry.last_changed_by === "string" ? entry.last_changed_by : null,
      last_changed_at: typeof entry.last_changed_at === "string" ? entry.last_changed_at : null,
      reason: typeof entry.reason === "string" ? entry.reason : null,
    };
  });
  return { flags, rows };
}

export function parseDailyRewardPolicy(raw: unknown): DailyRewardPolicy {
  const obj = asRecord(raw);
  return {
    streak_reset_policy: obj.streak_reset_policy === "never" ? "never" : "miss_one_day",
    effective_start: typeof obj.effective_start === "string" && obj.effective_start.trim() ? obj.effective_start : null,
    effective_end: typeof obj.effective_end === "string" && obj.effective_end.trim() ? obj.effective_end : null,
    active: obj.active !== false,
  };
}

export async function resolveDailyRewardPolicy(db: Queryable = getPool()): Promise<DailyRewardPolicy> {
  const raw = await readSetting(db, "daily_reward_policy");
  if (raw == null) return DEFAULT_DAILY_REWARD_POLICY;
  return parseDailyRewardPolicy(raw);
}

function asInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function parseBattleEnergyCaps(raw: unknown, boostRaw: unknown = {}): BattleEnergyCaps {
  const v = asRecord(raw);
  const boost = asRecord(boostRaw);
  const allowedRaw = Array.isArray(v.allowed_boost_values)
    ? v.allowed_boost_values
        .map((n) => Math.trunc(Number(n)))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 100)
        .slice(0, 20)
    : DEFAULT_BATTLE_ENERGY_CAPS.allowed_boost_values;
  const multiplierRaw = Number(v.score_multiplier ?? boost.multiplier ?? DEFAULT_BATTLE_ENERGY_CAPS.score_multiplier);
  const multiplier = Number.isFinite(multiplierRaw)
    ? Math.min(5, Math.max(1, multiplierRaw))
    : DEFAULT_BATTLE_ENERGY_CAPS.score_multiplier;
  return {
    watch_amount: asInt(v.watch_amount ?? v.watch_per_minute, DEFAULT_BATTLE_ENERGY_CAPS.watch_amount, 0, 10_000),
    comment_amount: asInt(v.comment_amount ?? v.comment, DEFAULT_BATTLE_ENERGY_CAPS.comment_amount, 0, 10_000),
    share_amount: asInt(v.share_amount ?? v.share, DEFAULT_BATTLE_ENERGY_CAPS.share_amount, 0, 10_000),
    watch_cap: asInt(v.watch_cap ?? v.watch_per_battle, DEFAULT_BATTLE_ENERGY_CAPS.watch_cap, 0, 1_000_000),
    comment_cap: asInt(v.comment_cap ?? v.comment_per_battle, DEFAULT_BATTLE_ENERGY_CAPS.comment_cap, 0, 1_000_000),
    share_cap: asInt(v.share_cap ?? v.share_per_day, DEFAULT_BATTLE_ENERGY_CAPS.share_cap, 0, 1_000_000),
    storage_cap: asInt(v.storage_cap, DEFAULT_BATTLE_ENERGY_CAPS.storage_cap, 0, 10_000_000),
    session_cap: asInt(v.session_cap, DEFAULT_BATTLE_ENERGY_CAPS.session_cap, 0, 1_000_000),
    daily_cap: asInt(v.daily_cap, DEFAULT_BATTLE_ENERGY_CAPS.daily_cap, 0, 10_000_000),
    minimum_boost: asInt(v.minimum_boost, DEFAULT_BATTLE_ENERGY_CAPS.minimum_boost, 1, 100),
    allowed_boost_values: allowedRaw.length > 0 ? allowedRaw : [...DEFAULT_BATTLE_ENERGY_CAPS.allowed_boost_values],
    fan_energy_threshold: asInt(
      v.fan_energy_threshold ?? boost.threshold,
      DEFAULT_BATTLE_ENERGY_CAPS.fan_energy_threshold,
      1,
      100_000_000,
    ),
    score_multiplier: multiplier,
    boost_duration_sec: asInt(
      v.boost_duration_sec ?? boost.duration_sec,
      DEFAULT_BATTLE_ENERGY_CAPS.boost_duration_sec,
      1,
      120,
    ),
    enabled: v.enabled === undefined ? true : v.enabled === true,
  };
}

export async function resolveBattleEnergyCaps(db: Queryable = getPool()): Promise<BattleEnergyCaps> {
  const caps = await readSetting(db, "battle_energy_caps");
  const boost = await readSetting(db, "fan_energy_boost");
  if (caps == null) {
    throw new AppError("SCHEMA_UNAVAILABLE", "SCHEMA_UNAVAILABLE", 503);
  }
  return parseBattleEnergyCaps(caps, boost);
}

export function dailyPolicyAllowsClaim(policy: DailyRewardPolicy, now = new Date()): boolean {
  if (!policy.active) return false;
  if (policy.effective_start) {
    const start = new Date(policy.effective_start);
    if (Number.isNaN(start.getTime()) || now < start) return false;
  }
  if (policy.effective_end) {
    const end = new Date(policy.effective_end);
    if (Number.isNaN(end.getTime()) || now > end) return false;
  }
  return true;
}
