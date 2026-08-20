import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { routeParam } from "../../http/param.js";

const router = Router();

router.get("/", async (_req, res) => {
  const { rows } = await getPool().query<{
    id: string;
    title: string;
    season_title: string;
    status: string;
    closes_at: Date;
  }>(
    `SELECT c.id, c.title, s.title AS season_title, c.status, c.closes_at
     FROM rs_challenges c
     JOIN rs_seasons s ON s.id = c.season_id
     WHERE c.status = 'open' AND c.closes_at > NOW()
     ORDER BY c.opens_at DESC`,
  );
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      detail: row.season_title,
      status: row.status,
      closesAt: row.closes_at.toISOString(),
    })),
  });
});

router.get("/:challengeId", async (req, res) => {
  const challengeId = routeParam(req, "challengeId");
  const challenge = await getPool().query<{ id: string; title: string }>(
    `SELECT id, title FROM rs_challenges WHERE id = $1`,
    [challengeId],
  );
  if (!challenge.rows[0]) throw new AppError("not_found", "Challenge not found", 404);
  const entries = await getPool().query<{
    id: string;
    user_id: string;
    username: string;
    video_id: string | null;
    vote_count: number;
  }>(
    `SELECT e.id, e.user_id, u.username, e.video_id, e.vote_count
     FROM rs_entries e
     JOIN users u ON u.id = e.user_id
     WHERE e.challenge_id = $1
     ORDER BY e.vote_count DESC, e.created_at ASC`,
    [challengeId],
  );
  res.json({
    id: challenge.rows[0].id,
    title: challenge.rows[0].title,
    items: entries.rows.map((row) => ({
      id: row.id,
      title: row.username,
      detail: `${row.vote_count} votes`,
      userId: row.user_id,
      videoId: row.video_id,
      voteCount: row.vote_count,
    })),
  });
});

router.post("/:challengeId/enter", requireAuth, async (req: AuthedRequest, res) => {
  const challengeId = routeParam(req, "challengeId");
  const videoId = typeof req.body?.videoId === "string" ? req.body.videoId : null;
  const challenge = await getPool().query<{ id: string }>(
    `SELECT id FROM rs_challenges WHERE id = $1 AND status = 'open' AND closes_at > NOW()`,
    [challengeId],
  );
  if (!challenge.rows[0]) throw new AppError("not_found", "Challenge is not open", 404);
  if (videoId) {
    const owned = await getPool().query(
      `SELECT 1 FROM videos WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [videoId, req.userId],
    );
    if (!owned.rows[0]) throw new AppError("forbidden", "Video is not yours", 403);
  }
  const inserted = await getPool().query<{ id: string }>(
    `INSERT INTO rs_entries (challenge_id, user_id, video_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (challenge_id, user_id) DO UPDATE SET video_id = COALESCE(EXCLUDED.video_id, rs_entries.video_id)
     RETURNING id`,
    [challengeId, req.userId, videoId],
  );
  res.status(201).json({ id: inserted.rows[0].id });
});

router.post("/:challengeId/vote", requireAuth, async (req: AuthedRequest, res) => {
  const challengeId = routeParam(req, "challengeId");
  const entryId = typeof req.body?.entryId === "string" ? req.body.entryId : "";
  if (!entryId) throw new AppError("validation_error", "entryId required", 400);
  const entry = await getPool().query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM rs_entries WHERE id = $1 AND challenge_id = $2`,
    [entryId, challengeId],
  );
  if (!entry.rows[0]) throw new AppError("not_found", "Entry not found", 404);
  if (entry.rows[0].user_id === req.userId) throw new AppError("validation_error", "Cannot vote for yourself", 400);
  try {
    await getPool().query(
      `INSERT INTO rs_votes (user_id, challenge_id, entry_id, vote_day) VALUES ($1, $2, $3, CURRENT_DATE)`,
      [req.userId, challengeId, entryId],
    );
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
    if (code === "23505") throw new AppError("conflict", "Already voted today", 409);
    throw error;
  }
  await getPool().query(`UPDATE rs_entries SET vote_count = vote_count + 1 WHERE id = $1`, [entryId]);
  res.json({ ok: true });
});

export default router;
