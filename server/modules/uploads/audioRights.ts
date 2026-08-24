import { AppError } from "../../middleware/errors.js";
import { logger } from "../../infra/logger.js";
import type pg from "pg";

export type AudioRightsDecision = {
  allowed: boolean;
  reason: string | null;
};

function scanEnabled(): boolean {
  return process.env.AUDIO_SCAN_ENABLED !== "0";
}

function pexKey(): string {
  return process.env.PEX_API_KEY?.trim() ?? "";
}

export async function assertCatalogSoundPublishable(
  client: pg.PoolClient | { query: pg.Pool["query"] },
  soundId: string | null,
): Promise<void> {
  if (!soundId) return;
  const { rows } = await client.query<{ copyright_status: string }>(
    `SELECT copyright_status FROM sounds WHERE id = $1`,
    [soundId],
  );
  if (rows[0]?.copyright_status === "BLOCKED") {
    throw new AppError("AUDIO_BLOCKED", "This sound cannot be published.", 403);
  }
}

export async function scanUploadAudio(params: {
  buffer: Buffer;
  contentType: string;
  userId: string;
}): Promise<AudioRightsDecision> {
  if (!scanEnabled()) return { allowed: true, reason: null };
  const key = pexKey();
  if (!key) return { allowed: true, reason: null };

  const isVideo =
    params.contentType.startsWith("video/") ||
    params.contentType === "application/octet-stream";
  if (!isVideo && !params.contentType.startsWith("audio/")) {
    return { allowed: true, reason: null };
  }

  const baseUrl = (process.env.PEX_API_URL || "https://api.pex.com/v1").replace(/\/$/, "");
  const sample = params.buffer.subarray(0, Math.min(params.buffer.length, 512 * 1024));
  try {
    const response = await fetch(`${baseUrl}/identify`, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/octet-stream",
        "X-Partner-User-Id": params.userId,
      },
      body: sample,
    });
    if (response.status === 404 || response.status === 204) {
      return { allowed: true, reason: null };
    }
    if (!response.ok) {
      logger.warn({ status: response.status }, "audio identify provider error");
      throw new AppError("AUDIO_BLOCKED", "Audio copyright check failed.", 403);
    }
    const data = (await response.json()) as {
      blocked?: boolean;
      action?: string;
      match?: { title?: string; artist?: string };
    };
    if (data.blocked || data.action === "reject" || data.action === "mute") {
      throw new AppError("AUDIO_BLOCKED", "This audio is blocked by copyright.", 403);
    }
    if ((data.match?.title || data.match?.artist) && data.action !== "allow") {
      throw new AppError("AUDIO_BLOCKED", "This audio is blocked by copyright.", 403);
    }
    return { allowed: true, reason: null };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err }, "audio identify failed");
    throw new AppError("AUDIO_BLOCKED", "Audio copyright check failed.", 403);
  }
}
