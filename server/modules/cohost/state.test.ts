import { describe, expect, it } from "vitest";
import {
  assignSeat,
  emptyCohostState,
  markSeatLive,
  MAX_COHOST_SLOTS,
  releaseSeat,
  requireCohostTarget,
  setBigScreen,
} from "./state.js";

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

  it("requires an explicit accept/invite target", () => {
    expect(() => requireCohostTarget("")).toThrow("cohost_target_required");
    expect(requireCohostTarget("user-a")).toBe("user-a");
  });

  it("accepts only the invited user into a live seat", () => {
    const invited = assignSeat(emptyCohostState("s1", host), {
      userId: "user-a",
      displayName: "A",
      avatarUrl: null,
      status: "invited",
    });
    const live = markSeatLive(invited, "user-a");
    expect(live.seats).toHaveLength(1);
    expect(live.seats[0]?.userId).toBe("user-a");
    expect(live.seats[0]?.status).toBe("live");
    expect(() => markSeatLive(invited, "user-b")).toThrow("not_invited");
  });
});
