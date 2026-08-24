import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import type { EngagementRewardWallet } from "@shared/contracts";
import EngagementRewards from "./EngagementRewards";

const api = vi.hoisted(() => ({
  apiEngagementRewardWallet: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
const checkUser = vi.hoisted(() => vi.fn(async () => undefined));
const auth = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  checkUser: () => checkUser(),
}));

vi.mock("@/features/engagement/engagementRewardWalletApi", () => api);
vi.mock("@/lib/toast", () => ({ showToast: (...args: unknown[]) => toast(...args) }));
vi.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector?: (state: typeof auth) => unknown) => (selector ? selector(auth) : auth);
  useAuthStore.getState = () => auth;
  return { useAuthStore };
});

const wallet = (patch: Partial<EngagementRewardWallet> = {}): EngagementRewardWallet => ({
  purchasedCoins: 4,
  starterCoins: 50000,
  promotionalCoins: 12,
  totalGiftSpendable: 50016,
  battleEnergy: 3,
  totalXp: 50,
  fanLevel: 0,
  fanTier: "Bronze Fan",
  ...patch,
});

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/engagement/rewards") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}>
        <Routes>
          <Route path="/engagement/rewards" element={<EngagementRewards />} />
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

describe("PAGE-052 Reward Wallet", () => {
  beforeEach(() => {
    api.apiEngagementRewardWallet.mockReset();
    toast.mockReset();
    checkUser.mockReset();
    auth.user = { id: "11111111-1111-4111-8111-111111111111" };
    api.apiEngagementRewardWallet.mockResolvedValue({ ok: true, wallet: wallet() });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("shows loading without flashing zeros", async () => {
    const hold = new Promise<{ ok: true; wallet: EngagementRewardWallet }>(() => undefined);
    api.apiEngagementRewardWallet.mockReturnValueOnce(hold);
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("Loading...");
    expect(container.textContent).not.toContain("Purchased Coins");
    expect(container.textContent).not.toContain("50000");
    expect(container.textContent).not.toContain("Total Balance");
  });

  it("renders unmerged balances and the decorative gift display only", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Purchased Coins"));
    expect(container.textContent).toContain("Available for gifts");
    expect(container.textContent).toContain("50016");
    expect(container.textContent).toContain("Display total only");
    expect(container.textContent).toContain("Purchased Coins");
    expect(container.textContent).toContain("4");
    expect(container.textContent).toContain("Promotional Coins");
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("Starter Coins");
    expect(container.textContent).toContain("50000");
    expect(container.textContent).toContain("Battle Energy");
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("50 XP · Lv 0");
    expect(container.textContent).toContain("Bronze Fan — progression only, not currency.");
    expect(container.textContent).toContain("Test coins stay local");
    expect(container.textContent).not.toContain("Total Balance");
    expect(container.textContent).not.toContain("Claim");
    expect(container.textContent).not.toContain("£");
  });

  it("shows an honest error instead of zeros", async () => {
    api.apiEngagementRewardWallet.mockResolvedValueOnce({
      ok: false,
      error: "Could not load reward wallet",
      sessionExpired: false,
      disabled: false,
    });
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Could not load reward wallet"));
    expect(container.textContent).not.toContain("Purchased Coins");
    expect(container.textContent).not.toContain("Starter Coins");
  });

  it("closes to Engagement Hub on named and hardware back", async () => {
    const view = renderPage({ pathname: "/engagement/rewards", state: { returnTo: "/engagement" } });
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(container!.querySelector('button[aria-label="Close"]')));
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /engagement");
    expect(namedHardwareBackTarget("/engagement/rewards")).toBe("/engagement");
  });
});
