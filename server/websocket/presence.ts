import { env } from "../infra/env.js";
import { requireValkey } from "../infra/valkey.js";
import { AppError } from "../middleware/errors.js";

function requireRealtime(): void {
  if (!env().valkeyUrl) {
    throw new AppError("unavailable", "Live state is unavailable", 503);
  }
}

export async function addViewer(roomId: string, connectionId: string): Promise<void> {
  requireRealtime();
  const key = `viewers:${roomId}`;
  await requireValkey().sadd(key, connectionId);
  await requireValkey().expire(key, 8 * 60 * 60);
}

export async function removeViewer(roomId: string, connectionId: string): Promise<void> {
  if (!env().valkeyUrl) return;
  await requireValkey().srem(`viewers:${roomId}`, connectionId);
}

export async function viewerCount(roomId: string): Promise<number> {
  if (!env().valkeyUrl) return 0;
  return requireValkey().scard(`viewers:${roomId}`);
}
