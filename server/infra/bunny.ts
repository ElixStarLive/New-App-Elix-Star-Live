import { env } from "./env.js";
import { AppError } from "../middleware/errors.js";

export async function bunnyUpload(path: string, body: Buffer, contentType: string): Promise<string> {
  const zone = env().BUNNY_STORAGE_ZONE;
  const key = env().BUNNY_STORAGE_API_KEY;
  const cdn = env().BUNNY_CDN_HOSTNAME;
  if (!zone || !key || !cdn) {
    throw new AppError("unavailable", "Media storage is not configured", 503);
  }
  const response = await fetch(`https://storage.bunnycdn.com/${zone}/${path}`, {
    method: "PUT",
    headers: {
      AccessKey: key,
      "Content-Type": contentType,
    },
    body,
  });
  if (!response.ok) {
    throw new AppError("unavailable", "Upload failed", 502);
  }
  return `https://${cdn}/${path}`;
}
