import type { PoolClient } from "pg";
import type { Response } from "express";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { logger } from "../../infra/logger.js";
import { AppError } from "../../middleware/errors.js";
import type { AuthedRequest } from "../../middleware/auth.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ADMIN_REPORTS_LIMIT = 200;
export const ADMIN_REPORTS_NOTE_MAX = 2000;
export const ADMIN_REPORTS_WARNING_TITLE = "Content warning";
export const ADMIN_REPORTS_WARNING_BODY =
  "Your content was reviewed by moderators and may violate our community guidelines. Repeated violations can lead to a ban.";

export const ADMIN_REPORT_STATUSES = ["pending", "reviewed", "dismissed", "actioned"] as const;
export const ADMIN_REPORT_ACTIONS = ["removed", "warned", "no_action"] as const;
export const ADMIN_REPORT_LIST_FILTERS = ["pending", "open", "reviewed", "dismissed", "actioned"] as const;

export type AdminReportStatus = (typeof ADMIN_REPORT_STATUSES)[number];
export type AdminReportAction = (typeof ADMIN_REPORT_ACTIONS)[number];
export type AdminReportListFilter = (typeof ADMIN_REPORT_LIST_FILTERS)[number];

export const ADMIN_REPORTS_LIST_SQL = `
  SELECT r.id::text AS id,
         r.reporter_id::text AS reporter_id,
         r.target_kind AS target_type,
         COALESCE(r.target_id, '') AS target_id,
         r.reason,
         r.details,
         r.status,
         r.created_at,
         u.username AS reporter_username
    FROM reports r
    LEFT JOIN users u ON u.id = r.reporter_id AND u.deleted_at IS NULL
   WHERE (
         $1::text IS NULL
      OR ($1 = 'pending' AND r.status IN ('open', 'pending'))
      OR ($1 <> 'pending' AND r.status = $1)
   )
   ORDER BY r.created_at DESC
   LIMIT ${ADMIN_REPORTS_LIMIT}
`;

export type AdminReportRow = {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
  reporter?: { username: string };
};

export function isAdminReportId(value: string): boolean {
  return UUID_RE.test(value);
}

export function parseAdminReportsFilter(raw: unknown): AdminReportListFilter | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") throw new AppError("validation_error", "Invalid status", 400);
  const status = raw.trim();
  if ((ADMIN_REPORT_LIST_FILTERS as readonly string[]).includes(status)) {
    return status as AdminReportListFilter;
  }
  throw new AppError("validation_error", "Invalid status", 400);
}

export function parseAdminReportStatus(raw: unknown): AdminReportStatus {
  if (typeof raw !== "string" || !(ADMIN_REPORT_STATUSES as readonly string[]).includes(raw)) {
    throw new AppError("validation_error", "Invalid status", 400);
  }
  return raw as AdminReportStatus;
}

export function parseOptionalAdminReportAction(raw: unknown): AdminReportAction | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string" || !(ADMIN_REPORT_ACTIONS as readonly string[]).includes(raw)) {
    throw new AppError("validation_error", "Invalid action", 400);
  }
  return raw as AdminReportAction;
}

export function parseOptionalAdminNote(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") throw new AppError("validation_error", "Invalid admin note", 400);
  const note = raw.trim();
  if (note.length > ADMIN_REPORTS_NOTE_MAX) throw new AppError("validation_error", "Admin note is too long", 400);
  return note || null;
}

function postgresUnavailableCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : undefined;
}

function writeDatabaseFailure(res: Response, error: unknown, label: string): void {
  const code = postgresUnavailableCode(error);
  logger.error({ err: error }, label);
  if (code === "42P01" || code === "42703") {
    res.status(503).json({ error: "SCHEMA_UNAVAILABLE" });
    return;
  }
  res.status(500).json({ error: "DATABASE_ERROR" });
}

function mapReportRow(row: {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string | null;
  reason: string;
  details: string;
  status: string;
  created_at: Date | string;
  reporter_username: string | null;
}): AdminReportRow {
  const created =
    row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || "");
  const mapped: AdminReportRow = {
    id: row.id,
    reporterId: row.reporter_id,
    targetType: row.target_type,
    targetId: row.target_id ?? "",
    reason: row.reason,
    details: row.details ?? "",
    status: row.status,
    createdAt: created,
  };
  if (row.reporter_username) mapped.reporter = { username: row.reporter_username };
  return mapped;
}

export async function loadAdminReports(filter: AdminReportListFilter | null): Promise<AdminReportRow[]> {
  const { rows } = await getPool().query<{
    id: string;
    reporter_id: string;
    target_type: string;
    target_id: string;
    reason: string;
    details: string;
    status: string;
    created_at: Date;
    reporter_username: string | null;
  }>(ADMIN_REPORTS_LIST_SQL, [filter]);
  return rows.map(mapReportRow);
}

async function loadAdminReportById(reportId: string): Promise<AdminReportRow | null> {
  const { rows } = await getPool().query<{
    id: string;
    reporter_id: string;
    target_type: string;
    target_id: string;
    reason: string;
    details: string;
    status: string;
    created_at: Date;
    reporter_username: string | null;
  }>(
    `SELECT r.id::text AS id,
            r.reporter_id::text AS reporter_id,
            r.target_kind AS target_type,
            COALESCE(r.target_id, '') AS target_id,
            r.reason,
            r.details,
            r.status,
            r.created_at,
            u.username AS reporter_username
       FROM reports r
       LEFT JOIN users u ON u.id = r.reporter_id AND u.deleted_at IS NULL
      WHERE r.id = $1`,
    [reportId],
  );
  return rows[0] ? mapReportRow(rows[0]) : null;
}

async function resolveWarningOwner(client: PoolClient, targetType: string, targetId: string): Promise<string> {
  const type = String(targetType || "").toLowerCase();
  if (!targetId) return "";
  if (type === "user" || type === "profile") return targetId;
  if (type === "video" || type === "post" || type === "clip") {
    const { rows } = await client.query<{ user_id: string }>(
      `SELECT user_id::text AS user_id FROM videos WHERE id = $1 LIMIT 1`,
      [targetId],
    );
    return rows[0]?.user_id ?? "";
  }
  if (type === "comment") {
    const { rows } = await client.query<{ user_id: string }>(
      `SELECT user_id::text AS user_id FROM comments WHERE id = $1 LIMIT 1`,
      [targetId],
    );
    return rows[0]?.user_id ?? "";
  }
  if (type === "stream" || type === "live") {
    const { rows } = await client.query<{ host_id: string }>(
      `SELECT host_id::text AS host_id FROM live_streams WHERE id = $1 LIMIT 1`,
      [targetId],
    );
    return rows[0]?.host_id ?? "";
  }
  return "";
}

async function removeReportedTarget(client: PoolClient, targetType: string, targetId: string, adminId: string): Promise<void> {
  if (!targetId) return;
  const type = String(targetType || "").toLowerCase();
  if (type === "video" || type === "post" || type === "clip") {
    await client.query(`UPDATE videos SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, [targetId]);
  } else if (type === "comment") {
    await client.query(`UPDATE comments SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, [targetId]);
  } else if (type === "stream" || type === "live") {
    const { rows } = await client.query<{ host_id: string }>(
      `SELECT host_id::text AS host_id FROM live_streams WHERE id = $1 AND status = 'live'`,
      [targetId],
    );
    if (!rows[0]) {
      logger.warn({ targetId }, "moderation stream end: no active stream removed");
    } else {
      try {
        const live = await import("../live/start.js");
        await live.endLive(rows[0].host_id, targetId);
      } catch (error) {
        throw error instanceof AppError
          ? error
          : new AppError("unavailable", "Could not end reported live stream", 503);
      }
    }
  } else {
    logger.warn({ type, targetId }, "moderation remove: unsupported target type (no-op)");
  }
  logger.warn({ type, targetId, by: adminId }, "moderation content removed");
}

async function warnReportedOwner(
  client: PoolClient,
  targetType: string,
  targetId: string,
): Promise<string> {
  const ownerId = await resolveWarningOwner(client, targetType, targetId);
  if (!ownerId || !UUID_RE.test(ownerId)) return "";
  await client.query(
    `INSERT INTO notifications (user_id, kind, payload)
     VALUES ($1, 'system', $2::jsonb)`,
    [
      ownerId,
      JSON.stringify({
        title: ADMIN_REPORTS_WARNING_TITLE,
        body: ADMIN_REPORTS_WARNING_BODY,
        target_type: String(targetType || "").toLowerCase(),
        target_id: targetId,
      }),
    ],
  );
  return ownerId;
}

async function notifyWarnedOwner(ownerId: string): Promise<void> {
  try {
    const realtime = await import("../../websocket/index.js");
    await realtime.sendToUserGlobal(ownerId, "moderation_warning", { message: ADMIN_REPORTS_WARNING_BODY });
  } catch (error) {
    logger.warn({ err: error, ownerId }, "admin report warning realtime notify failed");
  }
}

export async function applyAdminReportPatch(
  actorId: string,
  reportId: string,
  status: AdminReportStatus,
  action: AdminReportAction | null,
): Promise<{ report: AdminReportRow; actionApplied: boolean }> {
  if (!isAdminReportId(reportId)) throw new AppError("validation_error", "Invalid report", 400);
  const result = await withTransaction(async (client) => {
    const current = await client.query<{
      id: string;
      status: string;
      target_kind: string;
      target_id: string | null;
    }>(
      `SELECT id::text AS id, status, target_kind, target_id
         FROM reports
        WHERE id = $1
        FOR UPDATE`,
      [reportId],
    );
    if (!current.rows[0]) throw new AppError("not_found", "Report not found", 404);
    const alreadyActioned = current.rows[0].status === "actioned";
    let actionApplied = false;
    if (action && !alreadyActioned) {
      if (action === "removed") {
        await removeReportedTarget(client, current.rows[0].target_kind, current.rows[0].target_id ?? "", actorId);
      } else if (action === "warned") {
        const ownerId = await warnReportedOwner(client, current.rows[0].target_kind, current.rows[0].target_id ?? "");
        if (ownerId) await notifyWarnedOwner(ownerId);
      }
      actionApplied = true;
    }
    const updated = await client.query(
      `UPDATE reports
          SET status = $2, reviewed_by = $3, reviewed_at = NOW()
        WHERE id = $1`,
      [reportId, status, actorId],
    );
    if (!updated.rowCount) throw new AppError("not_found", "Report not found", 404);
    return { actionApplied };
  });
  const report = await loadAdminReportById(reportId);
  if (!report) throw new AppError("not_found", "Report not found", 404);
  logger.info({ reportId, status, action, by: actorId, actionApplied: result.actionApplied }, "admin report updated");
  return { report, actionApplied: result.actionApplied };
}

export async function handleAdminReports(req: AuthedRequest, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const filter = parseAdminReportsFilter(req.query.status);
    const reports = await loadAdminReports(filter);
    res.json({ reports });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin list reports failed");
  }
}

export async function handleAdminPatchReport(req: AuthedRequest, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  const reportId = String(req.params.reportId ?? "");
  if (!isAdminReportId(reportId)) throw new AppError("validation_error", "Invalid report", 400);
  const status = parseAdminReportStatus(req.body?.status);
  const action = parseOptionalAdminReportAction(req.body?.action);
  parseOptionalAdminNote(req.body?.adminNote);
  try {
    const result = await applyAdminReportPatch(req.userId as string, reportId, status, action);
    res.json({ report: result.report });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin patch report failed");
  }
}
