import type { PoolClient } from "pg";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { applyWalletDelta, parseCoinCount } from "../wallet/ledger.js";
import { grantEngagementXp } from "./progression.js";
import { mapEngagementDbError } from "./settings.js";
import type { EngagementAchievement } from "../../../shared/contracts/engagement.js";

type AchievementRow = {
  id: string;
  name: string;
  description: string;
  icon: string;
  goal_count: unknown;
  reward_xp: unknown;
  reward_promo_coins: unknown;
  rarity: string;
  progress: unknown;
  unlocked: boolean;
  unlocked_at: Date | string | null;
  claimed: boolean;
};

function requiredCount(value: unknown, label: string): number {
  const n = parseCoinCount(value);
  if (n == null) throw new AppError("unavailable", `${label} is unreadable`, 503);
  return n;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError("unavailable", `${label} is unreadable`, 503);
  }
  return value;
}

function unlockedAtIso(value: Date | string | null): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError("unavailable", "Achievement unlock time is unreadable", 503);
  }
  return date.toISOString();
}

export function toAchievementDto(row: AchievementRow): EngagementAchievement {
  const goal = requiredCount(row.goal_count, "Achievement goal");
  if (goal <= 0) throw new AppError("unavailable", "Achievement goal is invalid", 503);
  const progress = requiredCount(row.progress, "Achievement progress");
  if (progress < 0) throw new AppError("unavailable", "Achievement progress is unreadable", 503);
  return {
    id: requiredText(row.id, "achievementId"),
    name: requiredText(row.name, "Achievement name"),
    description: typeof row.description === "string" ? row.description : "",
    icon: requiredText(row.icon, "Achievement icon"),
    goal_count: goal,
    reward_xp: requiredCount(row.reward_xp, "Achievement XP"),
    reward_promo_coins: requiredCount(row.reward_promo_coins, "Achievement promo"),
    rarity: requiredText(row.rarity, "Achievement rarity"),
    progress,
    unlocked: row.unlocked === true,
    unlocked_at: unlockedAtIso(row.unlocked_at),
    claimed: row.claimed === true,
  };
}

async function grantAchievementRewards(
  client: PoolClient,
  userId: string,
  achievementId: string,
  rewards: { promo: number; xp: number },
): Promise<void> {
  if (rewards.promo > 0) {
    await applyWalletDelta(client, {
      userId,
      bucket: "promo",
      delta: rewards.promo,
      reason: "achievement_unlock",
      idempotencyKey: `achievement:${userId}:${achievementId}`,
      refType: "achievement",
      refId: achievementId,
    });
  }
  await grantEngagementXp(client, userId, { xp: rewards.xp, energy: 0 });
}

export async function listAchievementsForUser(userId: string): Promise<EngagementAchievement[]> {
  try {
    const { rows } = await getPool().query<AchievementRow>(
      `SELECT a.id, a.name, a.description, a.icon, a.goal_count::text AS goal_count,
              a.reward_xp::text AS reward_xp, a.reward_promo_coins::text AS reward_promo_coins,
              a.rarity, COALESCE(u.progress, 0)::text AS progress,
              COALESCE(u.unlocked, FALSE) AS unlocked, u.unlocked_at,
              COALESCE(u.claimed, FALSE) AS claimed
       FROM engagement_achievements a
       LEFT JOIN user_achievements u
         ON u.achievement_id = a.id AND u.user_id = $1
       WHERE a.enabled = TRUE
       ORDER BY a.rarity, a.id`,
      [userId],
    );
    return rows.map(toAchievementDto);
  } catch (error) {
    mapEngagementDbError(error);
  }
}

export async function bumpAchievementOnClient(
  client: PoolClient,
  userId: string,
  metricKey: string,
  delta: number,
): Promise<void> {
  const amount = Math.floor(delta);
  if (!userId || !metricKey || !Number.isFinite(amount) || amount <= 0) return;
  const defs = await client.query<{
    id: string;
    goal_count: unknown;
    reward_xp: unknown;
    reward_promo_coins: unknown;
  }>(
    `SELECT id, goal_count::text AS goal_count, reward_xp::text AS reward_xp,
            reward_promo_coins::text AS reward_promo_coins
     FROM engagement_achievements
     WHERE enabled = TRUE AND metric_key = $1`,
    [metricKey],
  );
  for (const def of defs.rows) {
    const goal = requiredCount(def.goal_count, "Achievement goal");
    if (goal <= 0) throw new AppError("unavailable", "Achievement goal is invalid", 503);
    const promo = requiredCount(def.reward_promo_coins, "Achievement promo");
    const xp = requiredCount(def.reward_xp, "Achievement XP");
    await client.query(
      `INSERT INTO user_achievements (
         user_id, achievement_id, progress, unlocked, unlocked_at, claimed
       ) VALUES (
         $1, $2, LEAST($3::int, $4::int), $3::int >= $4::int,
         CASE WHEN $3::int >= $4::int THEN NOW() ELSE NULL END, FALSE
       )
       ON CONFLICT (user_id, achievement_id) DO UPDATE SET
         progress = LEAST($4::int, user_achievements.progress + $3::int),
         unlocked = user_achievements.unlocked OR (user_achievements.progress + $3::int) >= $4::int,
         unlocked_at = COALESCE(
           user_achievements.unlocked_at,
           CASE WHEN (user_achievements.progress + $3::int) >= $4::int THEN NOW() ELSE NULL END
         )`,
      [userId, def.id, amount, goal],
    );
    const locked = await client.query<{ unlocked: boolean; claimed: boolean }>(
      `SELECT unlocked, claimed
       FROM user_achievements
       WHERE user_id = $1 AND achievement_id = $2
       FOR UPDATE`,
      [userId, def.id],
    );
    const row = locked.rows[0];
    if (!row?.unlocked || row.claimed) continue;
    const marked = await client.query<{ achievement_id: string }>(
      `UPDATE user_achievements
       SET claimed = TRUE
       WHERE user_id = $1 AND achievement_id = $2 AND claimed = FALSE
       RETURNING achievement_id`,
      [userId, def.id],
    );
    if (!marked.rows[0]) continue;
    await grantAchievementRewards(client, userId, def.id, { promo, xp });
  }
}

export async function bumpAchievement(userId: string, metricKey: string, delta: number): Promise<void> {
  await withTransaction((client) => bumpAchievementOnClient(client, userId, metricKey, delta));
}
