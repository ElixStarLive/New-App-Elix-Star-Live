import { env } from "../../infra/env.js";
import { valkeyDel, valkeyGet, valkeySadd, valkeyScard, valkeySet, valkeySrem } from "../../infra/valkey.js";

export const HOST_GRACE_MS = 20_000;
export const HOST_STARTING_MS = 60_000;
export const HOST_CONNECTED_MS = 8 * 60 * 60 * 1000;

export type HostPresence = "starting" | "connected" | "grace";

export function hostPresenceKey(roomId: string): string {
  return `live:host:${roomId}`;
}

export function hostConnKey(roomId: string): string {
  return `live:host:conns:${roomId}`;
}

function hasValkey(): boolean {
  return Boolean(env().valkeyUrl);
}

export async function markHostStarting(roomId: string): Promise<void> {
  if (!hasValkey()) return;
  await valkeySet(hostPresenceKey(roomId), "starting", HOST_STARTING_MS);
}

export async function markHostConnected(roomId: string): Promise<void> {
  if (!hasValkey()) return;
  await valkeySet(hostPresenceKey(roomId), "connected", HOST_CONNECTED_MS);
}

export async function markHostGrace(roomId: string): Promise<void> {
  if (!hasValkey()) return;
  const current = await valkeyGet(hostPresenceKey(roomId));
  if (!current) return;
  await valkeySet(hostPresenceKey(roomId), "grace", HOST_GRACE_MS);
}

export async function addHostConnection(roomId: string, connectionId: string): Promise<void> {
  if (!hasValkey()) return;
  await valkeySadd(hostConnKey(roomId), connectionId, HOST_CONNECTED_MS);
  await markHostConnected(roomId);
}

export async function removeHostConnection(roomId: string, connectionId: string): Promise<void> {
  if (!hasValkey()) return;
  await valkeySrem(hostConnKey(roomId), connectionId);
  const left = await valkeyScard(hostConnKey(roomId));
  if (left === 0) await markHostGrace(roomId);
}

export async function clearHostPresence(roomId: string): Promise<void> {
  if (!hasValkey()) return;
  await valkeyDel(hostPresenceKey(roomId));
  await valkeyDel(hostConnKey(roomId));
}

export async function getHostPresence(roomId: string): Promise<HostPresence | null> {
  if (!hasValkey()) return null;
  const value = await valkeyGet(hostPresenceKey(roomId));
  if (value === "starting" || value === "connected" || value === "grace") return value;
  return null;
}
