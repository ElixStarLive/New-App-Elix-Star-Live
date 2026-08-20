import { Router } from "express";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { applyWalletDelta } from "../wallet/ledger.js";
import { routeParam } from "../../http/param.js";

const router = Router();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

router.get("/missions", requireAuth, async (req: AuthedRequest, res) => {
  const day = todayKey();
  const { rows } = await getPool().query<{
    id: string;
    title: string;
    detail: string;
    goal_count: number;
    progress: number;
    claimed: boolean;
    reward_promo_coins: number;
  }>(
    `SELECT m.id, m.title, m.detail, m.goal_count, m.reward_promo_coins,
            COALESCE(p.progress, 0)::int AS progress,
            COALESCE(p.claimed, FALSE) AS claimed
     FROM engagement_missions m
     LEFT JOIN user_mission_progress p
       ON p.mission_id = m.id AND p.user_id = $1 AND p.period_key = $2
     ORDER BY m.id`,
    [req.userId, day],
  );
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      detail: `${row.detail} · ${row.progress}/${row.goal_count}`,
      claimable: !row.claimed && row.progress >= row.goal_count,
      claimed: row.claimed,
      reward: row.reward_promo_coins,
    })),
  });
});

router.post("/missions/:id/claim", requireAuth, async (req: AuthedRequest, res) => {
  const missionId = routeParam(req, "id");
  const day = todayKey();
  await withTransaction(async (client) => {
    const row = await client.query<{
      goal_count: number;
      reward_promo_coins: number;
      progress: number;
      claimed: boolean;
    }>(
      `SELECT m.goal_count, m.reward_promo_coins,
              COALESCE(p.progress, 0)::int AS progress,
              COALESCE(p.claimed, FALSE) AS claimed
       FROM engagement_missions m
       LEFT JOIN user_mission_progress p
         ON p.mission_id = m.id AND p.user_id = $1 AND p.period_key = $2
       WHERE m.id = $3`,
      [req.userId, day, missionId],
    );
    const mission = row.rows[0];
    if (!mission) throw new AppError("not_found", "Mission not found", 404);
    if (mission.claimed) throw new AppError("conflict", "Already claimed", 409);
    if (mission.progress < mission.goal_count) {
      throw new AppError("validation_error", "Mission is not complete", 400);
    }
    await client.query(
      `INSERT INTO user_mission_progress (user_id, mission_id, period_key, progress, claimed)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (user_id, mission_id, period_key) DO UPDATE SET claimed = TRUE`,
      [req.userId, missionId, day, mission.progress],
    );
    if (mission.reward_promo_coins > 0) {
      await applyWalletDelta(client, {
        userId: req.userId as string,
        bucket: "promo",
        delta: mission.reward_promo_coins,
        reason: "mission_claim",
        idempotencyKey: `mission:${req.userId}:${missionId}:${day}`,
      });
    }
  });
  res.json({ ok: true });
});

router.get("/fan-level", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await getPool().query<{ gifts: string; likes: string }>(
    `SELECT
       (SELECT COALESCE(SUM(coin_cost),0)::text FROM gift_transactions WHERE sender_id = $1 AND bucket <> 'test') AS gifts,
       (SELECT COUNT(*)::text FROM video_likes WHERE user_id = $1) AS likes`,
    [req.userId],
  );
  const xp = Number(rows[0]?.gifts ?? 0) + Number(rows[0]?.likes ?? 0);
  const level = 1 + Math.floor(xp / 50);
  res.json({
    items: [{ id: "fan-level", title: `Fan level ${level}`, detail: `${xp} XP from likes and paid gifts` }],
  });
});

router.get("/mvp", requireAuth, async (_req, res) => {
  const { rows } = await getPool().query<{ id: string; username: string; coins: string }>(
    `SELECT u.id, u.username, COALESCE(SUM(g.coin_cost),0)::text AS coins
     FROM gift_transactions g
     JOIN users u ON u.id = g.sender_id
     WHERE g.created_at > NOW() - INTERVAL '7 days' AND g.bucket = 'paid'
     GROUP BY u.id, u.username
     ORDER BY SUM(g.coin_cost) DESC
     LIMIT 20`,
  );
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      title: row.username,
      detail: `${row.coins} paid gift coins this week`,
    })),
  });
});

router.get("/achievements", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await getPool().query<{
    id: string;
    title: string;
    detail: string;
    goal_count: number;
    progress: number;
    unlocked: boolean;
  }>(
    `SELECT a.id, a.title, a.detail, a.goal_count,
            COALESCE(u.progress, 0)::int AS progress,
            COALESCE(u.unlocked, FALSE) AS unlocked
     FROM engagement_achievements a
     LEFT JOIN user_achievements u ON u.achievement_id = a.id AND u.user_id = $1
     ORDER BY a.id`,
    [req.userId],
  );
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      detail: `${row.detail} · ${row.progress}/${row.goal_count}${row.unlocked ? " · unlocked" : ""}`,
    })),
  });
});

router.get("/rewards", requireAuth, async (req: AuthedRequest, res) => {
  const day = todayKey();
  const { rows } = await getPool().query<{ id: string; title: string; reward_promo_coins: number }>(
    `SELECT m.id, m.title, m.reward_promo_coins
     FROM engagement_missions m
     JOIN user_mission_progress p ON p.mission_id = m.id AND p.user_id = $1 AND p.period_key = $2
     WHERE p.claimed = FALSE AND p.progress >= m.goal_count`,
    [req.userId, day],
  );
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      detail: `${row.reward_promo_coins} promo coins ready to claim`,
      claimable: true,
    })),
  });
});

router.get("/daily-login", requireAuth, async (req: AuthedRequest, res) => {
  const day = todayKey();
  const claimed = await getPool().query<{ streak_day: number }>(
    `SELECT streak_day FROM daily_login_claims WHERE user_id = $1 AND claim_date = $2::date`,
    [req.userId, day],
  );
  const last = await getPool().query<{ claim_date: Date; streak_day: number }>(
    `SELECT claim_date, streak_day FROM daily_login_claims WHERE user_id = $1 ORDER BY claim_date DESC LIMIT 1`,
    [req.userId],
  );
  const streak = claimed.rows[0]?.streak_day ?? last.rows[0]?.streak_day ?? 0;
  res.json({
    items: [
      {
        id: "daily-login",
        title: claimed.rows[0] ? "Today claimed" : "Claim daily login",
        detail: `Streak ${streak} · promo coins for consecutive days`,
        claimable: !claimed.rows[0],
      },
    ],
  });
});

router.post("/daily-login/claim", requireAuth, async (req: AuthedRequest, res) => {
  const day = todayKey();
  await withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT 1 FROM daily_login_claims WHERE user_id = $1 AND claim_date = $2::date`,
      [req.userId, day],
    );
    if (existing.rows[0]) throw new AppError("conflict", "Already claimed today", 409);
    const last = await client.query<{ claim_date: Date; streak_day: number }>(
      `SELECT claim_date, streak_day FROM daily_login_claims WHERE user_id = $1 ORDER BY claim_date DESC LIMIT 1`,
      [req.userId],
    );
    const yesterday = new Date(`${day}T00:00:00.000Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const continueStreak =
      last.rows[0] && last.rows[0].claim_date.toISOString().slice(0, 10) === yesterday.toISOString().slice(0, 10);
    const streak = continueStreak ? last.rows[0].streak_day + 1 : 1;
    await client.query(
      `INSERT INTO daily_login_claims (user_id, claim_date, streak_day) VALUES ($1, $2::date, $3)`,
      [req.userId, day, streak],
    );
    await applyWalletDelta(client, {
      userId: req.userId as string,
      bucket: "promo",
      delta: Math.min(7, streak),
      reason: "daily_login",
      idempotencyKey: `daily_login:${req.userId}:${day}`,
    });
  });
  res.json({ ok: true });
});

router.get("/collections", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await getPool().query<{ saved: string; liked: string }>(
    `SELECT
       (SELECT COUNT(*)::text FROM video_saves WHERE user_id = $1) AS saved,
       (SELECT COUNT(*)::text FROM video_likes WHERE user_id = $1) AS liked`,
    [req.userId],
  );
  res.json({
    items: [
      { id: "saved", title: "Saved videos", detail: `${rows[0]?.saved ?? 0} saved` },
      { id: "liked", title: "Liked videos", detail: `${rows[0]?.liked ?? 0} liked` },
    ],
  });
});

export default router;
