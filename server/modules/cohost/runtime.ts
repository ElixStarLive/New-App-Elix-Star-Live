import { env } from "../../infra/env.js";
import { requireValkey } from "../../infra/valkey.js";
import { cohostPersistedSchema, emptyCohostState, type CohostRoomState } from "./state.js";

const localCohost = new Map<string, CohostRoomState>();

function key(roomId: string): string {
  return `cohost:${roomId}`;
}

export async function loadCohost(roomId: string, hostId: string): Promise<CohostRoomState> {
  if (!env().valkeyUrl) return localCohost.get(roomId) ?? emptyCohostState(roomId, hostId);
  const raw = await requireValkey().get(key(roomId));
  if (!raw) return emptyCohostState(roomId, hostId);
  return cohostPersistedSchema.parse(JSON.parse(raw));
}

export async function saveCohost(state: CohostRoomState): Promise<void> {
  if (!env().valkeyUrl) {
    localCohost.set(state.streamId, state);
    return;
  }
  await requireValkey().set(key(state.streamId), JSON.stringify(state));
}

export async function isSeatedCohost(roomId: string, hostId: string, userId: string): Promise<boolean> {
  const state = await loadCohost(roomId, hostId);
  return state.seats.some((seat) => seat.userId === userId && seat.status !== "invited");
}
