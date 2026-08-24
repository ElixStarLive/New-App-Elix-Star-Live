import { env } from "./env.js";
import { AppError } from "../middleware/errors.js";

export function isBunnyConfigured(): boolean {
  const e = env();
  return Boolean(e.BUNNY_STORAGE_ZONE && e.BUNNY_STORAGE_API_KEY && e.BUNNY_CDN_HOSTNAME);
}

export function assertBunnyConfigured(): void {
  if (!isBunnyConfigured()) {
    throw new AppError("unavailable", "Media storage is not configured", 503);
  }
}

export async function bunnyUpload(path: string, body: Buffer, contentType: string): Promise<string> {
  assertBunnyConfigured();
  const zone = env().BUNNY_STORAGE_ZONE;
  const key = env().BUNNY_STORAGE_API_KEY;
  const cdn = env().BUNNY_CDN_HOSTNAME;
  const response = await fetch(`https://storage.bunnycdn.com/${zone}/${path}`, {
    method: "PUT",
    headers: {
      AccessKey: key as string,
      "Content-Type": contentType,
    },
    body: new Uint8Array(body),
  });
  if (!response.ok) {
    throw new AppError("unavailable", "Upload failed", 502);
  }
  return `https://${cdn}/${path}`;
}

export async function bunnyDelete(objectPath: string): Promise<void> {
  const zone = env().BUNNY_STORAGE_ZONE;
  const key = env().BUNNY_STORAGE_API_KEY;
  if (!zone || !key) return;
  const response = await fetch(`https://storage.bunnycdn.com/${zone}/${objectPath}`, {
    method: "DELETE",
    headers: { AccessKey: key },
  });
  if (!response.ok && response.status !== 404) {
    throw new AppError("unavailable", "Storage delete failed", 502);
  }
}


