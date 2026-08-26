import { Router } from "express";
import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { env } from "../../infra/env.js";
import { createLivekitToken } from "../../infra/livekit.js";
import { requireAuth, requireAdmin, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { reportBodySchema } from "../../../shared/contracts/social.js";
import { withdrawalBodySchema } from "../../../shared/contracts/money.js";
import { routeParam } from "../../http/param.js";
import { withdrawCreatorGbp } from "../wallet/withdrawGbp.js";

export const inboxRouter = Router();
export const safetyRouter = Router();
export const discoverRouter = Router();
export const callsRouter = Router();
export const payoutsRouter = Router();
export const extraAdminRouter = Router();

inboxRouter.get("/threads", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await getPool().query<{
    id: string;
    other_user_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    last_message: string | null;
    updated_at: Date;
    unread: boolean;
  }>(
    `SELECT t.id,
            o.id AS other_user_id,
            o.username,
            o.display_name,
            o.avatar_url,
            (SELECT body FROM chat_messages m WHERE m.thread_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message,
            COALESCE((SELECT MAX(created_at) FROM chat_messages m WHERE m.thread_id = t.id), t.created_at) AS updated_at,
            EXISTS(
              SELECT 1 FROM chat_messages m
              WHERE m.thread_id = t.id
                AND m.sender_id <> $1
                AND (mem.last_read_at IS NULL OR m.created_at > mem.last_read_at)
            ) AS unread
     FROM chat_threads t
     JOIN chat_thread_members mem ON mem.thread_id = t.id AND mem.user_id = $1
     JOIN chat_thread_members other ON other.thread_id = t.id AND other.user_id <> $1
     JOIN users o ON o.id = other.user_id
     ORDER BY updated_at DESC`,
    [req.userId],
  );
  res.json({
    threads: rows.map((row) => ({
      id: row.id,
      otherUserId: row.other_user_id,
      otherUsername: row.username,
      otherDisplayName: row.display_name,
      otherAvatarUrl: row.avatar_url,
      lastMessage: row.last_message ?? "",
      unread: row.unread,
      updatedAt: row.updated_at.toISOString(),
    })),
  });
});

inboxRouter.post("/threads", requireAuth, async (req: AuthedRequest, res) => {
  const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
  if (!userId || userId === req.userId) throw new AppError("validation_error", "Invalid recipient", 400);
  const existing = await getPool().query<{ id: string }>(
    `SELECT t.id
     FROM chat_threads t
     JOIN chat_thread_members a ON a.thread_id = t.id AND a.user_id = $1
     JOIN chat_thread_members b ON b.thread_id = t.id AND b.user_id = $2
     LIMIT 1`,
    [req.userId, userId],
  );
  if (existing.rows[0]) {
    res.json({ id: existing.rows[0].id });
    return;
  }
  const created = await withTransaction(async (client) => {
    const thread = await client.query<{ id: string }>(`INSERT INTO chat_threads DEFAULT VALUES RETURNING id`);
    const id = thread.rows[0].id;
    await client.query(`INSERT INTO chat_thread_members (thread_id, user_id) VALUES ($1, $2), ($1, $3)`, [
      id,
      req.userId,
      userId,
    ]);
    return id;
  });
  res.status(201).json({ id: created });
});

inboxRouter.delete("/threads/:threadId", requireAuth, async (req: AuthedRequest, res) => {
  await getPool().query(
    `DELETE FROM chat_threads t
     USING chat_thread_members m
     WHERE t.id = $1 AND m.thread_id = t.id AND m.user_id = $2`,
    [routeParam(req, "threadId"), req.userId],
  );
  res.json({ ok: true });
});

inboxRouter.get("/threads/:threadId/messages", requireAuth, async (req: AuthedRequest, res) => {
  const threadId = routeParam(req, "threadId");
  const member = await getPool().query(
    `SELECT 1 FROM chat_thread_members WHERE thread_id = $1 AND user_id = $2`,
    [threadId, req.userId],
  );
  if (!member.rows[0]) throw new AppError("forbidden", "Not in this thread", 403);
  const { rows } = await getPool().query<{
    id: string;
    thread_id: string;
    sender_id: string;
    body: string;
    created_at: Date;
  }>(
    `SELECT id, thread_id, sender_id, body, created_at
     FROM chat_messages WHERE thread_id = $1 ORDER BY created_at ASC LIMIT 200`,
    [threadId],
  );
  await getPool().query(
    `UPDATE chat_thread_members SET last_read_at = NOW() WHERE thread_id = $1 AND user_id = $2`,
    [threadId, req.userId],
  );
  res.json({
    messages: rows.map((row) => ({
      id: row.id,
      threadId: row.thread_id,
      senderId: row.sender_id,
      body: row.body,
      createdAt: row.created_at.toISOString(),
    })),
  });
});

inboxRouter.post("/threads/:threadId/messages", requireAuth, async (req: AuthedRequest, res) => {
  const threadId = routeParam(req, "threadId");
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) throw new AppError("validation_error", "Message required", 400);
  const member = await getPool().query(
    `SELECT 1 FROM chat_thread_members WHERE thread_id = $1 AND user_id = $2`,
    [threadId, req.userId],
  );
  if (!member.rows[0]) throw new AppError("forbidden", "Not in this thread", 403);
  const inserted = await getPool().query<{
    id: string;
    thread_id: string;
    sender_id: string;
    body: string;
    created_at: Date;
  }>(
    `INSERT INTO chat_messages (thread_id, sender_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, thread_id, sender_id, body, created_at`,
    [threadId, req.userId, body],
  );
  const row = inserted.rows[0];
  res.status(201).json({
    message: {
      id: row.id,
      threadId: row.thread_id,
      senderId: row.sender_id,
      body: row.body,
      createdAt: row.created_at.toISOString(),
    },
  });
});

safetyRouter.get("/blocked", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await getPool().query<{ id: string; username: string; avatar_url: string | null }>(
    `SELECT u.id, u.username, u.avatar_url
     FROM blocks b JOIN users u ON u.id = b.blocked_id
     WHERE b.blocker_id = $1`,
    [req.userId],
  );
  res.json({
    users: rows.map((row) => ({ id: row.id, username: row.username, avatarUrl: row.avatar_url })),
  });
});

safetyRouter.delete("/blocked/:userId", requireAuth, async (req: AuthedRequest, res) => {
  await getPool().query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [
    req.userId,
    routeParam(req, "userId"),
  ]);
  res.json({ ok: true });
});

discoverRouter.get("/discover", async (_req, res) => {
  const { rows } = await getPool().query<{ tag: string }>(
    `SELECT DISTINCT unnest(hashtags) AS tag FROM videos WHERE deleted_at IS NULL AND cardinality(hashtags) > 0 LIMIT 40`,
  );
  res.json({ tags: rows.map((row) => row.tag) });
});

discoverRouter.get("/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    res.json({ results: [] });
    return;
  }
  const like = `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const users = await getPool().query<{ id: string; username: string; display_name: string; avatar_url: string | null }>(
    `SELECT id, username, display_name, avatar_url
     FROM users
     WHERE deleted_at IS NULL AND (username ILIKE $1 OR display_name ILIKE $1)
     LIMIT 20`,
    [like],
  );
  const videos = await getPool().query<{ id: string; caption: string }>(
    `SELECT id, caption FROM videos WHERE deleted_at IS NULL AND caption ILIKE $1 LIMIT 20`,
    [like],
  );
  res.json({
    results: [
      ...users.rows.map((row) => ({
        id: row.id,
        kind: "user" as const,
        title: row.display_name,
        subtitle: `@${row.username}`,
        avatarUrl: row.avatar_url,
      })),
      ...videos.rows.map((row) => ({
        id: row.id,
        kind: "video" as const,
        title: row.caption || "Video",
        subtitle: "video",
        avatarUrl: null,
      })),
    ],
  });
});

discoverRouter.get("/activity", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await getPool().query<{ id: string; kind: string; payload: Record<string, unknown>; created_at: Date }>(
    `SELECT id, kind, payload, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.userId],
  );
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      title: row.kind,
      body: typeof row.payload?.body === "string" ? row.payload.body : "",
      createdAt: row.created_at.toISOString(),
    })),
  });
});

callsRouter.post("/start", requireAuth, async (req: AuthedRequest, res) => {
  const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
  if (!userId || userId === req.userId) throw new AppError("validation_error", "Invalid callee", 400);
  const roomName = `call_${randomUUID()}`;
  const inserted = await getPool().query<{ id: string }>(
    `INSERT INTO calls (caller_id, callee_id, room_name, status) VALUES ($1, $2, $3, 'ringing') RETURNING id`,
    [req.userId, userId, roomName],
  );
  const token = await createLivekitToken({
    identity: req.userId as string,
    room: roomName,
    canPublish: true,
  });
  res.status(201).json({
    callId: inserted.rows[0].id,
    roomName,
    livekitUrl: token.url,
    livekitToken: token.token,
  });
});

callsRouter.post("/:callId/:action", requireAuth, async (req: AuthedRequest, res) => {
  const action = routeParam(req, "action");
  const callId = routeParam(req, "callId");
  const { rows } = await getPool().query<{ caller_id: string; callee_id: string; room_name: string; status: string }>(
    `SELECT caller_id, callee_id, room_name, status FROM calls WHERE id = $1`,
    [callId],
  );
  const call = rows[0];
  if (!call) throw new AppError("not_found", "Call not found", 404);
  if (call.caller_id !== req.userId && call.callee_id !== req.userId) {
    throw new AppError("forbidden", "Not a participant", 403);
  }
  if (action === "accept") {
    if (req.userId !== call.callee_id) throw new AppError("forbidden", "Only the callee can accept", 403);
    await getPool().query(`UPDATE calls SET status = 'active' WHERE id = $1 AND status = 'ringing'`, [callId]);
  } else if (action === "reject") {
    await getPool().query(`UPDATE calls SET status = 'rejected', ended_at = NOW() WHERE id = $1`, [callId]);
  } else if (action === "end") {
    await getPool().query(`UPDATE calls SET status = 'ended', ended_at = NOW() WHERE id = $1`, [callId]);
  } else {
    throw new AppError("validation_error", "Unknown call action", 400);
  }
  res.json({ ok: true });
});

payoutsRouter.post("/withdraw", requireAuth, async (req: AuthedRequest, res) => {
  const body = withdrawalBodySchema.parse(req.body);
  const account = await getPool().query<{ stripe_account_id: string | null }>(
    `SELECT stripe_account_id FROM payout_accounts WHERE user_id = $1`,
    [req.userId],
  );
  if (!account.rows[0]?.stripe_account_id) {
    throw new AppError("validation_error", "Connect your payout account first", 400);
  }
  await withdrawCreatorGbp(req.userId as string, body);
  res.json({ ok: true });
});

extraAdminRouter.get("/dashboard", requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await getPool().query<{
    users: string;
    videos: string;
    live: string;
    reports: string;
    revenue: string;
    dau: string;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM users WHERE deleted_at IS NULL) AS users,
       (SELECT COUNT(*)::text FROM videos WHERE deleted_at IS NULL) AS videos,
       (SELECT COUNT(*)::text FROM live_streams WHERE status = 'live') AS live,
       (SELECT COUNT(*)::text FROM reports WHERE status = 'open') AS reports,
       (SELECT COALESCE(SUM(coins), 0)::text FROM processed_purchases WHERE status = 'credited') AS revenue,
       (SELECT COUNT(DISTINCT user_id)::text FROM auth_sessions WHERE created_at > NOW() - INTERVAL '1 day') AS dau`,
  );
  const row = rows[0];
  res.json({
    dailyActiveUsers: Number(row.dau),
    totalUsers: Number(row.users),
    totalVideos: Number(row.videos),
    liveRooms: Number(row.live),
    totalRevenueMinor: Number(row.revenue),
    pendingReports: Number(row.reports),
  });
});

extraAdminRouter.post("/users/:userId/ban", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const banned = req.body?.banned !== false;
  await getPool().query(
    `UPDATE users SET banned_until = $2, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
    [routeParam(req, "userId"), banned ? new Date("9999-12-31T00:00:00.000Z") : null],
  );
  res.json({ ok: true, banned });
});

extraAdminRouter.post("/reports/:reportId/resolve", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const result = await getPool().query(
    `UPDATE reports SET status = 'resolved', reviewed_by = $2, reviewed_at = NOW() WHERE id = $1`,
    [routeParam(req, "reportId"), req.userId],
  );
  if (result.rowCount === 0) throw new AppError("not_found", "Report not found", 404);
  res.json({ ok: true });
});

extraAdminRouter.get("/users", requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await getPool().query<{
    id: string;
    username: string;
    email: string;
    is_admin: boolean;
    banned_until: Date | null;
  }>(
    `SELECT id, username, email, is_admin, banned_until
     FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 200`,
  );
  res.json({
    users: rows.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email,
      isAdmin: row.is_admin,
      banned: Boolean(row.banned_until && row.banned_until > new Date()),
    })),
  });
});

extraAdminRouter.get("/reports", requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await getPool().query<{
    id: string;
    target_kind: string;
    target_id: string | null;
    reason: string;
    status: string;
  }>(`SELECT id, target_kind, target_id, reason, status FROM reports ORDER BY created_at DESC LIMIT 200`);
  res.json({
    reports: rows.map((row) => ({
      id: row.id,
      targetKind: row.target_kind,
      targetId: row.target_id ?? "",
      reason: row.reason,
      status: row.status,
    })),
  });
});

extraAdminRouter.get("/withdrawals", requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await getPool().query(`SELECT * FROM withdrawals_gbp ORDER BY created_at DESC LIMIT 200`);
  res.json({ rows });
});

extraAdminRouter.get("/purchases", requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await getPool().query(`SELECT * FROM processed_purchases ORDER BY created_at DESC LIMIT 200`);
  res.json({ rows });
});

extraAdminRouter.get("/rising-stars", requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await getPool().query(
    `SELECT c.id, c.title, s.title AS season, c.status, c.closes_at,
            (SELECT COUNT(*)::int FROM rs_entries e WHERE e.challenge_id = c.id) AS entries
     FROM rs_challenges c
     JOIN rs_seasons s ON s.id = c.season_id
     ORDER BY c.opens_at DESC`,
  );
  res.json({ rows });
});

extraAdminRouter.get("/progression", requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await getPool().query(
    `SELECT m.id, m.title, COUNT(p.user_id)::int AS progress_rows
     FROM engagement_missions m
     LEFT JOIN user_mission_progress p ON p.mission_id = m.id
     GROUP BY m.id, m.title
     ORDER BY m.id`,
  );
  res.json({ rows });
});

extraAdminRouter.get("/monetisation", requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await getPool().query(
    `SELECT provider, COUNT(*)::int AS count, COALESCE(SUM(coins),0)::int AS coins
     FROM processed_purchases GROUP BY provider`,
  );
  res.json({ rows });
});

extraAdminRouter.get("/economy", requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await getPool().query(
    `SELECT
       COALESCE(SUM(paid_coins),0)::text AS paid,
       COALESCE(SUM(promo_coins),0)::text AS promo,
       COALESCE(SUM(test_coins),0)::text AS test
     FROM wallet_balances`,
  );
  res.json({ rows });
});

export async function handleReports(req: AuthedRequest, res: import("express").Response): Promise<void> {
  const body = reportBodySchema.parse(req.body);
  await getPool().query(
    `INSERT INTO reports (reporter_id, target_user_id, target_kind, target_id, reason, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      req.userId,
      body.targetKind === "user" ? body.targetId : null,
      body.targetKind,
      body.targetId,
      body.reason,
      body.details ?? "",
    ],
  );
  res.json({ ok: true });
}

export async function shopCheckout(req: AuthedRequest, res: import("express").Response): Promise<void> {
  const itemId = typeof req.body?.itemId === "string" ? req.body.itemId : "";
  const key = env().STRIPE_SECRET_KEY;
  if (!key) throw new AppError("unavailable", "Shop checkout is not configured", 503);
  const item = await getPool().query<{ title: string; price_pence: number }>(
    `SELECT title, price_pence FROM shop_items WHERE id = $1 AND deleted_at IS NULL`,
    [itemId],
  );
  if (!item.rows[0]) throw new AppError("not_found", "Item not found", 404);
  const stripe = new Stripe(key);
  const origin = env().CLIENT_URL || "http://localhost:5173";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "gbp",
          product_data: { name: item.rows[0].title },
          unit_amount: item.rows[0].price_pence,
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/shop?paid=1`,
    cancel_url: `${origin}/shop`,
    metadata: { itemId, buyerId: req.userId as string },
  });
  if (!session.url || !session.id) throw new AppError("unavailable", "Checkout session was not created", 503);
  await getPool().query(
    `INSERT INTO shop_purchases (buyer_id, item_id, stripe_session_id, status) VALUES ($1, $2, $3, 'pending')`,
    [req.userId, itemId, session.id],
  );
  res.json({ url: session.url });
}
