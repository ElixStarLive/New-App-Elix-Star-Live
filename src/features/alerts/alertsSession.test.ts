import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertItem } from "@shared/contracts";
import { createAlertsSession } from "./alertsSession";

const api = vi.hoisted(() => ({
  apiListAlerts: vi.fn(),
  apiMarkAlertsRead: vi.fn(),
}));

vi.mock("./alertsApi", () => ({
  apiListAlerts: (...args: unknown[]) => api.apiListAlerts(...args),
  apiMarkAlertsRead: (...args: unknown[]) => api.apiMarkAlertsRead(...args),
}));

const systemRow: AlertItem = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  kind: "system",
  title: "System",
  body: "Hello",
  imageUrl: null,
  actionUrl: null,
  createdAt: "2026-08-21T00:00:00.000Z",
};

const liveRow: AlertItem = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  kind: "live_started",
  title: "Fan is live",
  body: "",
  imageUrl: null,
  actionUrl: "/watch/room-1",
  createdAt: "2026-08-21T00:00:00.000Z",
};

describe("PAGE-032 alerts session", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    api.apiListAlerts.mockResolvedValue({ items: [], total: 0, unreadIds: [], error: null });
    api.apiMarkAlertsRead.mockResolvedValue({ ok: true });
  });

  it("does not let a late A list replace B", async () => {
    let resolveA: (value: { items: AlertItem[]; total: number; unreadIds: string[]; error: null }) => void = () => undefined;
    api.apiListAlerts.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve as (value: { items: AlertItem[]; total: number; unreadIds: string[]; error: null }) => void;
        }),
    );
    api.apiListAlerts.mockResolvedValueOnce({ items: [liveRow], total: 1, unreadIds: [], error: null });
    const session = createAlertsSession();
    const first = session.load("owner-a");
    await session.load("owner-b");
    resolveA({ items: [systemRow], total: 1, unreadIds: [], error: null });
    await first;
    expect(session.getSnapshot().items[0]?.kind).toBe("live_started");
  });

  it("keeps prior rows when the list fails", async () => {
    api.apiListAlerts.mockResolvedValueOnce({ items: [systemRow], total: 1, unreadIds: [], error: null });
    const session = createAlertsSession();
    await session.load("owner");
    api.apiListAlerts.mockResolvedValueOnce({ items: [], total: 0, unreadIds: [], error: "offline" });
    await session.load("owner");
    expect(session.getSnapshot().items).toHaveLength(1);
    expect(session.getSnapshot().error).toBe("offline");
  });

  it("treats a failed empty load as error, not empty success", async () => {
    api.apiListAlerts.mockResolvedValue({ items: [], total: 0, unreadIds: [], error: "offline" });
    const session = createAlertsSession();
    await session.load("owner");
    expect(session.getSnapshot().phase).toBe("error");
    expect(session.getSnapshot().items).toHaveLength(0);
  });

  it("marks listed unread ids after a successful load and keeps rows if mark fails", async () => {
    api.apiListAlerts.mockResolvedValue({ items: [systemRow], total: 1, unreadIds: [systemRow.id], error: null });
    api.apiMarkAlertsRead.mockResolvedValue({ ok: false, error: "forbidden" });
    const session = createAlertsSession();
    await session.load("owner");
    expect(api.apiMarkAlertsRead).toHaveBeenCalledWith([systemRow.id]);
    expect(session.getSnapshot().items).toHaveLength(1);
    expect(session.getSnapshot().markError).toBe("forbidden");
  });

  it("drops a live_started row when that room ends", async () => {
    api.apiListAlerts.mockResolvedValue({ items: [systemRow, liveRow], total: 2, unreadIds: [], error: null });
    const session = createAlertsSession();
    await session.load("owner");
    session.applyStreamEnded("", "room-1");
    expect(session.getSnapshot().items.map((row) => row.kind)).toEqual(["system"]);
  });

  it("clears viewer data on dispose", async () => {
    api.apiListAlerts.mockResolvedValue({ items: [systemRow], total: 1, unreadIds: [], error: null });
    const session = createAlertsSession();
    await session.load("owner-a");
    session.dispose();
    expect(session.getSnapshot().items).toHaveLength(0);
    expect(session.getSnapshot().viewerId).toBe("");
  });
});
