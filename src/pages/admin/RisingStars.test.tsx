import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_RISING_STARS_AUDIT,
  ADMIN_RISING_STARS_BACK,
  ADMIN_RISING_STARS_CHALLENGES,
  ADMIN_RISING_STARS_CREATE_SEASON,
  ADMIN_RISING_STARS_EMPTY_CHALLENGES,
  ADMIN_RISING_STARS_ERROR,
  ADMIN_RISING_STARS_LOADING,
  ADMIN_RISING_STARS_OPEN,
  ADMIN_RISING_STARS_SNAPSHOT_QUALIFIER,
  ADMIN_RISING_STARS_TITLE,
} from "@/content/adminRisingStars";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import AdminRisingStars from "./RisingStars";

const authState = vi.hoisted(() => ({
  user: { id: "admin-1", isAdmin: true } as { id: string; isAdmin: boolean } | null,
}));

const risingApi = vi.hoisted(() => ({
  reload: {
    seasons: [
      {
        id: "season-1",
        slug: "uk-rising-music",
        title: "UK Rising",
        description: null,
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: "2026-09-01T00:00:00.000Z",
        status: "draft",
        createdBy: "admin-1",
        createdAt: "2026-08-22T00:00:00.000Z",
      },
    ],
    audit: [
      {
        id: "audit-1",
        action: "create_season",
        entityType: "season",
        entityId: "season-1",
        createdAt: "2026-08-22T00:00:00.000Z",
      },
    ],
    error: null as string | null,
  },
  challenges: {
    challenges: [
      {
        id: "challenge-1",
        seasonId: "season-1",
        categoryId: "cat-1",
        regionId: null,
        weekIndex: 1,
        title: "<script>alert(1)</script>",
        description: null,
        soundTrackId: "epidemic-1",
        opensAt: "2026-08-01T00:00:00.000Z",
        closesAt: "2026-08-08T00:00:00.000Z",
        status: "scheduled",
        leaderboardFrozen: false,
      },
    ],
    error: null as string | null,
  },
  createSeason: { ok: true as boolean, error: null as string | null },
  snapshot: { ok: true as boolean, error: null as string | null },
  status: { ok: true as boolean, error: null as string | null },
  reloadCount: 0,
  challengeCount: 0,
  snapshotCalls: [] as Array<{ id: string; phase: string; advanceTopN: number }>,
  pending: null as Promise<void> | null,
}));

const toast = vi.hoisted(() => vi.fn());

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: Object.assign((selector: (state: typeof authState) => unknown) => selector(authState), {
    getState: () => authState,
  }),
}));

vi.mock("@/features/admin/adminApi", () => ({
  apiAdminRisingStarsReload: async () => {
    risingApi.reloadCount += 1;
    if (risingApi.pending) await risingApi.pending;
    return risingApi.reload;
  },
  apiAdminRisingStarsLoadChallenges: async () => {
    risingApi.challengeCount += 1;
    if (risingApi.pending) await risingApi.pending;
    return risingApi.challenges;
  },
  apiAdminRisingStarsCreateSeason: async () => risingApi.createSeason,
  apiAdminRisingStarsCreateCategory: async () => ({
    ok: true,
    category: { id: "cat-1", seasonId: "season-1", slug: "music", title: "Music" },
  }),
  apiAdminRisingStarsCreateRegion: async () => ({
    ok: true,
    region: { id: "reg-1", seasonId: "season-1", slug: "uk", title: "United Kingdom" },
  }),
  apiAdminRisingStarsCreateChallenge: async () => ({ ok: true }),
  apiAdminRisingStarsSetChallengeStatus: async () => risingApi.status,
  apiAdminRisingStarsSnapshot: async (id: string, phase: "qualifier" | "final", advanceTopN: number) => {
    risingApi.snapshotCalls.push({ id, phase, advanceTopN });
    return risingApi.snapshot;
  },
}));

vi.mock("@/lib/toast", () => ({
  showToast: (message: string) => toast(message),
}));

function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/admin/rising-stars"]}>
        <Routes>
          <Route path="/admin/rising-stars" element={<AdminRisingStars />} />
          <Route path="/admin" element={<div>admin-home</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

async function waitUntil(predicate: () => boolean, timeout = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await act(async () => {
      await Promise.resolve();
    });
  }
  throw new Error("waitUntil timeout");
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-077 Admin Rising Stars", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    authState.user = { id: "admin-1", isAdmin: true };
    risingApi.reload.error = null;
    risingApi.challenges.error = null;
    risingApi.reload.seasons = [
      {
        id: "season-1",
        slug: "uk-rising-music",
        title: "UK Rising",
        description: null,
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: "2026-09-01T00:00:00.000Z",
        status: "draft",
        createdBy: "admin-1",
        createdAt: "2026-08-22T00:00:00.000Z",
      },
    ];
    risingApi.reload.audit = [
      {
        id: "audit-1",
        action: "create_season",
        entityType: "season",
        entityId: "season-1",
        createdAt: "2026-08-22T00:00:00.000Z",
      },
    ];
    risingApi.challenges.challenges = [
      {
        id: "challenge-1",
        seasonId: "season-1",
        categoryId: "cat-1",
        regionId: null,
        weekIndex: 1,
        title: "<script>alert(1)</script>",
        description: null,
        soundTrackId: "epidemic-1",
        opensAt: "2026-08-01T00:00:00.000Z",
        closesAt: "2026-08-08T00:00:00.000Z",
        status: "scheduled",
        leaderboardFrozen: false,
      },
    ];
    risingApi.reloadCount = 0;
    risingApi.challengeCount = 0;
    risingApi.snapshotCalls = [];
    risingApi.pending = null;
    toast.mockClear();
  });

  it("shows loading then the frozen admin sections without treating script titles as HTML", async () => {
    let resolveHold: (() => void) | undefined;
    risingApi.pending = new Promise((resolve) => {
      resolveHold = resolve;
    });
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain(ADMIN_RISING_STARS_LOADING);
    expect(container.textContent).not.toContain(ADMIN_RISING_STARS_EMPTY_CHALLENGES);
    expect(container.textContent).not.toContain(ADMIN_RISING_STARS_CREATE_SEASON);
    resolveHold?.();
    await waitUntil(() => (container?.querySelector("h1")?.textContent || "").includes(ADMIN_RISING_STARS_TITLE));
    expect(container.textContent).toContain(ADMIN_RISING_STARS_CREATE_SEASON);
    expect(container.textContent).toContain(ADMIN_RISING_STARS_CHALLENGES);
    expect(container.textContent).toContain(ADMIN_RISING_STARS_AUDIT);
    expect(container.textContent).toContain(ADMIN_RISING_STARS_OPEN);
    expect(container.textContent).toContain(ADMIN_RISING_STARS_SNAPSHOT_QUALIFIER);
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("create_season season season-1");
    expect(namedHardwareBackTarget("/admin/rising-stars")).toBe("/admin");
    const back = [...container.querySelectorAll("button")].find((button) => button.textContent === ADMIN_RISING_STARS_BACK);
    act(() => {
      back?.click();
    });
    await waitUntil(() => (container?.textContent || "").includes("admin-home"));
  });

  it("does not convert a failed load into an empty season list", async () => {
    risingApi.reload.error = ADMIN_RISING_STARS_ERROR;
    risingApi.reload.seasons = null as never;
    risingApi.reload.audit = null as never;
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container?.textContent || "").includes(ADMIN_RISING_STARS_ERROR));
    expect(container.querySelector("[role='alert']")?.textContent).toContain(ADMIN_RISING_STARS_ERROR);
    expect(container.textContent).not.toContain("UK Rising (draft)");
  });

  it("keeps prior challenges when a later challenge reload fails", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container?.textContent || "").includes("<script>alert(1)</script>"));
    risingApi.challenges = { challenges: null as never, error: ADMIN_RISING_STARS_ERROR };
    const open = [...container.querySelectorAll("button")].find((button) => button.textContent === ADMIN_RISING_STARS_OPEN);
    await act(async () => {
      open?.click();
      await Promise.resolve();
    });
    await waitUntil(() => risingApi.challengeCount >= 2);
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.textContent).not.toContain(ADMIN_RISING_STARS_EMPTY_CHALLENGES);
    expect(toast).toHaveBeenCalled();
  });

  it("renders zero challenges only after a successful empty response", async () => {
    risingApi.challenges.challenges = [];
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container?.textContent || "").includes(ADMIN_RISING_STARS_EMPTY_CHALLENGES));
    expect(container.textContent).toContain(ADMIN_RISING_STARS_EMPTY_CHALLENGES);
    expect(container.textContent).not.toContain(ADMIN_RISING_STARS_OPEN);
  });

  it("renders nothing for a non-admin or missing actor", () => {
    authState.user = { id: "user-b", isAdmin: false };
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).not.toContain(ADMIN_RISING_STARS_TITLE);
    expect(container.textContent).not.toContain(ADMIN_RISING_STARS_CREATE_SEASON);
    expect(container.textContent).not.toContain("create_season");
    act(() => {
      root?.unmount();
    });
    container.remove();
    authState.user = null;
    const loggedOut = renderPage();
    root = loggedOut.root;
    container = loggedOut.container;
    expect(container.textContent).not.toContain(ADMIN_RISING_STARS_TITLE);
    expect(container.textContent).not.toContain(ADMIN_RISING_STARS_CREATE_SEASON);
  });
});
