import type pg from "pg";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { isLiveNeonSchema } from "../../infra/liveSchema.js";
import { AppError } from "../../middleware/errors.js";
import { mergeHashtags } from "../../lib/hashtags.js";
import { isStemExtraCaption } from "../../../shared/stemEligibility.js";
import {
  UPLOAD_CAPTION_MAX,
  UPLOAD_MAX_BYTES,
  canonicalSoundId,
  extensionForMime,
  isUuid,
  normalizeCaption,
  normalizePrivacy,
  normalizeUploadKind,
  ownedStoragePath,
  validateIncomingMedia,
  type UploadKind,
  type UploadPrivacy,
} from "../../../shared/uploadContract.js";
import { deleteOwnedMedia, putOwnedMedia } from "./storage.js";
import { assertCatalogSoundPublishable, scanUploadAudio } from "./audioRights.js";

export type UploadSessionRow = {
  id: string;
  user_id: string;
  kind: UploadKind;
  idempotency_key: string;
  storage_path: string;
  content_type: string;
  byte_size: string | number;
  duration_ms: number;
  width: number | null;
  height: number | null;
  status: "pending" | "uploaded" | "published" | "failed" | "aborted";
  bunny_url: string | null;
  published_id: string | null;
};

export type CreateSessionInput = {
  idempotencyKey: string;
  kind: UploadKind;
  contentType: string;
  byteSize: number;
  filename?: string;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
};

export type PublishInput = {
  caption?: unknown;
  extraHashtags?: unknown;
  privacy?: unknown;
  soundId?: unknown;
};

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505");
}

async function loadSession(client: pg.Pool | pg.PoolClient, userId: string, sessionId: string): Promise<UploadSessionRow> {
  if (!isUuid(sessionId)) throw new AppError("validation_error", "Invalid upload session", 400);
  const { rows } = await client.query<UploadSessionRow>(
    `SELECT id, user_id, kind, idempotency_key, storage_path, content_type, byte_size, duration_ms, width, height, status, bunny_url, published_id
     FROM upload_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId],
  );
  const row = rows[0];
  if (!row) throw new AppError("not_found", "Upload session not found", 404);
  return row;
}

export async function createUploadSession(userId: string, input: CreateSessionInput): Promise<{ sessionId: string; kind: UploadKind }> {
  if (!isUuid(input.idempotencyKey)) {
    throw new AppError("validation_error", "idempotencyKey must be a UUID", 400);
  }
  const kind = normalizeUploadKind(input.kind);
  const contentType = (input.contentType || "").trim();
  const check = validateIncomingMedia({
    kind,
    contentType,
    byteSize: input.byteSize,
    durationMs: input.durationMs,
  });
  if (!check.ok) throw new AppError("validation_error", check.error, 400);

  const { rows: existing } = await getPool().query<{ id: string; kind: UploadKind }>(
    `SELECT id, kind FROM upload_sessions WHERE user_id = $1 AND idempotency_key = $2`,
    [userId, input.idempotencyKey],
  );
  if (existing[0]) {
    return { sessionId: existing[0].id, kind: existing[0].kind };
  }

  const sessionId = input.idempotencyKey;
  const ext = extensionForMime(contentType, input.filename ?? "");
  const storagePath = ownedStoragePath(kind, userId, sessionId, ext);
  try {
    const inserted = await getPool().query<{ id: string; kind: UploadKind }>(
      `INSERT INTO upload_sessions (
         id, user_id, kind, idempotency_key, storage_path, content_type, byte_size, duration_ms, width, height, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')
       RETURNING id, kind`,
      [
        sessionId,
        userId,
        kind,
        input.idempotencyKey,
        storagePath,
        contentType.split(";")[0]?.trim() || contentType,
        input.byteSize,
        Math.max(0, Math.floor(input.durationMs ?? 0)),
        input.width && Number.isFinite(input.width) ? Math.floor(input.width) : null,
        input.height && Number.isFinite(input.height) ? Math.floor(input.height) : null,
      ],
    );
    return { sessionId: inserted.rows[0].id, kind: inserted.rows[0].kind };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const { rows } = await getPool().query<{ id: string; kind: UploadKind }>(
      `SELECT id, kind FROM upload_sessions WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, input.idempotencyKey],
    );
    if (!rows[0]) throw error;
    return { sessionId: rows[0].id, kind: rows[0].kind };
  }
}

export async function storeUploadBytes(
  userId: string,
  sessionId: string,
  body: Buffer,
  declaredType: string,
): Promise<{ sessionId: string; bytes: number }> {
  if (!body || body.length === 0) throw new AppError("validation_error", "Request body must be non-empty binary.", 400);
  if (body.length > UPLOAD_MAX_BYTES) throw new AppError("validation_error", "File too large", 413);

  const session = await loadSession(getPool(), userId, sessionId);
  if (session.status === "published") {
    return { sessionId: session.id, bytes: Number(session.byte_size) };
  }
  if (session.status === "uploaded" && session.bunny_url) {
    return { sessionId: session.id, bytes: Number(session.byte_size) };
  }
  if (session.status === "aborted" || session.status === "failed") {
    throw new AppError("conflict", "Upload session is not active", 409);
  }

  const contentType = session.content_type || declaredType;
  await scanUploadAudio({ buffer: body, contentType, userId });
  let url: string;
  try {
    url = await putOwnedMedia(userId, session.storage_path, body, contentType);
  } catch (error) {
    await getPool().query(
      `UPDATE upload_sessions SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1 AND user_id = $3 AND status = 'pending'`,
      [session.id, error instanceof Error ? error.message : "Upload failed", userId],
    );
    throw error;
  }

  await getPool().query(
    `UPDATE upload_sessions
     SET status = 'uploaded', bunny_url = $2, byte_size = $3, error_message = NULL, updated_at = NOW()
     WHERE id = $1 AND user_id = $4 AND status IN ('pending', 'uploaded')`,
    [session.id, url, body.length, userId],
  );
  return { sessionId: session.id, bytes: body.length };
}

export type PublishResult = {
  id: string;
  kind: UploadKind;
  processingStatus: "ready";
};

export async function publishUploadSession(userId: string, sessionId: string, input: PublishInput): Promise<PublishResult> {
  const caption = normalizeCaption(input.caption);
  if (caption.length > UPLOAD_CAPTION_MAX) {
    throw new AppError("validation_error", `Caption must be at most ${UPLOAD_CAPTION_MAX} characters.`, 400);
  }
  const extra = typeof input.extraHashtags === "string" ? input.extraHashtags : "";
  const hashtags = mergeHashtags(caption, extra);
  const privacy: UploadPrivacy = normalizePrivacy(input.privacy);
  const soundId = canonicalSoundId(input.soundId);

  return withTransaction(async (client) => {
    const session = await loadSession(client, userId, sessionId);
    if (session.status === "published" && session.published_id) {
      return { id: session.published_id, kind: session.kind, processingStatus: "ready" as const };
    }
    if (session.status !== "uploaded" || !session.bunny_url) {
      throw new AppError("conflict", "Media has not finished uploading", 409);
    }

    await assertCatalogSoundPublishable(client, soundId);
    const published = session.kind === "story"
      ? await insertStory(client, userId, session)
      : await insertVideo(client, userId, session, { caption, hashtags, privacy, soundId });

    await client.query(
      `UPDATE upload_sessions
       SET status = 'published', published_id = $2, updated_at = NOW(), error_message = NULL
       WHERE id = $1 AND user_id = $3`,
      [session.id, published, userId],
    );
    return { id: published, kind: session.kind, processingStatus: "ready" as const };
  });
}

async function insertVideo(
  client: pg.PoolClient,
  userId: string,
  session: UploadSessionRow,
  meta: { caption: string; hashtags: string[]; privacy: UploadPrivacy; soundId: string | null },
): Promise<string> {
  const isStem = isStemExtraCaption(meta.caption, meta.hashtags);
  try {
    if (await isLiveNeonSchema()) {
      const identity = await client.query<{ username: string; display_name: string; avatar_url: string | null }>(
        `SELECT COALESCE(NULLIF(p.username, ''), u.username, '') AS username,
                COALESCE(NULLIF(p.display_name, ''), u.display_name, u.username, '') AS display_name,
                COALESCE(NULLIF(p.avatar_url, ''), u.avatar_url) AS avatar_url
           FROM elix_auth_users u
           LEFT JOIN profiles p ON p.user_id = u.id
          WHERE u.id = $1`,
        [userId],
      );
      const row = identity.rows[0];
      if (!row) throw new AppError("not_found", "User not found", 404);
      const durationSeconds =
        session.duration_ms > 0 ? Math.max(1, Math.round(session.duration_ms / 1000)) : null;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO videos (
           id, user_id, url, description, hashtags, privacy, duration,
           username, display_name, avatar, thumbnail
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          session.id,
          userId,
          session.bunny_url,
          meta.caption,
          meta.hashtags,
          meta.privacy,
          durationSeconds,
          row.username,
          row.display_name,
          row.avatar_url,
          null,
        ],
      );
      return inserted.rows[0].id;
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO videos (id, user_id, bunny_path, caption, hashtags, duration_ms, is_stem, privacy, sound_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        session.id,
        userId,
        session.bunny_url,
        meta.caption,
        meta.hashtags,
        session.duration_ms,
        isStem,
        meta.privacy,
        meta.soundId,
      ],
    );
    return inserted.rows[0].id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const { rows } = await client.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM videos WHERE id = $1`,
      [session.id],
    );
    if (rows[0]?.user_id === userId) return rows[0].id;
    throw new AppError("conflict", "Not allowed to overwrite this video.", 403);
  }
}

async function insertStory(client: pg.PoolClient, userId: string, session: UploadSessionRow): Promise<string> {
  const mediaType = session.content_type.startsWith("image/") ? "image" : "video";
  const thumbnail = mediaType === "image" ? session.bunny_url : null;
  try {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO stories (id, user_id, media_url, thumbnail, media_type, expires_at)
       VALUES ($1,$2,$3,$4,$5, NOW() + INTERVAL '24 hours')
       RETURNING id`,
      [session.id, userId, session.bunny_url, thumbnail, mediaType],
    );
    return inserted.rows[0].id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const { rows } = await client.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM stories WHERE id = $1`,
      [session.id],
    );
    if (rows[0]?.user_id === userId) return rows[0].id;
    throw new AppError("conflict", "Not allowed to overwrite this story.", 403);
  }
}

export async function abortUploadSession(userId: string, sessionId: string): Promise<void> {
  const session = await loadSession(getPool(), userId, sessionId);
  if (session.status === "published") return;
  await getPool().query(
    `UPDATE upload_sessions SET status = 'aborted', updated_at = NOW() WHERE id = $1 AND user_id = $2 AND status <> 'published'`,
    [sessionId, userId],
  );
  if (session.storage_path && session.status === "uploaded") {
    await deleteOwnedMedia(userId, session.storage_path).catch(() => undefined);
  }
}

export async function cleanupStaleUploadSessions(): Promise<number> {
  const { rows } = await getPool().query<UploadSessionRow>(
    `SELECT id, user_id, kind, idempotency_key, storage_path, content_type, byte_size, duration_ms, width, height, status, bunny_url, published_id
     FROM upload_sessions
     WHERE status IN ('pending', 'uploaded')
       AND updated_at < NOW() - INTERVAL '24 hours'
     LIMIT 50`,
  );
  let cleaned = 0;
  for (const row of rows) {
    if (row.status === "uploaded" && row.storage_path) {
      await deleteOwnedMedia(row.user_id, row.storage_path).catch(() => undefined);
    }
    await getPool().query(
      `UPDATE upload_sessions SET status = 'aborted', updated_at = NOW() WHERE id = $1 AND status IN ('pending', 'uploaded')`,
      [row.id],
    );
    cleaned += 1;
  }
  return cleaned;
}
