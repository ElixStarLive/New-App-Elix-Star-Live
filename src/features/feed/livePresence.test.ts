import { describe, expect, it } from "vitest";
import { createLiveSnapshotGate, pruneEndedBefore, reconcileLiveSnapshot } from "./livePresence";

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
