import { getPool } from "../../infra/postgres.js";
import { missionPeriodKey } from "./period.js";

export async function bumpEngagement(userId: string, metric: "watch" | "like" | "gift", amount = 1): Promise<void> {
  if (!userId || amount <= 0) return;
  const { rows } = await getPool().query<{ id: string; scope: string; goal_count: number }>(
    `SELECT id, scope, goal_count
     FROM engagement_missions
     WHERE metric_key = $1 AND enabled = TRUE`,
    [metric],
  );
  for (const mission of rows) {
    const period = missionPeriodKey(mission.scope);
    await getPool().query(
      `INSERT INTO user_mission_progress (user_id, mission_id, period_key, progress)
       VALUES ($1, $2, $3, LEAST($4::int, $5::int))
       ON CONFLICT (user_id, mission_id, period_key)
       DO UPDATE SET progress = LEAST($5::int, user_mission_progress.progress + $4::int)`,
      [userId, mission.id, period, amount, mission.goal_count],
    );
  }
}
