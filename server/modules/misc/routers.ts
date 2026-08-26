import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { requireAuth, requireAdmin, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { reportBodySchema } from "../../../shared/contracts/social.js";
import { routeParam } from "../../http/param.js";

export const moderationRouter = Router();
export const chatRouter = Router();
export const shopRouter = Router();
export const notifyRouter = Router();
export const adminRouter = Router();

moderationRouter.post("/report", requireAuth, async (req: AuthedRequest, res) => {
  const body = reportBodySchema.parse(req.body);
  await getPool().query(
    `INSERT INTO reports (reporter_id, target_kind, target_id, reason, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [req.userId, body.targetKind, body.targetId, body.reason, body.details ?? ""],
  );
  res.json({ ok: true });
});

moderationRouter.post("/block/:userId", requireAuth, async (req: AuthedRequest, res) => {
  await getPool().query(
    `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.userId, routeParam(req, "userId")],
  );
  res.json({ ok: true });
});

moderationRouter.delete("/block/:userId", requireAuth, async (req: AuthedRequest, res) => {
  await getPool().query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [
    req.userId,
    routeParam(req, "userId"),
  ]);
  res.json({ ok: true });
});

chatRouter.get("/threads", requireAuth, async (req: AuthedRequest, res) => {
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

shopRouter.get("/items", async (req, res) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : typeof req.query.user_id === "string" ? req.query.user_id : "";
  const { rows } = await getPool().query<{
    id: string;
    seller_id: string;
    title: string;
    description: string;
    price_pence: number;
    image_url: string | null;
  }>(
    userId
      ? `SELECT id, seller_id, title, description, price_pence, image_url
         FROM shop_items WHERE deleted_at IS NULL AND seller_id = $1 ORDER BY created_at DESC LIMIT 100`
      : `SELECT id, seller_id, title, description, price_pence, image_url
         FROM shop_items WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`,
    userId ? [userId] : [],
  );
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      sellerId: row.seller_id,
      name: row.title,
      description: row.description,
      pricePence: row.price_pence,
      priceLabel: `£${(row.price_pence / 100).toFixed(2)}`,
      imageUrl: row.image_url,
    })),
  });
});

shopRouter.post("/items", requireAuth, async (req: AuthedRequest, res) => {
  const body = req.body as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const pricePence = typeof body.pricePence === "number" ? Math.floor(body.pricePence) : Number(body.pricePence);
  if (!title || title.length > 80) throw new AppError("validation_error", "Enter a title", 400);
  if (description.length > 500) throw new AppError("validation_error", "Description is too long", 400);
  if (!Number.isFinite(pricePence) || pricePence < 0) throw new AppError("validation_error", "Enter a valid price", 400);
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO shop_items (seller_id, title, description, price_pence)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [req.userId, title, description, pricePence],
  );
  res.status(201).json({ id: rows[0]?.id });
});

shopRouter.delete("/items/:itemId", requireAuth, async (req: AuthedRequest, res) => {
  const itemId = routeParam(req, "itemId");
  const result = await getPool().query(
    `UPDATE shop_items SET deleted_at = NOW()
     WHERE id = $1 AND seller_id = $2 AND deleted_at IS NULL`,
    [itemId, req.userId],
  );
  if (!result.rowCount) throw new AppError("not_found", "Item not found", 404);
  res.json({ ok: true });
});

notifyRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await getPool().query(
    `SELECT id, kind, payload, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.userId],
  );
  res.json({ notifications: rows });
});

notifyRouter.get("/prefs", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await getPool().query<{
    live: boolean;
    follow: boolean;
    gift: boolean;
    cohost: boolean;
    battle: boolean;
    system: boolean;
  }>(`SELECT live, follow, gift, cohost, battle, system FROM notification_prefs WHERE user_id = $1`, [req.userId]);
  res.json(
    rows[0] ?? { live: true, follow: true, gift: true, cohost: true, battle: true, system: true },
  );
});

notifyRouter.patch("/prefs", requireAuth, async (req: AuthedRequest, res) => {
  const body = req.body as Record<string, unknown>;
  await getPool().query(`INSERT INTO notification_prefs (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [req.userId]);
  const fields = ["live", "follow", "gift", "cohost", "battle", "system"] as const;
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const field of fields) {
    if (typeof body[field] === "boolean") {
      values.push(body[field]);
      sets.push(`${field} = $${values.length}`);
    }
  }
  if (sets.length > 0) {
    values.push(req.userId);
    await getPool().query(`UPDATE notification_prefs SET ${sets.join(", ")} WHERE user_id = $${values.length}`, values);
  }
  const { rows } = await getPool().query(`SELECT live, follow, gift, cohost, battle, system FROM notification_prefs WHERE user_id = $1`, [
    req.userId,
  ]);
  res.json(rows[0]);
});

notifyRouter.post("/device-tokens", requireAuth, async (req: AuthedRequest, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const platform = typeof req.body?.platform === "string" ? req.body.platform : "unknown";
  if (!token) throw new AppError("validation_error", "token required", 400);
  await getPool().query(
    `INSERT INTO device_tokens (user_id, platform, token) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, token) DO NOTHING`,
    [req.userId, platform, token],
  );
  res.json({ ok: true });
});

adminRouter.get("/stats", requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await getPool().query<{ users: string; videos: string; live: string }>(
    `SELECT
       (SELECT COUNT(*)::text FROM users WHERE deleted_at IS NULL) AS users,
       (SELECT COUNT(*)::text FROM videos WHERE deleted_at IS NULL) AS videos,
       (SELECT COUNT(*)::text FROM live_streams WHERE status = 'live') AS live`,
  );
  res.json(rows[0]);
});
