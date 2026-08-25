import type { Pool, PoolClient } from "pg";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { applyWalletDelta, parseCoinCount } from "../wallet/ledger.js";
import { bumpAchievementOnClient } from "./achievements.js";
import { spawnTreasureChest, isTreasureSpawnSkippable } from "./collections.js";
import { utcDateKey } from "./period.js";
import { grantEngagementXp } from "./progression.js";
import {
  dailyPolicyAllowsClaim,
  mapEngagementDbError,
  resolveDailyRewardPolicy,
  resolveEngagementFlags,
  type DailyRewardPolicy,
} from "./settings.js";
import type {
  EngagementDailyLogin,
  EngagementDailyLoginClaimResponse,
  EngagementDailyLoginState,
  EngagementDailyReward,
} from "../../../shared/contracts/engagement.js";

export const CANONICAL_DAILY_LOGIN_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

type ConfigRow = {
  streak_day: unknown;
  reward_xp: unknown;
  reward_promo_coins: unknown;
  reward_label: unknown;
};

function requiredCount(value: unknown, label: string): number {
  const n = parseCoinCount(value);
  if (n == null) throw new AppError("unavailable", `${label} is unreadable`, 503);
  return n;
}

export function nextStreakDay(previousStreakDay: number): number {
  return previousStreakDay >= 1 && previousStreakDay < 7 ? previousStreakDay + 1 : 1;
}

export function yesterdayUtcDateKey(today = utcDateKey()): string {
  const cursor = new Date(`${today}T00:00:00.000Z`);
  cursor.setUTCDate(cursor.getUTCDate() - 1);
  return utcDateKey(cursor);
}

export function validateDailyRewardConfig(rows: EngagementDailyReward[]): EngagementDailyReward[] {
  const byDay = new Map<number, EngagementDailyReward>();
  for (const row of rows) {
    if (!Number.isInteger(row.streak_day) || row.streak_day < 1 || row.streak_day > 7) {
      throw new AppError("unavailable", "Daily login config is invalid", 503);
    }
    if (byDay.has(row.streak_day)) {
      throw new AppError("unavailable", "Daily login config is invalid", 503);
    }
    if (!Number.isInteger(row.reward_xp) || row.reward_xp < 0) {
      throw new AppError("unavailable", "Daily login config is invalid", 503);
    }
    if (!Number.isInteger(row.reward_promo_coins) || row.reward_promo_coins < 0) {
      throw new AppError("unavailable", "Daily login config is invalid", 503);
    }
    if (typeof row.reward_label !== "string" || !row.reward_label.trim()) {
      throw new AppError("unavailable", "Daily login config is invalid", 503);
    }
    byDay.set(row.streak_day, {
      streak_day: row.streak_day,
      reward_xp: row.reward_xp,
      reward_promo_coins: row.reward_promo_coins,
      reward_label: row.reward_label,
    });
  }
  return CANONICAL_DAILY_LOGIN_DAYS.map((day) => {
    const reward = byDay.get(day);
    if (!reward) throw new AppError("unavailable", "Daily login config is invalid", 503);
    return reward;
  });
}

function toReward(row: ConfigRow): EngagementDailyReward {
  const label = typeof row.reward_label === "string" ? row.reward_label : "";
  return {
    streak_day: requiredCount(row.streak_day, "Daily streak day"),
    reward_xp: requiredCount(row.reward_xp, "Daily login XP"),
    reward_promo_coins: requiredCount(row.reward_promo_coins, "Daily login promo"),
    reward_label: label,
  };
}

async function loadValidatedConfig(db: Queryable): Promise<EngagementDailyReward[]> {
  try {
    const { rows } = await db.query<ConfigRow>(
      `SELECT streak_day::text AS streak_day, reward_xp::text AS reward_xp,
              reward_promo_coins::text AS reward_promo_coins, reward_label
       FROM daily_reward_config`,
    );
    return validateDailyRewardConfig(rows.map(toReward));
  } catch (error) {
    mapEngagementDbError(error);
  }
}

async function lastClaimedStreakDay(db: Queryable, userId: string): Promise<number> {
  const previous = await db.query<{ streak_day: unknown }>(
    `SELECT streak_day::text AS streak_day
     FROM daily_login_claims
     WHERE user_id = $1
     ORDER BY claim_date DESC
     LIMIT 1`,
    [userId],
  );
  return previous.rows[0] ? requiredCount(previous.rows[0].streak_day, "daily streak") : 0;
}

async function readClaimState(
  db: Queryable,
  userId: string,
  today: string,
  days: EngagementDailyReward[],
  policy: DailyRewardPolicy,
  claimEnabled: boolean,
): Promise<EngagementDailyLoginState> {
  const claimed = await db.query<{ streak_day: unknown }>(
    `SELECT streak_day::text AS streak_day
     FROM daily_login_claims
     WHERE user_id = $1 AND claim_date = $2::date`,
    [userId, today],
  );
  if (claimed.rows[0]) {
    const streakDay = requiredCount(claimed.rows[0].streak_day, "daily streak");
    if (streakDay < 1 || streakDay > 7) {
      throw new AppError("unavailable", "Daily login streak is unreadable", 503);
    }
    return {
      can_claim: false,
      streak_day: streakDay,
      claimed_today: true,
      next_reward: null,
      days,
    };
  }
  let prev = 0;
  if (policy.streak_reset_policy === "never") {
    prev = await lastClaimedStreakDay(db, userId);
  } else {
    const previous = await db.query<{ streak_day: unknown }>(
      `SELECT streak_day::text AS streak_day
       FROM daily_login_claims
       WHERE user_id = $1 AND claim_date = $2::date`,
      [userId, yesterdayUtcDateKey(today)],
    );
    prev = previous.rows[0] ? requiredCount(previous.rows[0].streak_day, "daily streak") : 0;
  }
  const streakDay = nextStreakDay(prev);
  const canClaim = claimEnabled && dailyPolicyAllowsClaim(policy);
  return {
    can_claim: canClaim,
    streak_day: streakDay,
    claimed_today: false,
    next_reward: canClaim ? days[streakDay - 1] ?? null : null,
    days,
  };
}

export async function getDailyLoginForUser(userId: string): Promise<EngagementDailyLoginState> {
  const today = utcDateKey();
  const days = await loadValidatedConfig(getPool());
  const [policy, flags] = await Promise.all([resolveDailyRewardPolicy(), resolveEngagementFlags()]);
  return readClaimState(getPool(), userId, today, days, policy, flags.dailyLoginEnabled);
}

export async function getDailyLoginSummary(userId: string): Promise<EngagementDailyLogin> {
  const daily = await getDailyLoginForUser(userId);
  return {
    can_claim: daily.can_claim,
    streak_day: daily.streak_day,
    claimed_today: daily.claimed_today,
  };
}

export async function claimDailyLoginForUser(userId: string): Promise<EngagementDailyLoginClaimResponse> {
  const result = await withTransaction(async (client) => {
    const today = utcDateKey();
    const days = await loadValidatedConfig(client);
    const [policy, flags] = await Promise.all([
      resolveDailyRewardPolicy(client),
      resolveEngagementFlags(client),
    ]);
    if (!flags.dailyLoginEnabled || !dailyPolicyAllowsClaim(policy)) {
      throw new AppError("validation_error", "Daily login is not available", 400);
    }
    const existing = await client.query<{ streak_day: unknown }>(
      `SELECT streak_day::text AS streak_day
       FROM daily_login_claims
       WHERE user_id = $1 AND claim_date = $2::date
       FOR UPDATE`,
      [userId, today],
    );
    if (existing.rows[0]) {
      return {
        ok: true as const,
        alreadyClaimed: true,
        daily: await readClaimState(client, userId, today, days, policy, flags.dailyLoginEnabled),
        reward: null,
      };
    }
    const pending = await readClaimState(client, userId, today, days, policy, flags.dailyLoginEnabled);
    const reward = pending.next_reward;
    if (!pending.can_claim || !reward) {
      return {
        ok: true as const,
        alreadyClaimed: true,
        daily: pending,
        reward: null,
      };
    }
    const inserted = await client.query<{ user_id: string }>(
      `INSERT INTO daily_login_claims
         (user_id, claim_date, streak_day, reward_xp, reward_promo_coins, reward_label)
       VALUES ($1, $2::date, $3, $4, $5, $6)
       ON CONFLICT (user_id, claim_date) DO NOTHING
       RETURNING user_id`,
      [userId, today, reward.streak_day, reward.reward_xp, reward.reward_promo_coins, reward.reward_label],
    );
    if (!inserted.rows[0]) {
      return {
        ok: true as const,
        alreadyClaimed: true,
        daily: await readClaimState(client, userId, today, days, policy, flags.dailyLoginEnabled),
        reward: null,
      };
    }
    if (reward.reward_promo_coins > 0 && flags.promotionalCoinsEnabled) {
      await applyWalletDelta(client, {
        userId,
        bucket: "promo",
        delta: reward.reward_promo_coins,
        reason: "daily_login",
        idempotencyKey: `daily_login:${userId}:${today}`,
        refType: "daily_login",
        refId: today,
      });
    }
    if (reward.reward_xp > 0) {
      await grantEngagementXp(client, userId, { xp: reward.reward_xp, energy: 0 });
    }
    await bumpAchievementOnClient(client, userId, "login_streak_days", 1);
    if (reward.streak_day === 5 || reward.streak_day === 7) {
      const spawned = await spawnTreasureChest(
        userId,
        reward.streak_day === 7 ? "chest_legendary_streak" : "chest_rare_missions",
        "daily_login",
        client,
      );
      if (!spawned.ok && !isTreasureSpawnSkippable(spawned.error)) {
        throw new AppError(
          spawned.error === "UNKNOWN_CHEST" ? "SCHEMA_UNAVAILABLE" : "unavailable",
          spawned.error === "UNKNOWN_CHEST" ? "SCHEMA_UNAVAILABLE" : spawned.error,
          503,
        );
      }
    }
    return {
      ok: true as const,
      daily: await readClaimState(client, userId, today, days, policy, flags.dailyLoginEnabled),
      reward,
    };
  });
  return result;
}
