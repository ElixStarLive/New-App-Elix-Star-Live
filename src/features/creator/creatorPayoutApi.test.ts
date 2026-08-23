import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiCreatorBalance, apiCreatorPayoutSnapshot, isCreatorPayoutSessionFailure } from "./creatorPayoutApi";

const request = vi.hoisted(() => vi.fn());

vi.mock("@/lib/apiClient", () => ({
  apiRequest: (...args: unknown[]) => request(...args),
}));

const balance = {
  pending_coins: 0,
  available_coins: 0,
  locked_coins: 0,
  total_earned: 0,
  total_withdrawn: 0,
  gbp: {
    pending_pence: 0,
    available_pence: 5000,
    withdrawn_pence: 0,
    reversed_pence: 0,
    held_pence: 0,
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
};

describe("PAGE-045 creator payout API", () => {
  beforeEach(() => {
    request.mockReset();
  });

  it("treats only FLOW-028 session codes as expiry", () => {
    expect(isCreatorPayoutSessionFailure(401, "unauthenticated")).toBe(true);
    expect(isCreatorPayoutSessionFailure(401, "session_expired")).toBe(true);
    expect(isCreatorPayoutSessionFailure(401, "forbidden")).toBe(false);
    expect(isCreatorPayoutSessionFailure(503, "unauthenticated")).toBe(false);
  });

  it("does not turn an unreadable balance payload into £0", async () => {
    request.mockResolvedValueOnce({ data: { availablePence: 0 }, error: null });
    const result = await apiCreatorBalance();
    expect(result).toEqual({ ok: false, error: "Failed to load creator balance", sessionExpired: false });
  });

  it("fails the snapshot when balance fails so the page cannot show £0", async () => {
    request
      .mockResolvedValueOnce({ data: null, error: { message: "DATABASE_UNAVAILABLE", status: 503 } })
      .mockResolvedValueOnce({ data: { methods: [] }, error: null })
      .mockResolvedValueOnce({ data: { withdrawals: [] }, error: null })
      .mockResolvedValueOnce({ data: { ledger: [] }, error: null })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          accountId: null,
          payouts_enabled: false,
          charges_enabled: false,
          verificationStatus: "none",
          status: "absent",
        },
        error: null,
      });
    const result = await apiCreatorPayoutSnapshot();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("DATABASE_UNAVAILABLE");
  });

  it("accepts the authoritative balance contract", async () => {
    request.mockResolvedValueOnce({ data: balance, error: null });
    await expect(apiCreatorBalance()).resolves.toEqual({ ok: true, balance });
    expect(request).toHaveBeenCalledWith("/api/creator/balance");
  });
});
