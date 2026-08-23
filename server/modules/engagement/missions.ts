import type { PoolClient } from "pg";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { applyWalletDelta } from "../wallet/ledger.js";
import { parseCoinCount } from "../wallet/ledger.js";
import { spawnTreasureChest } from "./collections.js";
import { missionPeriodKey, utcDateKey, utcWeekKey } from "./period.js";
import { grantEngagementXp } from "./progression.js";
import { mapEngagementDbError, resolveEngagementFlags } from "./settings.js";
import type { EngagementMission } from "../../../shared/contracts/engagement.js";

type MissionRow = {
  id: string;
  scope: string;
  title: string;
  description: string;
  goal_count: number;
  reward_xp: number;
  reward_promo_coins: number;
  reward_energy: number;
  metric_key: string;
  progress: number;
  claimed: boolean;
};

function requiredCount(value: unknown, label: string): number {
  const n = parseCoinCount(value);
  if (n == null) throw new AppError("unavailable", `${label} is unreadable`, 503);
  return n;
}

export async function listMissionsForUser(userId: string): Promise<EngagementMission[]> {
  try {
    const day = utcDateKey();
    const week = utcWeekKey();
    const { rows } = await getPool().query<MissionRow>(
      `SELECT m.id, m.scope, m.title, m.description, m.goal_count,
              m.reward_xp, m.reward_promo_coins, m.reward_energy, m.metric_key,
              COALESCE(p.progress, 0)::int AS progress,
              COALESCE(p.claimed, FALSE) AS claimed
       FROM engagement_missions m
       LEFT JOIN user_mission_progress p
         ON p.mission_id = m.id
        AND p.user_id = $1
        AND p.period_key = CASE WHEN m.scope = 'weekly' THEN $3 ELSE $2 END
       WHERE m.enabled = TRUE
       ORDER BY m.scope, m.sort_order, m.id`,
      [userId, day, week],
    );
    return rows.map((row) => {
      const goal = requiredCount(row.goal_count, "Mission goal");
      if (goal <= 0) throw new AppError("unavailable", "Mission goal is invalid", 503);
      const progress = requiredCount(row.progress, "Mission progress");
      return {
        id: row.id,
        scope: row.scope,
        title: row.title,
        description: row.description,
        goal_count: goal,
        reward_xp: requiredCount(row.reward_xp, "Mission XP"),
        reward_promo_coins: requiredCount(row.reward_promo_coins, "Mission promo"),
        reward_energy: requiredCount(row.reward_energy, "Mission energy"),
        metric_key: row.metric_key,
        period_key: missionPeriodKey(row.scope),
        progress,
        completed: progress >= goal,
        claimed: row.claimed === true,
      };
    });
  } catch (error) {
    mapEngagementDbError(error);
  }
}

async function grantMissionRewards(
  client: PoolClient,
  userId: string,
  missionId: string,
  period: string,
  rewards: { promo: number; xp: number; energy: number },
): Promise<void> {
  if (rewards.promo > 0) {
    await applyWalletDelta(client, {
      userId,
      bucket: "promo",
      delta: rewards.promo,
      reason: "mission_claim",
      idempotencyKey: `mission:${userId}:${missionId}:${period}`,
      refType: "mission",
      refId: missionId,
    });
  }
  await grantEngagementXp(client, userId, { xp: rewards.xp, energy: rewards.energy });
}

export async function claimMissionForUser(
  userId: string,
  missionId: string,
): Promise<{ ok: true; alreadyClaimed?: boolean }> {
  if (!missionId) throw new AppError("not_found", "Mission not found", 404);
  const result = await withTransaction(async (client) => {
    const flags = await resolveEngagementFlags(client);
    if (!flags.missionRewardsEnabled) {
      throw new AppError("validation_error", "Mission rewards are not available", 400);
    }
    const def = await client.query<{
      scope: string;
      goal_count: number;
      reward_xp: number;
      reward_promo_coins: number;
      reward_energy: number;
      metric_key: string;
    }>(
      `SELECT scope, goal_count, reward_xp, reward_promo_coins, reward_energy, metric_key
       FROM engagement_missions
       WHERE id = $1 AND enabled = TRUE
       FOR UPDATE`,
      [missionId],
    );
    const mission = def.rows[0];
    if (!mission) throw new AppError("not_found", "Mission not found", 404);
    const goal = requiredCount(mission.goal_count, "Mission goal");
    if (goal <= 0) throw new AppError("unavailable", "Mission goal is invalid", 503);
    const period = missionPeriodKey(mission.scope);
    const progressRow = await client.query<{ progress: number; claimed: boolean }>(
      `SELECT progress, claimed
       FROM user_mission_progress
       WHERE user_id = $1 AND mission_id = $2 AND period_key = $3
       FOR UPDATE`,
      [userId, missionId, period],
    );
    const progress = requiredCount(progressRow.rows[0]?.progress ?? 0, "Mission progress");
    if (progress < goal) throw new AppError("validation_error", "Mission is not complete", 400);
    if (progressRow.rows[0]?.claimed === true) {
      return { ok: true as const, alreadyClaimed: true, metricKey: mission.metric_key };
    }
    const marked = await client.query<{ claimed: boolean }>(
      `INSERT INTO user_mission_progress (user_id, mission_id, period_key, progress, claimed)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (user_id, mission_id, period_key)
       DO UPDATE SET claimed = TRUE
       WHERE user_mission_progress.claimed = FALSE
       RETURNING claimed`,
      [userId, missionId, period, progress],
    );
    if (!marked.rows[0]) {
      return { ok: true as const, alreadyClaimed: true, metricKey: mission.metric_key };
    }
    await grantMissionRewards(client, userId, missionId, period, {
      promo: flags.promotionalCoinsEnabled ? requiredCount(mission.reward_promo_coins, "Mission promo") : 0,
      xp: requiredCount(mission.reward_xp, "Mission XP"),
      energy: flags.battleEnergyEnabled ? requiredCount(mission.reward_energy, "Mission energy") : 0,
    });
    const rare = await spawnTreasureChest(userId, "chest_rare_missions", `mission:${missionId}`, client);
    if (!rare.ok && rare.error !== "COOLDOWN") {
      throw new AppError(
        rare.error === "UNKNOWN_CHEST" ? "SCHEMA_UNAVAILABLE" : "unavailable",
        rare.error === "UNKNOWN_CHEST" ? "SCHEMA_UNAVAILABLE" : rare.error,
        503,
      );
    }
    if (mission.metric_key === "unique_creators") {
      const epic = await spawnTreasureChest(userId, "chest_epic_streams", `mission:${missionId}`, client);
      if (!epic.ok && epic.error !== "COOLDOWN") {
        throw new AppError(
          epic.error === "UNKNOWN_CHEST" ? "SCHEMA_UNAVAILABLE" : "unavailable",
          epic.error === "UNKNOWN_CHEST" ? "SCHEMA_UNAVAILABLE" : epic.error,
          503,
        );
      }
    }
    return { ok: true as const, metricKey: mission.metric_key };
  });
  return result.alreadyClaimed ? { ok: true, alreadyClaimed: true } : { ok: true };
}
