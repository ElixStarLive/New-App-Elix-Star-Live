import { getPool } from "../../infra/postgres.js";

function periodKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function bumpEngagement(userId: string, metric: "watch" | "like" | "gift", amount = 1): Promise<void> {
  const day = periodKey();
  await getPool().query(
    `INSERT INTO user_mission_progress (user_id, mission_id, period_key, progress)
     SELECT $1, id, $2, $3
     FROM engagement_missions
     WHERE metric_key = $4
     ON CONFLICT (user_id, mission_id, period_key)
     DO UPDATE SET progress = user_mission_progress.progress + EXCLUDED.progress`,
    [userId, day, amount, metric],
  );
  await getPool().query(
    `INSERT INTO user_achievements (user_id, achievement_id, progress)
     SELECT $1, id, $2
     FROM engagement_achievements
     WHERE metric_key = $3
     ON CONFLICT (user_id, achievement_id)
     DO UPDATE SET
       progress = user_achievements.progress + EXCLUDED.progress,
       unlocked = user_achievements.unlocked OR (user_achievements.progress + EXCLUDED.progress) >= (
         SELECT goal_count FROM engagement_achievements a WHERE a.id = user_achievements.achievement_id
       )`,
    [userId, amount, metric],
  );
}
