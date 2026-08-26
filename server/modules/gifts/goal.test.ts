import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const envState = { valkeyUrl: "" };

const get = vi.fn(async (key: string) => store.get(key) ?? null);
const set = vi.fn(async (key: string, value: string) => {
  store.set(key, value);
  return "OK";
});
const del = vi.fn(async (key: string) => (store.delete(key) ? 1 : 0));

vi.mock("../../infra/env.js", () => ({
  env: () => envState,
}));

vi.mock("../../infra/valkey.js", () => ({
  requireValkey: () => ({ get, set, del }),
}));

import {
  clearGiftGoal,
  getGiftGoal,
  incrementGiftGoal,
  setGiftGoal,
  type StoredGiftGoal,
} from "./goal.js";

function goal(partial: Partial<StoredGiftGoal> = {}): StoredGiftGoal {
  return {
    giftId: "rose",
    giftName: "Rose",
    giftIcon: "🌹",
    targetCount: 10,
    currentCount: 0,
    ...partial,
  };
}

describe.each([
  { label: "in-memory fallback", valkeyUrl: "" },
  { label: "valkey", valkeyUrl: "redis://test" },
])("gift goal store ($label)", ({ valkeyUrl }) => {
  beforeEach(async () => {
    envState.valkeyUrl = valkeyUrl;
    store.clear();
    await clearGiftGoal("room-1");
  });

  it("returns null when no goal is set", async () => {
    expect(await getGiftGoal("room-1")).toBeNull();
  });

  it("round-trips a stored goal", async () => {
    expect(await setGiftGoal("room-1", goal({ currentCount: 3 }))).toEqual(goal({ currentCount: 3 }));
    expect(await getGiftGoal("room-1")).toEqual(goal({ currentCount: 3 }));
  });

  it("clamps the target and the current count", async () => {
    expect(await setGiftGoal("room-1", goal({ targetCount: 0, currentCount: -5 }))).toEqual(
      goal({ targetCount: 1, currentCount: 0 }),
    );
    expect(await setGiftGoal("room-1", goal({ targetCount: 999_999, currentCount: 999_999 }))).toEqual(
      goal({ targetCount: 20_000, currentCount: 20_000 }),
    );
  });

  it("defaults a missing name and icon", async () => {
    const stored = await setGiftGoal("room-1", {
      ...goal(),
      giftName: undefined as unknown as string,
      giftIcon: undefined as unknown as string,
    });
    expect(stored).toMatchObject({ giftName: "Gift", giftIcon: "" });
  });

  it("refuses a goal without a gift id", async () => {
    expect(await setGiftGoal("room-1", goal({ giftId: "  " }))).toBeNull();
    expect(await getGiftGoal("room-1")).toBeNull();
  });

  it("clears a goal", async () => {
    await setGiftGoal("room-1", goal());
    await clearGiftGoal("room-1");
    expect(await getGiftGoal("room-1")).toBeNull();
  });

  it("increments only the matching gift and never past the target", async () => {
    await setGiftGoal("room-1", goal({ targetCount: 3 }));
    expect(await incrementGiftGoal("room-1", "tulip")).toBeNull();
    expect(await incrementGiftGoal("room-1", "rose")).toMatchObject({ currentCount: 1 });
    expect(await incrementGiftGoal("room-1", "rose", 99)).toMatchObject({ currentCount: 3 });
  });

  it("treats a non-positive increment as one", async () => {
    await setGiftGoal("room-1", goal());
    expect(await incrementGiftGoal("room-1", "rose", 0)).toMatchObject({ currentCount: 1 });
    expect(await incrementGiftGoal("room-1", "rose", -4)).toMatchObject({ currentCount: 2 });
  });

  it("does not increment a room without a goal", async () => {
    expect(await incrementGiftGoal("room-1", "rose")).toBeNull();
  });
});

describe("gift goal store (valkey payloads)", () => {
  beforeEach(() => {
    envState.valkeyUrl = "redis://test";
    store.clear();
  });

  it("writes json with a 24h expiry", async () => {
    set.mockClear();
    await setGiftGoal("room-9", goal());
    expect(set).toHaveBeenCalledWith("gift_goal:room-9", JSON.stringify(goal()), "PX", 86_400_000);
  });

  it("returns null for a corrupted payload", async () => {
    store.set("gift_goal:room-9", "{not json");
    expect(await getGiftGoal("room-9")).toBeNull();
  });

  it("returns null for a payload without a gift id", async () => {
    store.set("gift_goal:room-9", JSON.stringify({ targetCount: 5 }));
    expect(await getGiftGoal("room-9")).toBeNull();
  });
});
