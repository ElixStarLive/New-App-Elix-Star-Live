import { getPool } from "../../infra/postgres.js";
import { isLiveNeonSchema } from "../../infra/liveSchema.js";
import { AppError } from "../../middleware/errors.js";
import {
  reportBodySchema,
  type ReportReason,
  type ReportTargetType,
} from "../../../shared/contracts/social.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseReportBody(body: unknown): {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details: string;
} {
  if (!isRecord(body)) {
    throw new AppError("validation_error", "Invalid report", 400);
  }
  const parsed = reportBodySchema.safeParse({
    targetType: body.targetType,
    targetId: body.targetId,
    reason: body.reason,
    details: typeof body.details === "string" ? body.details : "",
  });
  if (!parsed.success) {
    throw new AppError("validation_error", "Invalid report", 400);
  }
  return {
    targetType: parsed.data.targetType,
    targetId: parsed.data.targetId.trim(),
    reason: parsed.data.reason,
    details: parsed.data.details.trim(),
  };
}

export async function createReport(reporterId: string, body: unknown): Promise<{ ok: true; id: string }> {
  const parsed = parseReportBody(body);
  if (!parsed.targetId) {
    throw new AppError("validation_error", "Invalid report", 400);
  }
  const targetUserId =
    parsed.targetType === "user" && UUID_RE.test(parsed.targetId) ? parsed.targetId : null;
  try {
    const live = await isLiveNeonSchema();
    const inserted = live
      ? await getPool().query<{ id: string }>(
          `INSERT INTO elix_reports (reporter_id, target_user_id, target_kind, target_id, reason, details, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'open')
           RETURNING id::text AS id`,
          [reporterId, targetUserId, parsed.targetType, parsed.targetId, parsed.reason, parsed.details],
        )
      : await getPool().query<{ id: string }>(
          `INSERT INTO reports (reporter_id, target_user_id, target_kind, target_id, reason, details, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'open')
           RETURNING id::text AS id`,
          [reporterId, targetUserId, parsed.targetType, parsed.targetId, parsed.reason, parsed.details],
        );
    const id = inserted.rows[0]?.id;
    if (!id) throw new AppError("DATABASE_UNAVAILABLE", "DATABASE_UNAVAILABLE", 503);
    return { ok: true, id };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("DATABASE_UNAVAILABLE", "DATABASE_UNAVAILABLE", 503);
  }
}
