import { env } from "./env.js";
import { AppError } from "../middleware/errors.js";

const testBucket = new Map<string, Buffer>();

function isTestStorage(): boolean {
  return env().NODE_ENV === "test";
}

export function isBunnyConfigured(): boolean {
  if (isTestStorage()) return true;
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
  if (isTestStorage()) {
    testBucket.set(path, Buffer.from(body));
    return `https://cdn.test/${path}`;
  }
  const zone = env().BUNNY_STORAGE_ZONE;
  const key = env().BUNNY_STORAGE_API_KEY;
  const cdn = env().BUNNY_CDN_HOSTNAME;
  const response = await fetch(`https://storage.bunnycdn.com/${zone}/${path}`, {
    method: "PUT",
    headers: {
      AccessKey: key as string,
      "Content-Type": contentType,
    },
    body,
  });
  if (!response.ok) {
    throw new AppError("unavailable", "Upload failed", 502);
  }
  return `https://${cdn}/${path}`;
}

export async function bunnyDelete(objectPath: string): Promise<void> {
  if (isTestStorage()) {
    testBucket.delete(objectPath);
    return;
  }
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

export function bunnyTestObject(path: string): Buffer | undefined {
  return testBucket.get(path);
}

export function clearBunnyTestBucket(): void {
  testBucket.clear();
}
