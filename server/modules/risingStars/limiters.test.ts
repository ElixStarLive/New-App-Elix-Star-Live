import { beforeEach, describe, expect, it, vi } from "vitest";

const incr = vi.fn();
const expire = vi.fn();
const envState = vi.hoisted(() => ({ valkeyUrl: "redis://localhost", isProduction: false }));

vi.mock("../../infra/env.js", () => ({
  env: () => envState,
}));
vi.mock("../../infra/valkey.js", () => ({
  requireValkey: () => ({ incr, expire }),
}));

import {
  assertRisingStarsEnterLimiter,
  assertRisingStarsVoteLimiter,
  assertRisingStarsVoteVelocity,
} from "./limiters.js";

describe("PAGE-056 Rising Stars limiters", () => {
  beforeEach(() => {
    incr.mockReset();
    expire.mockReset();
    envState.valkeyUrl = "redis://localhost";
    envState.isProduction = false;
  });

  it("uses dedicated enter and vote keys and fails closed in production without Valkey", async () => {
    incr.mockResolvedValue(1);
    expire.mockResolvedValue(1);
    await assertRisingStarsEnterLimiter("user-1");
    await assertRisingStarsVoteLimiter("user-1");
    await assertRisingStarsVoteVelocity("user-1");
    expect(incr).toHaveBeenCalledWith("rl:rs_enter:user-1");
    expect(incr).toHaveBeenCalledWith("rl:rs_vote:user-1");
    expect(incr).toHaveBeenCalledWith("fraud:rs_vote:user-1");

    envState.valkeyUrl = "";
    envState.isProduction = true;
    await expect(assertRisingStarsVoteVelocity("user-1")).rejects.toMatchObject({
      code: "unavailable",
      message: "FRAUD_CHECK_UNAVAILABLE",
    });
  });

  it("rate-limits after the configured Rising Stars vote velocity", async () => {
    incr.mockResolvedValue(21);
    await expect(assertRisingStarsVoteLimiter("user-1")).rejects.toMatchObject({
      code: "rate_limited",
      message: "RS_VOTE_RATE_LIMITED",
    });
  });
});
