import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import type { EngagementMission } from "@shared/contracts";
import EngagementMissions from "./EngagementMissions";

const api = vi.hoisted(() => ({
  apiEngagementMissions: vi.fn(),
  apiEngagementMissionClaim: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
const checkUser = vi.hoisted(() => vi.fn(async () => undefined));
const auth = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  checkUser: () => checkUser(),
}));

vi.mock("@/features/engagement/engagementMissionsApi", () => api);
vi.mock("@/lib/toast", () => ({ showToast: (...args: unknown[]) => toast(...args) }));
vi.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector?: (state: typeof auth) => unknown) => (selector ? selector(auth) : auth);
  useAuthStore.getState = () => auth;
  return { useAuthStore };
});

const row = (patch: Partial<EngagementMission> = {}): EngagementMission => ({
  id: "daily_like",
  scope: "daily",
  title: "Like 5 videos",
  description: "Like five videos today",
  goal_count: 5,
  reward_xp: 0,
  reward_promo_coins: 10,
  reward_energy: 0,
  metric_key: "like",
  period_key: "2026-08-21",
  progress: 2,
  completed: false,
  claimed: false,
  ...patch,
});

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/engagement/missions") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}>
        <Routes>
          <Route path="/engagement/missions" element={<EngagementMissions />} />
          <Route path="/engagement" element={<LocationProbe />} />
          <Route path="/settings" element={<LocationProbe />} />
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
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error("waitUntil timeout");
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-048 Missions", () => {
  beforeEach(() => {
    api.apiEngagementMissions.mockReset();
    api.apiEngagementMissionClaim.mockReset();
    toast.mockReset();
    checkUser.mockReset();
    auth.user = { id: "11111111-1111-4111-8111-111111111111" };
    api.apiEngagementMissions.mockResolvedValue({ ok: true, missions: [row()] });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("shows loading without an empty catalog, then Daily/Weekly and progress", async () => {
    const hold = new Promise<{ ok: true; missions: EngagementMission[] }>(() => undefined);
    api.apiEngagementMissions.mockReturnValueOnce(hold);
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("Loading...");
    expect(container.textContent).not.toContain("Daily");
    expect(container.textContent).not.toContain("Nothing here yet");
  });

  it("renders partial progress and does not show Claim until complete", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Like 5 videos"));
    expect(container.textContent).toContain("Daily");
    expect(container.textContent).toContain("Weekly");
    expect(container.textContent).toContain("2/5 · 0 XP · 10 Promo");
    expect(container.textContent).not.toContain("Claim");
    expect(container.textContent).not.toContain("Done");
  });

  it("shows Claim for a completed mission and Done after a successful claim", async () => {
    api.apiEngagementMissions
      .mockResolvedValueOnce({ ok: true, missions: [row({ progress: 5, completed: true })] })
      .mockResolvedValueOnce({
        ok: true,
        missions: [row({ progress: 5, completed: true, claimed: true })],
      });
    api.apiEngagementMissionClaim.mockResolvedValueOnce({ ok: true });
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent?.includes("Claim"))));
    act(() => {
      [...container!.querySelectorAll("button")].find((button) => button.textContent?.includes("Claim"))?.click();
    });
    await waitUntil(() => (container!.textContent || "").includes("Done"));
    expect(container.textContent).not.toContain("Claim");
    expect(toast).toHaveBeenCalledWith("Reward claimed");
  });

  it("shows an honest error instead of empty Daily/Weekly", async () => {
    api.apiEngagementMissions.mockResolvedValueOnce({
      ok: false,
      error: "Could not load missions",
      sessionExpired: false,
      disabled: false,
    });
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Could not load missions"));
    expect(container.textContent).not.toContain("Daily");
    expect(container.textContent).not.toContain("Nothing here yet");
  });

  it("shows Daily and Weekly after a successful empty catalog", async () => {
    api.apiEngagementMissions.mockResolvedValueOnce({ ok: true, missions: [] });
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Daily"));
    expect(container.textContent).toContain("Weekly");
    expect(container.textContent).not.toContain("Could not load missions");
    expect(container.textContent).not.toContain("Nothing here yet");
  });

  it("closes to Engagement Hub on named and hardware back", async () => {
    const view = renderPage({ pathname: "/engagement/missions", state: { returnTo: "/engagement" } });
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(container!.querySelector('button[aria-label="Close"]')));
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /engagement");
    expect(namedHardwareBackTarget("/engagement/missions")).toBe("/engagement");
    expect(namedHardwareBackTarget("/engagement/missions", { returnTo: "/engagement" })).toBe("/engagement");
  });
});
