import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { insertBlock } from "../blocks/service.js";
import { listAlerts, markAlertsRead } from "../notifications/query.js";
import { createReport } from "../reports/service.js";
import { isSchemaUnavailable } from "../engagement/settings.js";

export const moderationRouter = Router();
export const notifyRouter = Router();
export const adminRouter = Router();

function param(req: { params: Record<string, string | string[] | undefined> }, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

moderationRouter.post("/report", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await createReport(req.userId as string, req.body));
});

moderationRouter.post("/block/:userId", requireAuth, async (req: AuthedRequest, res) => {
  await insertBlock(req.userId as string, param(req, "userId"));
  res.json({ ok: true });
});

notifyRouter.post("/read", requireAuth, async (req: AuthedRequest, res) => {
  const raw = (req.body as { ids?: unknown } | undefined)?.ids;
  const ids = Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
  await markAlertsRead(req.userId as string, ids);
  res.json({ ok: true });
});

notifyRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listAlerts(req.userId as string));
});

notifyRouter.get("/prefs", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { rows } = await getPool().query<{
      live: boolean;
      follow: boolean;
      gift: boolean;
      cohost: boolean;
      battle: boolean;
      system: boolean;
    }>(`SELECT live, follow, gift, cohost, battle, system FROM notification_prefs WHERE user_id = $1`, [req.userId]);
    if (!rows[0]) {
      await getPool().query(`INSERT INTO notification_prefs (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [req.userId]);
      const inserted = await getPool().query<{
        live: boolean;
        follow: boolean;
        gift: boolean;
        cohost: boolean;
        battle: boolean;
        system: boolean;
      }>(`SELECT live, follow, gift, cohost, battle, system FROM notification_prefs WHERE user_id = $1`, [req.userId]);
      if (!inserted.rows[0]) {
        throw new AppError("SCHEMA_UNAVAILABLE", "SCHEMA_UNAVAILABLE", 503);
      }
      res.json(inserted.rows[0]);
      return;
    }
    res.json(rows[0]);
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (isSchemaUnavailable(error)) {
      throw new AppError("SCHEMA_UNAVAILABLE", "SCHEMA_UNAVAILABLE", 503);
    }
    throw error;
  }
});

notifyRouter.patch("/prefs", requireAuth, async (req: AuthedRequest, res) => {
  try {
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
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (isSchemaUnavailable(error)) {
      throw new AppError("SCHEMA_UNAVAILABLE", "SCHEMA_UNAVAILABLE", 503);
    }
    throw error;
  }
});

