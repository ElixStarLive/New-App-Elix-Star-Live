import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("../../infra/postgres.js", () => ({
  getPool: () => ({ query: queryMock }),
}));
vi.mock("../../infra/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import {
  deleteLiveStartedNotificationsForRoom,
  notifyFollowersLiveStarted,
} from "./liveStarted.js";

const hostId = "11111111-1111-4111-8111-111111111111";
const followerId = "22222222-2222-4222-8222-222222222222";
const roomId = hostId;

describe("PAGE-032 live_started fanout", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("deletes leftover live_started rows for room/host", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await deleteLiveStartedNotificationsForRoom(roomId, hostId);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM notifications"),
      [roomId, hostId],
    );
  });

  it("inserts one live_started row per follower with canonical payload", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // delete leftovers
      .mockResolvedValueOnce({ rows: [{ follower_id: followerId }] })
      .mockResolvedValueOnce({ rows: [] }); // insert
    const n = await notifyFollowersLiveStarted({
      hostId,
      roomId,
      hostLabel: "Maya",
      hostAvatar: "https://cdn.example/a.jpg",
    });
    expect(n).toBe(1);
    const insertCall = queryMock.mock.calls.find((c) => String(c[0]).includes("INSERT INTO notifications"));
    expect(insertCall).toBeTruthy();
    const payload = JSON.parse(String(insertCall![1][1]));
    expect(payload).toMatchObject({
      title: "Maya is live",
      body: "Tap to watch now",
      actionUrl: `/watch/${roomId}`,
      roomId,
      hostUserId: hostId,
      imageUrl: "https://cdn.example/a.jpg",
    });
  });

  it("skips blocked followers via SQL filter (empty result)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const n = await notifyFollowersLiveStarted({
      hostId,
      roomId,
      hostLabel: "Maya",
      hostAvatar: null,
    });
    expect(n).toBe(0);
    expect(queryMock.mock.calls.some((c) => String(c[0]).includes("INSERT INTO notifications"))).toBe(false);
  });
});
