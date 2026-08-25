import { liveStreamCardSchema, type LiveStreamCard } from "@shared/contracts";
import { isRecord } from "@/lib/isRecord";

export type LivePresenceCard<T> = T & { discoveredAt: number };

/** Canonical LiveKit / watch identity. Never fall back to stream UUID or host id. */
export function liveKey(stream: Pick<LiveStreamCard, "roomId">): string {
  return stream.roomId.trim();
}

export function parseLiveStartedCard(data: unknown, discoveredAt: number): (LiveStreamCard & { discoveredAt: number }) | null {
  const parsed = liveStreamCardSchema.safeParse(data);
  if (!parsed.success || !liveKey(parsed.data)) return null;
  const card = parsed.data;
  return {
    ...card,
    startedAt: card.startedAt || new Date(discoveredAt).toISOString(),
    discoveredAt,
  };
}

export function liveEndedKeys(data: unknown): string[] {
  if (!isRecord(data)) return [];
  const roomId = typeof data.roomId === "string" ? data.roomId.trim() : "";
  return roomId ? [roomId] : [];
}

export function createLiveSnapshotGate(): {
  begin: () => number;
  isCurrent: (ticket: number) => boolean;
} {
  let latest = 0;
  return {
    begin: () => ++latest,
    isCurrent: (ticket: number) => ticket === latest,
  };
}

export function pruneEndedBefore(endedAt: Map<string, number>, requestedAt: number): void {
  for (const [key, ended] of endedAt) {
    if (ended < requestedAt) endedAt.delete(key);
  }
}

/** Newest REST snapshot is authoritative. Keep only WS cards discovered after that request. */
export function reconcileLiveSnapshot<T>(args: {
  snapshot: T[];
  previous: T[];
  keyOf: (item: T) => string;
  discoveredAtOf: (item: T) => number;
  requestedAt: number;
  endedAt: ReadonlyMap<string, number>;
}): T[] {
  const accepted = args.snapshot.filter((item) => {
    const key = args.keyOf(item);
    if (!key) return false;
    const ended = args.endedAt.get(key);
    return ended === undefined || ended < args.requestedAt;
  });
  const inSnapshot = new Set(accepted.map(args.keyOf));
  const kept = args.previous.filter((item) => {
    const key = args.keyOf(item);
    if (!key || inSnapshot.has(key)) return false;
    const ended = args.endedAt.get(key);
    if (ended !== undefined && ended >= args.discoveredAtOf(item)) return false;
    return args.discoveredAtOf(item) > args.requestedAt;
  });
  const seen = new Set<string>();
  return [...accepted, ...kept].filter((item) => {
    const key = args.keyOf(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
