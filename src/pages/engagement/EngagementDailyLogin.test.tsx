import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import type { EngagementDailyLoginState } from "@shared/contracts";
import EngagementDailyLogin from "./EngagementDailyLogin";

const api = vi.hoisted(() => ({
  apiEngagementDailyLogin: vi.fn(),
  apiEngagementDailyLoginClaim: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
const checkUser = vi.hoisted(() => vi.fn(async () => undefined));
const auth = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  checkUser: () => checkUser(),
}));

vi.mock("@/features/engagement/engagementDailyLoginApi", () => api);
vi.mock("@/lib/toast", () => ({ showToast: (...args: unknown[]) => toast(...args) }));
vi.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector?: (state: typeof auth) => unknown) => (selector ? selector(auth) : auth);
  useAuthStore.getState = () => auth;
  return { useAuthStore };
});

const days = [
  { streak_day: 1, reward_xp: 100, reward_promo_coins: 0, reward_label: "100 XP" },
  { streak_day: 2, reward_xp: 200, reward_promo_coins: 0, reward_label: "200 XP" },
  { streak_day: 3, reward_xp: 0, reward_promo_coins: 0, reward_label: "Gift coupon" },
  { streak_day: 4, reward_xp: 0, reward_promo_coins: 500, reward_label: "500 Promotional Coins" },
  { streak_day: 5, reward_xp: 0, reward_promo_coins: 0, reward_label: "Temporary profile frame" },
  { streak_day: 6, reward_xp: 1000, reward_promo_coins: 0, reward_label: "1,000 XP" },
  { streak_day: 7, reward_xp: 500, reward_promo_coins: 1000, reward_label: "Mystery reward" },
];

const daily = (patch: Partial<EngagementDailyLoginState> = {}): EngagementDailyLoginState => ({
  can_claim: true,
  streak_day: 1,
  claimed_today: false,
  next_reward: days[0],
  days,
  ...patch,
});

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/engagement/daily-login") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}>
        <Routes>
          <Route path="/engagement/daily-login" element={<EngagementDailyLogin />} />
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

describe("PAGE-053 Daily Login", () => {
  beforeEach(() => {
    api.apiEngagementDailyLogin.mockReset();
    api.apiEngagementDailyLoginClaim.mockReset();
    toast.mockReset();
    checkUser.mockReset();
    auth.user = { id: "11111111-1111-4111-8111-111111111111" };
    api.apiEngagementDailyLogin.mockResolvedValue({ ok: true, daily: daily() });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("shows loading without an active Claim control", async () => {
    const hold = new Promise<{ ok: true; daily: EngagementDailyLoginState }>(() => undefined);
    api.apiEngagementDailyLogin.mockReturnValueOnce(hold);
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("Loading...");
    expect(container.textContent).not.toContain("Claim today");
    expect(container.textContent).not.toContain("7-day streak");
  });

  it("renders the 7-day card and Claim today when the server says claimable", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Claim today"));
    expect(container.textContent).toContain("Daily Login");
    expect(container.textContent).toContain("7-day streak");
    expect(container.textContent).toContain("Day 1");
    expect(container.textContent).toContain("Next: 100 XP · 100 XP");
    expect(container.textContent).toContain("Rewards are XP, Promotional Coins, or cosmetics only");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.includes("Claim today"))).toBe(
      true,
    );
  });

  it("shows Claimed and no second grant UI after the server marks today claimed", async () => {
    api.apiEngagementDailyLogin.mockResolvedValueOnce({
      ok: true,
      daily: daily({ can_claim: false, claimed_today: true, next_reward: null }),
    });
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Already claimed today"));
    expect(container.textContent).toContain("Claimed");
    expect(container.textContent).not.toContain("Claim today");
    const claim = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Claimed"));
    expect(claim?.disabled).toBe(true);
  });

  it("shows an honest error instead of an unverified Claim", async () => {
    api.apiEngagementDailyLogin.mockResolvedValueOnce({
      ok: false,
      error: "Could not load daily login",
      sessionExpired: false,
      disabled: false,
    });
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Could not load daily login"));
    expect(container.textContent).not.toContain("Claim today");
    expect(container.textContent).not.toContain("7-day streak");
  });

  it("closes to Engagement Hub on named and hardware back", async () => {
    const view = renderPage({ pathname: "/engagement/daily-login", state: { returnTo: "/engagement" } });
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(container!.querySelector('button[aria-label="Close"]')));
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /engagement");
    expect(namedHardwareBackTarget("/engagement/daily-login")).toBe("/engagement");
  });
});
