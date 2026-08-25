import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { env } from "../../infra/env.js";
import { requireValkey } from "../../infra/valkey.js";
import { logger } from "../../infra/logger.js";

const SAFETY_CATEGORIES = [
  "driving_while_live",
  "drunk_driving_encouragement",
  "dangerous_stunt",
  "illegal_activity_promotion",
  "self_harm_encouragement",
  "violent_challenge",
] as const;

export const LIVE_SAFETY_WARNING =
  "Your stream may violate our safety guidelines. Please avoid dangerous or illegal activity.";

const MAX_FRAME_CHARS = 80_000;
const CHECKS_PER_MINUTE = 6;

export type SafetyVerdict = {
  flagged: boolean;
  category: string | null;
  severity: "low" | "medium" | "high" | "critical" | null;
};

export function interpretSafetyModel(raw: unknown): SafetyVerdict {
  if (!raw || typeof raw !== "object") {
    return { flagged: false, category: null, severity: null };
  }
  const row = raw as { flagged?: unknown; category?: unknown; severity?: unknown };
  if (row.flagged !== true) {
    return { flagged: false, category: null, severity: null };
  }
  const category = typeof row.category === "string" ? row.category : null;
  if (!category || !SAFETY_CATEGORIES.includes(category as (typeof SAFETY_CATEGORIES)[number])) {
    return { flagged: false, category: null, severity: null };
  }
  const severity =
    row.severity === "low" || row.severity === "medium" || row.severity === "high" || row.severity === "critical"
      ? row.severity
      : "medium";
  return { flagged: true, category, severity };
}

async function assertLiveHost(streamKey: string, userId: string): Promise<void> {
  const { rows } = await getPool().query<{ host_id: string }>(
    `SELECT host_id FROM live_streams
     WHERE status = 'live' AND (room_id = $1 OR id::text = $1 OR host_id::text = $1)
     LIMIT 1`,
    [streamKey],
  );
  if (!rows[0] || rows[0].host_id !== userId) {
    throw new AppError("forbidden", "Not authorized for this stream", 403);
  }
}

async function assertModerationVelocity(userId: string): Promise<void> {
  if (!env().valkeyUrl) {
    if (env().isProduction) {
      throw new AppError("rate_limited", "Too many moderation checks", 429);
    }
    return;
  }
  const key = `live:moderation:${userId}`;
  const count = await requireValkey().incr(key);
  if (count === 1) await requireValkey().expire(key, 60);
  if (count > CHECKS_PER_MINUTE) {
    throw new AppError("rate_limited", "Too many moderation checks", 429);
  }
}

async function writeLog(
  streamKey: string,
  userId: string,
  kind: string,
  category: string | null,
  severity: string | null,
  actionTaken: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO live_moderation_log (stream_key, user_id, kind, category, severity, action_taken, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [streamKey, userId, kind, category, severity, actionTaken, JSON.stringify(details)],
    );
  } catch (err) {
    logger.error({ err, streamKey, userId, kind }, "live moderation log write failed");
  }
}

async function classifyFrame(imageBase64: string): Promise<SafetyVerdict> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { flagged: false, category: null, severity: null };

  const instruction = [
    "Classify a live-stream still for safety. Reply with JSON only:",
    '{"flagged":boolean,"category":string|null,"severity":"low"|"medium"|"high"|"critical"|null}',
    "Flag only when clearly visible: driving_while_live, drunk_driving_encouragement,",
    "dangerous_stunt, illegal_activity_promotion, self_harm_encouragement, violent_challenge.",
    "Do not flag smoking, drinking, sitting in a vehicle as a passenger, or ordinary adult lifestyle.",
  ].join(" ");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      logger.error({ status: response.status }, "live safety classifier HTTP error");
      return { flagged: false, category: null, severity: null };
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return { flagged: false, category: null, severity: null };
    return interpretSafetyModel(JSON.parse(content));
  } catch (err) {
    logger.error({ err }, "live safety classifier failed");
    return { flagged: false, category: null, severity: null };
  }
}

export async function runLiveModerationCheck(
  userId: string,
  raw: unknown,
): Promise<{ action: "none" | "warning"; message?: string }> {
  await assertModerationVelocity(userId);
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const streamKey = typeof body.stream_key === "string" ? body.stream_key.trim() : "";
  if (!streamKey) throw new AppError("validation_error", "Missing stream_key", 400);
  await assertLiveHost(streamKey, userId);

  const imageBase64 = typeof body.image_base64 === "string" ? body.image_base64 : "";
  if (!imageBase64) {
    await writeLog(streamKey, userId, "check", null, null, "none", { note: "no_image" });
    return { action: "none" };
  }
  if (imageBase64.length > MAX_FRAME_CHARS) {
    throw new AppError("validation_error", "image_base64 too large", 413);
  }

  const verdict = await classifyFrame(imageBase64);
  if (!verdict.flagged) {
    await writeLog(streamKey, userId, "check", null, null, "none", { note: "no_flag" });
    return { action: "none" };
  }

  await writeLog(streamKey, userId, "flag", verdict.category, verdict.severity, "flag", {});
  const { sendToUserGlobal } = await import("../../websocket/index.js");
  await sendToUserGlobal(userId, "moderation_warning", { message: LIVE_SAFETY_WARNING });
  return { action: "warning", message: LIVE_SAFETY_WARNING };
}
