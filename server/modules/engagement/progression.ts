import type { PoolClient } from "pg";
import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { parseCoinCount } from "../wallet/ledger.js";
import { fanTierForLevel } from "../../../shared/engagement/fanTiers.js";
import type { EngagementFanLevel } from "../../../shared/contracts/engagement.js";
import { mapEngagementDbError } from "./settings.js";

export type XpLevelRequirement = {
  level: number;
  total_xp_required: number;
  title?: string | null;
  badge_code?: string | null;
};

export type EngagementProgression = {
  total_xp: number;
  fan_level: number;
  battle_energy: number;
};

export function deriveFanLevel(totalXp: number, requirements: XpLevelRequirement[]): number {
  if (!Number.isInteger(totalXp) || totalXp < 0) {
    throw new AppError("unavailable", "XP is unreadable", 503);
  }
  if (requirements.length === 0) {
    throw new AppError("unavailable", "Fan level config is unreadable", 503);
  }
  let level = 0;
  for (const row of requirements) {
    if (row.total_xp_required <= totalXp && row.level > level) {
      level = row.level;
    }
  }
  return level;
}

export function nextLevelTotalXp(currentLevel: number, requirements: XpLevelRequirement[]): number | null {
  const next = requirements
    .filter((row) => row.level > currentLevel)
    .sort((a, b) => a.level - b.level)[0];
  return next ? next.total_xp_required : null;
}

export function latestFanTitle(
  currentLevel: number,
  requirements: XpLevelRequirement[],
): { title: string | null; badge_code: string | null } {
  const titled = requirements
    .filter((row) => row.level <= currentLevel && (row.title || row.badge_code))
    .sort((a, b) => b.level - a.level)[0];
  return {
    title: titled?.title ?? null,
    badge_code: titled?.badge_code ?? null,
  };
}

function requiredCount(value: unknown, label: string): number {
  const n = parseCoinCount(value);
  if (n == null) throw new AppError("unavailable", `${label} is unreadable`, 503);
  return n;
}

async function requireLevelConfig(client: PoolClient | ReturnType<typeof getPool>): Promise<void> {
  const { rows } = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM xp_level_requirements`);
  if (!rows[0] || rows[0].n <= 0) {
    throw new AppError("unavailable", "Fan level config is unreadable", 503);
  }
}

async function levelForTotalXp(
  client: PoolClient | ReturnType<typeof getPool>,
  totalXp: number,
): Promise<number> {
  await requireLevelConfig(client);
  const { rows } = await client.query<{ level: number }>(
    `SELECT COALESCE(MAX(level), 0)::int AS level
     FROM xp_level_requirements
     WHERE total_xp_required <= $1`,
    [totalXp],
  );
  return requiredCount(rows[0]?.level ?? 0, "Fan level");
}

export async function getProgressionSnapshot(userId: string): Promise<EngagementProgression> {
  try {
    await getPool().query(
      `INSERT INTO user_engagement (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    const { rows } = await getPool().query<{ total_xp: string; battle_energy: string }>(
      `SELECT total_xp::text AS total_xp, battle_energy::text AS battle_energy
       FROM user_engagement WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0];
    if (!row) throw new AppError("DATABASE_UNAVAILABLE", "DATABASE_UNAVAILABLE", 503);
    const totalXp = requiredCount(row.total_xp, "XP");
    return {
      total_xp: totalXp,
      fan_level: await levelForTotalXp(getPool(), totalXp),
      battle_energy: requiredCount(row.battle_energy, "Energy"),
    };
  } catch (error) {
    mapEngagementDbError(error);
  }
}

export async function getFanLevelForUser(userId: string): Promise<EngagementFanLevel> {
  const progress = await getProgressionSnapshot(userId);
  const [titleRow, nextRow] = await Promise.all([
    getPool().query<{ title: string | null; badge_code: string | null }>(
      `SELECT title, badge_code
       FROM xp_level_requirements
       WHERE level <= $1 AND (title IS NOT NULL OR badge_code IS NOT NULL)
       ORDER BY level DESC
       LIMIT 1`,
      [progress.fan_level],
    ),
    getPool().query<{ total_xp_required: string }>(
      `SELECT total_xp_required::text AS total_xp_required
       FROM xp_level_requirements
       WHERE level > $1
       ORDER BY level ASC
       LIMIT 1`,
      [progress.fan_level],
    ),
  ]);
  const nextTotal = nextRow.rows[0] ? requiredCount(nextRow.rows[0].total_xp_required, "Next level XP") : null;
  const title = titleRow.rows[0]?.title || fanTierForLevel(progress.fan_level);
  return {
    level: progress.fan_level,
    tier: fanTierForLevel(progress.fan_level),
    total_xp: progress.total_xp,
    title,
    badge_code: titleRow.rows[0]?.badge_code ?? null,
    next_level_total_xp: nextTotal,
    xp_to_next_level: nextTotal == null ? null : Math.max(0, nextTotal - progress.total_xp),
  };
}

export async function grantEngagementXp(
  client: PoolClient,
  userId: string,
  rewards: { xp: number; energy: number },
): Promise<void> {
  if (rewards.xp <= 0 && rewards.energy <= 0) return;
  await client.query(`INSERT INTO user_engagement (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId]);
  const updated = await client.query<{ total_xp: string }>(
    `UPDATE user_engagement
     SET total_xp = total_xp + $2,
         battle_energy = battle_energy + $3,
         updated_at = NOW()
     WHERE user_id = $1
     RETURNING total_xp::text AS total_xp`,
    [userId, rewards.xp, rewards.energy],
  );
  const totalXp = requiredCount(updated.rows[0]?.total_xp, "XP");
  const fanLevel = await levelForTotalXp(client, totalXp);
  await client.query(`UPDATE user_engagement SET fan_level = $2 WHERE user_id = $1`, [userId, fanLevel]);
}
