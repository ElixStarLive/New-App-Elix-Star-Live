import { describe, expect, it } from "vitest";
import { assignSeat, emptyCohostState, MAX_COHOST_SLOTS, releaseSeat, setBigScreen } from "./state.js";

const host = "host-1";

function fill(n: number) {
  let state = emptyCohostState("s1", host);
  for (let i = 0; i < n; i += 1) {
    state = assignSeat(state, {
      userId: `u${i}`,
      displayName: `U${i}`,
      avatarUrl: null,
      status: "live",
    });
  }
  return state;
}

describe("cohost seats", () => {
  it("caps at eight seats", () => {
    const full = fill(MAX_COHOST_SLOTS);
    expect(full.seats).toHaveLength(8);
    expect(() =>
      assignSeat(full, { userId: "extra", displayName: "x", avatarUrl: null, status: "live" }),
    ).toThrow("seats_full");
  });

  it("releases a seat and keeps other spectators eligible", () => {
    const next = releaseSeat(fill(2), "u0");
    expect(next.seats.map((s) => s.userId)).toEqual(["u1"]);
  });

  it("allows the host to put a co-host on the big screen", () => {
    const next = setBigScreen(fill(1), "u0");
    expect(next.bigScreenUserId).toBe("u0");
  });
});
