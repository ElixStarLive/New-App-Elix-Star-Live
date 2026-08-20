import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { getPool } from "../../infra/postgres.js";
import { bunnyUpload } from "../../infra/bunny.js";
import { parseMultipart, readRequestBuffer } from "../../infra/multipart.js";
import { extractHashtags } from "../../lib/hashtags.js";
import { AppError } from "../../middleware/errors.js";
import type { AuthedRequest } from "../../middleware/auth.js";

export async function handleVideoUpload(req: AuthedRequest, res: Response): Promise<void> {
  const contentType = req.headers["content-type"] ?? "";
  const buffer = await readRequestBuffer(req);
  const parsed = parseMultipart(buffer, contentType);
  if (!parsed.file) throw new AppError("validation_error", "File required", 400);
  const storagePath = `videos/${req.userId}/${randomUUID()}${path.extname(parsed.file.filename) || ".bin"}`;
  const url = await bunnyUpload(storagePath, parsed.file.buffer, parsed.file.contentType);
  const caption = parsed.fields.caption ?? "";
  const privacy = parsed.fields.privacy === "private" ? "private" : "public";
  const soundId = parsed.fields.soundId?.trim() || null;
  const isStem = parsed.fields.stem === "1" || parsed.fields.isStem === "true";
  const hashtags = extractHashtags(caption);
  const inserted = await getPool().query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, hashtags, privacy, sound_id, is_stem)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [req.userId, url, caption, hashtags, privacy, soundId, isStem],
  );
  res.status(201).json({ ok: true, url, id: inserted.rows[0].id });
}

export async function handleAvatarUpload(req: AuthedRequest, res: Response): Promise<void> {
  const contentType = req.headers["content-type"] ?? "";
  const buffer = await readRequestBuffer(req);
  const parsed = parseMultipart(buffer, contentType);
  if (!parsed.file) throw new AppError("validation_error", "File required", 400);
  const storagePath = `avatars/${req.userId}/${randomUUID()}${path.extname(parsed.file.filename) || ".jpg"}`;
  const url = await bunnyUpload(storagePath, parsed.file.buffer, parsed.file.contentType);
  await getPool().query(`UPDATE users SET avatar_url = $2, updated_at = NOW() WHERE id = $1`, [req.userId, url]);
  res.json({ avatarUrl: url });
}

export async function handleStoryUpload(req: AuthedRequest, res: Response): Promise<void> {
  const contentType = req.headers["content-type"] ?? "";
  const buffer = await readRequestBuffer(req);
  const parsed = parseMultipart(buffer, contentType);
  if (!parsed.file) throw new AppError("validation_error", "File required", 400);
  const storagePath = `stories/${req.userId}/${randomUUID()}${path.extname(parsed.file.filename) || ".bin"}`;
  const url = await bunnyUpload(storagePath, parsed.file.buffer, parsed.file.contentType);
  const inserted = await getPool().query<{ id: string }>(
    `INSERT INTO stories (user_id, media_url, thumbnail, media_type, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '24 hours')
     RETURNING id`,
    [
      req.userId,
      url,
      parsed.fields.thumbnail || url,
      parsed.file.contentType.startsWith("image/") ? "image" : "video",
    ],
  );
  res.status(201).json({ id: inserted.rows[0].id, mediaUrl: url });
}
