import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import type { CreatorBalance, CreatorPayoutAccount } from "@shared/contracts";
import CreatorPayout, { PAYOUT_HOME } from "./CreatorPayout";

const api = vi.hoisted(() => ({
  apiCreatorPayoutSnapshot: vi.fn(),
  apiCreatorSavePayoutMethod: vi.fn(),
  apiCreatorWithdrawGbp: vi.fn(),
  apiCreatorOnboard: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
const checkUser = vi.hoisted(() => vi.fn(async () => undefined));
const openStripe = vi.hoisted(() => vi.fn(async () => undefined));
const auth = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  checkUser: () => checkUser(),
}));

vi.mock("@/features/creator/creatorPayoutApi", () => api);
vi.mock("@/lib/toast", () => ({ showToast: toast }));
vi.mock("@/lib/platform", () => ({
  platform: { isNative: false },
  openStripeHostedUrl: openStripe,
}));
vi.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector?: (state: typeof auth) => unknown) => (selector ? selector(auth) : auth);
  useAuthStore.getState = () => auth;
  return { useAuthStore };
});

const balance = (available = 5000): CreatorBalance => ({
  pending_coins: 0,
  available_coins: 0,
  locked_coins: 0,
  total_earned: 0,
  total_withdrawn: 0,
  gbp: {
    pending_pence: 250,
    available_pence: available,
    withdrawn_pence: 0,
    reversed_pence: 0,
    held_pence: 100,
  },
  rewards: {
    qualified_views_30d: 0,
    current_reward_pence: 0,
    next_milestone_views: null,
    next_milestone_reward_pence: null,
  },
  earnings_by_source: {
    gifts_pence: 0,
    subscriptions_pence: 0,
    rewards_pence: 0,
    reversals_pence: 0,
  },
  active_subscribers: 0,
});

const account = (ready = false): CreatorPayoutAccount => ({
  ok: true,
  accountId: ready ? "acct_ready" : null,
  payouts_enabled: ready,
  charges_enabled: ready,
  verificationStatus: ready ? "verified" : "none",
  status: ready ? "ready" : "absent",
});

function snapshot(available = 5000) {
  return {
    ok: true as const,
    balance: balance(available),
    methods: [{ id: "m1", type: "bank", is_default: true }],
    withdrawals: [
      {
        id: "w1",
        amount_pence: 1000,
        status: "pending",
        created_at: "2026-08-21T00:00:00.000Z",
      },
    ],
    ledger: [
      {
        id: "l1",
        revenue_source: "gift_creator_pending",
        creator_amount_pence: 60,
        status: "posted",
      },
    ],
    account: account(false),
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderPayout(entry: string | { pathname: string; search?: string; state?: unknown } = PAYOUT_HOME) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const initial =
    typeof entry === "string"
      ? entry
      : {
          pathname: entry.pathname,
          search: entry.search,
          state: entry.state,
        };
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/settings/payout" element={<CreatorPayout />} />
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

describe("PAGE-045 Creator Payout", () => {
  beforeEach(() => {
    api.apiCreatorPayoutSnapshot.mockReset();
    api.apiCreatorSavePayoutMethod.mockReset();
    api.apiCreatorWithdrawGbp.mockReset();
    api.apiCreatorOnboard.mockReset();
    toast.mockReset();
    checkUser.mockReset();
    openStripe.mockReset();
    auth.user = { id: "11111111-1111-4111-8111-111111111111" };
    api.apiCreatorPayoutSnapshot.mockResolvedValue(snapshot());
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("uses the Settings option sheet and exact payout chrome", async () => {
    const view = renderPayout();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("GBP available"));
    expect(container.querySelector(".elix-sheet-host")).toBeTruthy();
    expect(container.querySelector("h1")?.textContent).toBe("Creator Payout");
    expect(container.querySelector('button[aria-label="Close"]')).toBeTruthy();
    expect(container.textContent).toContain("Creator earnings (GBP)");
    expect(container.textContent).toContain("GBP available");
    expect(container.textContent).toContain("GBP pending");
    expect(container.textContent).toContain("GBP reversed / held");
    expect(container.textContent).toContain("£50.00");
    expect(container.textContent).toContain("£2.50");
    expect(container.textContent).toContain("£1.00");
    expect(container.textContent).toContain("Set up Stripe Connect");
    expect(container.textContent).toContain("Request GBP withdrawal");
    expect(container.textContent).toContain("Pending");
    expect(container.textContent).toContain("Status: Pending → Approved → Processing → Paid.");
    expect(container.textContent).toContain("gift_creator_pending");
  });

  it("shows a spinner while loading and never treats that as £0", async () => {
    let resolveLoad: ((value: ReturnType<typeof snapshot>) => void) | undefined;
    api.apiCreatorPayoutSnapshot.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const view = renderPayout();
    root = view.root;
    container = view.container;
    expect(container.querySelector(".elix-loader")).toBeTruthy();
    expect(container.textContent).not.toContain("GBP available");
    expect(container.textContent).not.toContain("£0.00");
    await act(async () => {
      resolveLoad?.(snapshot(0));
    });
    await waitUntil(() => (container!.textContent || "").includes("GBP available"));
    expect(container.textContent).toContain("£0.00");
    expect(container.querySelector(".elix-loader")).toBeNull();
  });

  it("shows an honest error instead of £0 when balance fails", async () => {
    api.apiCreatorPayoutSnapshot.mockResolvedValue({
      ok: false,
      error: "DATABASE_UNAVAILABLE",
      sessionExpired: false,
    });
    const view = renderPayout();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("DATABASE_UNAVAILABLE"));
    expect(container.textContent).not.toContain("GBP available");
    expect(container.textContent).not.toContain("£0.00");
  });

  it("hides ledger and withdrawal history when the server returns empty lists", async () => {
    api.apiCreatorPayoutSnapshot.mockResolvedValue({
      ...snapshot(0),
      withdrawals: [],
      ledger: [],
    });
    const view = renderPayout();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("GBP available"));
    expect(container.textContent).not.toContain("GBP withdrawal history");
    expect(container.textContent).not.toContain("Ledger history");
  });

  it("locks duplicate withdraw taps and keeps the status pending", async () => {
    const view = renderPayout();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Request GBP withdrawal"));
    const hold = new Promise<{ ok: true; status: string; already_exists: boolean }>(() => undefined);
    api.apiCreatorWithdrawGbp.mockReturnValue(hold);
    const amount = [...container.querySelectorAll("input")].find(
      (input) => input.placeholder === "Amount in GBP (e.g. 10.00)",
    ) as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(amount, "10.00");
      amount.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const button = [...container.querySelectorAll("button")].find((item) =>
      (item.textContent || "").includes("Request GBP withdrawal"),
    ) as HTMLButtonElement;
    act(() => {
      button.click();
      button.click();
      button.click();
    });
    await waitUntil(() => api.apiCreatorWithdrawGbp.mock.calls.length === 1);
    expect(api.apiCreatorWithdrawGbp).toHaveBeenCalledWith({
      amount_pence: 1000,
      idempotency_key: expect.any(String),
    });
  });

  it("closes to Settings on named back, hardware back, and a cold deep link", async () => {
    const view = renderPayout();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(container!.querySelector('button[aria-label="Close"]')));
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget(PAYOUT_HOME)).toBe("/settings");
    expect(namedHardwareBackTarget(PAYOUT_HOME, { returnTo: "/settings" })).toBe("/settings");
  });

  it("does not treat a Stripe return URL as payouts_enabled", async () => {
    const view = renderPayout({ pathname: PAYOUT_HOME, search: "?payout_return=1" });
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Status: absent"));
    expect(container.textContent).toContain("Set up Stripe Connect");
    expect(container.textContent).not.toContain("Stripe Connect ready");
  });
});
