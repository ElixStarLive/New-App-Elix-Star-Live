import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import type { EngagementAchievement } from "@shared/contracts";
import EngagementAchievements from "./EngagementAchievements";

const api = vi.hoisted(() => ({
  apiEngagementAchievements: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
const checkUser = vi.hoisted(() => vi.fn(async () => undefined));
const auth = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  checkUser: () => checkUser(),
}));

vi.mock("@/features/engagement/engagementAchievementsApi", () => api);
vi.mock("@/lib/toast", () => ({ showToast: (...args: unknown[]) => toast(...args) }));
vi.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector?: (state: typeof auth) => unknown) => (selector ? selector(auth) : auth);
  useAuthStore.getState = () => auth;
  return { useAuthStore };
});

const row = (patch: Partial<EngagementAchievement> = {}): EngagementAchievement => ({
  id: "first_gift",
  name: "First Gift",
  description: "Send your first gift",
  icon: "🎁",
  goal_count: 1,
  reward_xp: 50,
  reward_promo_coins: 100,
  rarity: "common",
  progress: 0,
  unlocked: false,
  unlocked_at: null,
  claimed: false,
  ...patch,
});

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/engagement/achievements") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}>
        <Routes>
          <Route path="/engagement/achievements" element={<EngagementAchievements />} />
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

describe("PAGE-051 Achievements", () => {
  beforeEach(() => {
    api.apiEngagementAchievements.mockReset();
    toast.mockReset();
    checkUser.mockReset();
    auth.user = { id: "11111111-1111-4111-8111-111111111111" };
    api.apiEngagementAchievements.mockResolvedValue({
      ok: true,
      achievements: [
        row(),
        row({
          id: "mvp_top10",
          name: "Top 10 MVP",
          description: "Reach top 10 on an MVP board",
          icon: "👑",
          reward_xp: 400,
          reward_promo_coins: 750,
          rarity: "epic",
          progress: 1,
          unlocked: true,
          claimed: true,
          unlocked_at: "2026-08-21T12:00:00.000Z",
        }),
      ],
    });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("shows loading without flashing an empty catalog", async () => {
    const hold = new Promise<{ ok: true; achievements: EngagementAchievement[] }>(() => undefined);
    api.apiEngagementAchievements.mockReturnValueOnce(hold);
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("Loading...");
    expect(container.textContent).not.toContain("First Gift");
    expect(container.textContent).not.toContain("No achievements");
    expect(container.textContent).not.toContain("Claim");
  });

  it("renders locked and unlocked cards from server state only", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("First Gift"));
    expect(container.textContent).toContain("Send your first gift");
    expect(container.textContent).toContain("common");
    expect(container.textContent).toContain("0/1 · 50 XP · 100 Promo");
    expect(container.textContent).toContain("Top 10 MVP");
    expect(container.textContent).toContain("epic");
    expect(container.textContent).toContain("1/1 · 400 XP · 750 Promo · Unlocked");
    expect(container.textContent).not.toContain("Claim");
    expect(container.querySelector('[aria-label="First Gift. Locked. Progress 0 of 1."]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Top 10 MVP. Unlocked. Progress 1 of 1."]')).toBeTruthy();
  });

  it("shows an honest error instead of an empty catalog", async () => {
    api.apiEngagementAchievements.mockResolvedValueOnce({
      ok: false,
      error: "Could not load achievements",
      sessionExpired: false,
      disabled: false,
    });
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Could not load achievements"));
    expect(container.textContent).not.toContain("First Gift");
    expect(container.textContent).not.toContain("No achievements");
  });

  it("closes to Engagement Hub on named and hardware back", async () => {
    const view = renderPage({ pathname: "/engagement/achievements", state: { returnTo: "/engagement" } });
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(container!.querySelector('button[aria-label="Close"]')));
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /engagement");
    expect(namedHardwareBackTarget("/engagement/achievements")).toBe("/engagement");
  });
});
