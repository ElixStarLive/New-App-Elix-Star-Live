import { randomUUID } from "node:crypto";
import { AppError } from "../../middleware/errors.js";
import { env } from "../../infra/env.js";
import { requireValkey, valkeyDel, valkeyGet, valkeyTrySetNx } from "../../infra/valkey.js";
import { cohostPersistedSchema, emptyCohostState, type CohostRoomState } from "./state.js";

const LOCK_MS = 5_000;

function requireRealtime(): void {
  if (!env().valkeyUrl) {
    throw new AppError("unavailable", "Live state is unavailable", 503);
  }
}

function key(roomId: string): string {
  return `cohost:${roomId}`;
}

function lockKey(roomId: string): string {
  return `cohost:lock:${roomId}`;
}

export async function loadCohost(roomId: string, hostId: string): Promise<CohostRoomState> {
  requireRealtime();
  const raw = await requireValkey().get(key(roomId));
  if (!raw) return emptyCohostState(roomId, hostId);
  return cohostPersistedSchema.parse(JSON.parse(raw));
}

export async function saveCohost(state: CohostRoomState): Promise<void> {
  requireRealtime();
  await requireValkey().set(key(state.roomId), JSON.stringify(state));
}

export async function withCohostLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  requireRealtime();
  const token = randomUUID();
  const locked = await valkeyTrySetNx(lockKey(roomId), token, LOCK_MS);
  if (!locked) {
    throw new AppError("conflict", "Co-host is busy", 409);
  }
  try {
    return await fn();
  } finally {
    const current = await valkeyGet(lockKey(roomId));
    if (current === token) await valkeyDel(lockKey(roomId));
  }
}

export async function isSeatedCohost(roomId: string, hostId: string, userId: string): Promise<boolean> {
  const state = await loadCohost(roomId, hostId);
  return state.seats.some((seat) => seat.userId === userId && seat.status !== "invited");
}
