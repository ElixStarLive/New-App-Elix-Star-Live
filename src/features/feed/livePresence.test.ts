import { describe, expect, it } from "vitest";
import { createLiveSnapshotGate, liveEndedKeys, liveKey, parseLiveStartedCard, pruneEndedBefore, reconcileLiveSnapshot } from "./livePresence";

describe("PAGE-007 live presence snapshot", () => {
  it("drops rooms the snapshot omitted unless they were discovered after the request", () => {
    const ended = new Map<string, number>();
    const previous = [
      { id: "old", discoveredAt: 10 },
      { id: "fresh", discoveredAt: 50 },
    ];
    const next = reconcileLiveSnapshot({
      snapshot: [{ id: "server", discoveredAt: 40 }],
      previous,
      keyOf: (row) => row.id,
      discoveredAtOf: (row) => row.discoveredAt,
      requestedAt: 40,
      endedAt: ended,
    });
    expect(next.map((row) => row.id)).toEqual(["server", "fresh"]);
  });

  it("rejects snapshot rooms that ended after the request was sent", () => {
    const ended = new Map([["room-a", 80]]);
    const next = reconcileLiveSnapshot({
      snapshot: [{ id: "room-a", discoveredAt: 10 }],
      previous: [],
      keyOf: (row) => row.id,
      discoveredAtOf: (row) => row.discoveredAt,
      requestedAt: 40,
      endedAt: ended,
    });
    expect(next).toEqual([]);
  });

  it("ignores superseded snapshot tickets", () => {
    const gate = createLiveSnapshotGate();
    const first = gate.begin();
    const second = gate.begin();
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
  });

  it("prunes end records the snapshot already accounted for", () => {
    const ended = new Map([
      ["old", 10],
      ["new", 90],
    ]);
    pruneEndedBefore(ended, 40);
    expect(ended.has("old")).toBe(false);
    expect(ended.has("new")).toBe(true);
  });
});

describe("PAGE-017 live identity", () => {
  const card = {
    streamId: "44444444-4444-4444-8444-444444444444",
    roomId: "33333333-3333-4333-8333-333333333333",
    hostId: "33333333-3333-4333-8333-333333333333",
    displayName: "Live Creator",
    username: "livec",
    avatarUrl: null,
    title: "Now",
    viewerCount: 3,
    startedAt: "2026-08-20T00:00:00.000Z",
  };

  it("uses roomId as the only canonical key", () => {
    expect(liveKey(card)).toBe(card.roomId);
    expect(liveKey({ roomId: "  room-a  " })).toBe("room-a");
  });

  it("accepts a full NEW stream_started card and rejects snake_case leftovers", () => {
    expect(parseLiveStartedCard(card, 10)?.roomId).toBe(card.roomId);
    expect(
      parseLiveStartedCard(
        {
          stream_key: card.roomId,
          user_id: card.hostId,
          display_name: "Maya",
        },
        10,
      ),
    ).toBeNull();
  });

  it("matches stream_ended by roomId only", () => {
    expect(liveEndedKeys({ streamId: card.streamId, roomId: card.roomId })).toEqual([card.roomId]);
    expect(liveEndedKeys({ streamId: card.streamId })).toEqual([]);
    expect(liveEndedKeys({ hostId: card.hostId })).toEqual([]);
    expect(liveEndedKeys({ stream_key: card.roomId, room_id: card.roomId })).toEqual([]);
  });
});

describe("PAGE-018 return gates for PAGE-007 and PAGE-017", () => {
  const card = {
    streamId: "44444444-4444-4444-8444-444444444444",
    roomId: "33333333-3333-4333-8333-333333333333",
    hostId: "33333333-3333-4333-8333-333333333333",
    displayName: "Live Creator",
    username: "livec",
    avatarUrl: null,
    title: "LIVE",
    viewerCount: 0,
    startedAt: "2026-08-21T12:00:00.000Z",
  };

  it("shows one live card from REST and ignores a duplicate stream_started for the same roomId", () => {
    const started = parseLiveStartedCard(card, 80);
    expect(started?.roomId).toBe(card.roomId);
    const next = reconcileLiveSnapshot({
      snapshot: [{ ...card, discoveredAt: 40 }],
      previous: started ? [started] : [],
      keyOf: (row) => row.roomId,
      discoveredAtOf: (row) => row.discoveredAt,
      requestedAt: 40,
      endedAt: new Map(),
    });
    expect(next).toHaveLength(1);
    expect(next[0]?.roomId).toBe(card.roomId);
  });

  it("removes the card on stream_ended and stays empty after leave/return snapshot", () => {
    const endedAt = new Map<string, number>();
    for (const key of liveEndedKeys({ roomId: card.roomId })) {
      endedAt.set(key, 90);
    }
    const afterEnd = reconcileLiveSnapshot({
      snapshot: [],
      previous: [{ ...card, discoveredAt: 40 }],
      keyOf: (row) => row.roomId,
      discoveredAtOf: (row) => row.discoveredAt,
      requestedAt: 100,
      endedAt,
    });
    expect(afterEnd).toEqual([]);
    pruneEndedBefore(endedAt, 100);
    const returned = reconcileLiveSnapshot({
      snapshot: [] as Array<typeof card & { discoveredAt: number }>,
      previous: [] as Array<typeof card & { discoveredAt: number }>,
      keyOf: (row) => row.roomId,
      discoveredAtOf: (row) => row.discoveredAt,
      requestedAt: 100,
      endedAt,
    });
    expect(returned).toEqual([]);
  });
});
