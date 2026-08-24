import { describe, expect, it } from "vitest";
import { watchLiveProfilePath, watchSessionPathFromOverlay } from "./liveProfileNav";

describe("live profile overlay paths", () => {
  it("keeps roomId and userId separate with no fallback identity", () => {
    expect(watchLiveProfilePath("room-a", "user-b")).toBe("/watch/room-a/profile/user-b");
    expect(watchLiveProfilePath("", "user-b")).toBeNull();
    expect(watchLiveProfilePath("room-a", "")).toBeNull();
    expect(watchSessionPathFromOverlay("/watch/room-a/profile/user-b", "?x=1")).toBe("/watch/room-a?x=1");
    expect(watchSessionPathFromOverlay("/watch/room-a")).toBeNull();
    expect(watchSessionPathFromOverlay("/profile/user-b")).toBeNull();
  });
});
