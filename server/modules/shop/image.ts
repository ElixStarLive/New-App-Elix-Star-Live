import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { bunnyDelete, bunnyUpload } from "../../infra/bunny.js";
import { parseMultipart, readRequestBuffer } from "../../infra/multipart.js";
import { AppError } from "../../middleware/errors.js";
import type { AuthedRequest } from "../../middleware/auth.js";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

function magicOk(buffer: Buffer, contentType: string): boolean {
  if (buffer.length < 12) return false;
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const webp = buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (contentType === "image/jpeg" || contentType === "image/jpg") return jpeg;
  if (contentType === "image/png") return png;
  if (contentType === "image/webp") return webp;
  return false;
}

export async function handleShopImageUpload(req: AuthedRequest, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) throw new AppError("unauthenticated", "Sign in required", 401);
  const contentType = req.headers["content-type"] ?? "";
  const buffer = await readRequestBuffer(req, MAX_BYTES + 64 * 1024);
  const parsed = parseMultipart(buffer, contentType);
  if (!parsed.file) throw new AppError("validation_error", "File required", 400);
  const fileType = (parsed.file.contentType || "").toLowerCase();
  if (!TYPES.has(fileType)) {
    throw new AppError("validation_error", "Invalid file type. Please use JPG, PNG, or WebP.", 400);
  }
  if (parsed.file.buffer.length > MAX_BYTES) {
    throw new AppError("validation_error", "File too large. Please use an image under 5 MB.", 413);
  }
  if (!magicOk(parsed.file.buffer, fileType)) {
    throw new AppError("validation_error", "Invalid image file.", 400);
  }
  const ext = fileType.includes("png") ? ".png" : fileType.includes("webp") ? ".webp" : ".jpg";
  const storagePath = `shop/${userId}/${randomUUID()}${ext}`;
  try {
    const url = await bunnyUpload(storagePath, parsed.file.buffer, parsed.file.contentType);
    res.json({ imageUrl: url });
  } catch (error) {
    await bunnyDelete(storagePath).catch(() => undefined);
    throw error;
  }
}
