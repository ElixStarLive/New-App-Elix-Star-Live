import { env } from "../infra/env.js";
import { requireValkey } from "../infra/valkey.js";

const localViewers = new Map<string, Set<string>>();

export async function addViewer(roomId: string, connectionId: string): Promise<void> {
  if (env().valkeyUrl) {
    const key = `viewers:${roomId}`;
    await requireValkey().sadd(key, connectionId);
    await requireValkey().expire(key, 8 * 60 * 60);
    return;
  }
  const set = localViewers.get(roomId) ?? new Set<string>();
  set.add(connectionId);
  localViewers.set(roomId, set);
}

export async function removeViewer(roomId: string, connectionId: string): Promise<void> {
  if (env().valkeyUrl) {
    await requireValkey().srem(`viewers:${roomId}`, connectionId);
    return;
  }
  localViewers.get(roomId)?.delete(connectionId);
}

export async function viewerCount(roomId: string): Promise<number> {
  if (env().valkeyUrl) {
    return requireValkey().scard(`viewers:${roomId}`);
  }
  return localViewers.get(roomId)?.size ?? 0;
}
