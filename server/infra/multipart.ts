import type { Request } from "express";
import { AppError } from "../middleware/errors.js";

export async function readRequestBuffer(req: Request, limit = 80 * 1024 * 1024): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buf.length;
    if (size > limit) throw new AppError("validation_error", "File too large", 413);
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

export function parseMultipart(
  buffer: Buffer,
  contentType: string,
): {
  fields: Record<string, string>;
  file: { buffer: Buffer; filename: string; contentType: string } | null;
} {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!match) throw new AppError("validation_error", "Multipart boundary missing", 400);
  const boundary = (match[1] || match[2] || "").trim();
  const sep = Buffer.from(`\r\n--${boundary}`);
  const raw = Buffer.concat([Buffer.from("\r\n"), buffer]);
  const fields: Record<string, string> = {};
  let file: { buffer: Buffer; filename: string; contentType: string } | null = null;
  let offset = 0;
  while (offset < raw.length) {
    const start = raw.indexOf(sep, offset);
    if (start === -1) break;
    const bodyStart = start + sep.length;
    if (raw.subarray(bodyStart, bodyStart + 2).toString("ascii") === "--") break;
    const next = raw.indexOf(sep, bodyStart);
    if (next === -1) break;
    let part = raw.subarray(bodyStart, next);
    if (part.subarray(0, 2).toString("ascii") === "\r\n") part = part.subarray(2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) {
      offset = next;
      continue;
    }
    const header = part.subarray(0, headerEnd).toString("utf8");
    let body = part.subarray(headerEnd + 4);
    if (body.length >= 2 && body.subarray(body.length - 2).toString("ascii") === "\r\n") {
      body = body.subarray(0, body.length - 2);
    }
    const nameMatch = /name="([^"]+)"/i.exec(header);
    const fileMatch = /filename="([^"]*)"/i.exec(header);
    const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(header);
    const name = nameMatch?.[1] ?? "";
    if (fileMatch) {
      file = {
        buffer: Buffer.from(body),
        filename: fileMatch[1] || "upload.bin",
        contentType: typeMatch?.[1]?.trim() || "application/octet-stream",
      };
    } else if (name) {
      fields[name] = body.toString("utf8");
    }
    offset = next;
  }
  return { fields, file };
}
