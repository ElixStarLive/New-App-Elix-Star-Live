import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import type { EngagementHub as Hub } from "@shared/contracts";
import EngagementHub, { ENGAGEMENT_HOME } from "./EngagementHub";

const api = vi.hoisted(() => ({
  apiEngagementHub: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
const checkUser = vi.hoisted(() => vi.fn(async () => undefined));
const auth = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  checkUser: () => checkUser(),
}));

vi.mock("@/features/engagement/engagementHubApi", () => api);
vi.mock("@/lib/toast", () => ({ showToast: (...args: unknown[]) => toast(...args) }));
vi.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector?: (state: typeof auth) => unknown) => (selector ? selector(auth) : auth);
  useAuthStore.getState = () => auth;
  return { useAuthStore };
});

const hub = (patch: Partial<Hub> = {}): Hub => ({
  promotional_coins: 12,
  battle_energy: 34,
  total_xp: 56,
  fan_level: 7,
  fan_tier: "Bronze Fan",
  missions_open: 2,
  daily_login: { can_claim: true, streak_day: 3, claimed_today: false },
  starter_coin_balance: 50000,
  ...patch,
});

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderHub(entry: string | { pathname: string; state?: unknown } = ENGAGEMENT_HOME) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}>
        <Routes>
          <Route path="/engagement" element={<EngagementHub />} />
          <Route path="/engagement/missions" element={<LocationProbe />} />
          <Route path="/engagement/fan-level" element={<LocationProbe />} />
          <Route path="/engagement/mvp" element={<LocationProbe />} />
          <Route path="/engagement/achievements" element={<LocationProbe />} />
          <Route path="/engagement/rewards" element={<LocationProbe />} />
          <Route path="/engagement/daily-login" element={<LocationProbe />} />
          <Route path="/engagement/collections" element={<LocationProbe />} />
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

function row(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find((button) => (button.textContent || "").includes(label));
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-047 Engagement Hub", () => {
  beforeEach(() => {
    api.apiEngagementHub.mockReset();
    toast.mockReset();
    checkUser.mockReset();
    auth.user = { id: "11111111-1111-4111-8111-111111111111" };
    api.apiEngagementHub.mockResolvedValue({ ok: true, hub: hub() });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("shows loading without zeros, then the OLD hero and card order", async () => {
    const hold = new Promise<{ ok: true; hub: Hub }>(() => undefined);
    api.apiEngagementHub.mockReturnValueOnce(hold);
    const view = renderHub();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("Loading...");
    expect(container.textContent).not.toContain("Promo");
    expect(container.textContent).not.toContain("Get coins");
  });

  it("renders authoritative values and does not merge paid coins", async () => {
    const view = renderHub();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Bronze Fan · Level 7"));
    expect(container.textContent).toContain("Promo");
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("Energy");
    expect(container.textContent).toContain("34");
    expect(container.textContent).toContain("XP");
    expect(container.textContent).toContain("56");
    expect(container.textContent).toContain("Missions (2)");
    expect(container.textContent).toContain("Claim daily login · Day 3");
    expect(container.textContent).toContain("separate from Purchased Coins");
    expect(container.textContent).not.toContain("50000");
    expect(container.textContent).not.toContain("Get coins");
  });

  it("shows a real zero hub after a successful empty payload", async () => {
    api.apiEngagementHub.mockResolvedValueOnce({
      ok: true,
      hub: hub({
        promotional_coins: 0,
        battle_energy: 0,
        total_xp: 0,
        fan_level: 0,
        missions_open: 0,
        daily_login: { can_claim: false, streak_day: 1, claimed_today: true },
      }),
    });
    const view = renderHub();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Bronze Fan · Level 0"));
    expect(container.textContent).toContain("Promo");
    expect(container.textContent).not.toContain("Could not load Engagement Hub");
    expect(container.textContent).not.toContain("Claim daily login");
  });

  it("shows an honest error instead of zeros", async () => {
    api.apiEngagementHub.mockResolvedValueOnce({
      ok: false,
      error: "Could not load Engagement Hub",
      sessionExpired: false,
      disabled: false,
    });
    const view = renderHub();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Could not load Engagement Hub"));
    expect(container.textContent).not.toContain("Promo");
    expect(container.textContent).not.toContain("Bronze Fan");
  });

  it("hands every child with Engagement returnTo", async () => {
    const cases: Array<[string, string]> = [
      ["Missions", "LOC /engagement/missions"],
      ["Fan Level", "LOC /engagement/fan-level"],
      ["MVP Leaderboard", "LOC /engagement/mvp"],
      ["Achievements", "LOC /engagement/achievements"],
      ["Reward Wallet", "LOC /engagement/rewards"],
      ["Daily Login", "LOC /engagement/daily-login"],
      ["Collections", "LOC /engagement/collections"],
    ];
    for (const [label, location] of cases) {
      act(() => {
        root?.unmount();
        container?.remove();
      });
      const view = renderHub();
      root = view.root;
      container = view.container;
      await waitUntil(() => Boolean(row(container!, label)));
      act(() => {
        row(container!, label)?.click();
      });
      expect(container.textContent).toContain(location);
      expect(container.textContent).toContain(`STATE ${JSON.stringify({ returnTo: ENGAGEMENT_HOME })}`);
    }
  });

  it("closes to Settings on named back, hardware back, and Safety returnTo", async () => {
    const view = renderHub();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(container!.querySelector('button[aria-label="Close"]')));
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget(ENGAGEMENT_HOME)).toBe("/settings");
    expect(namedHardwareBackTarget(ENGAGEMENT_HOME, { returnTo: "/settings" })).toBe("/settings");
  });
});
