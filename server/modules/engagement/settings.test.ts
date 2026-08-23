import { afterEach, describe, expect, it } from "vitest";
import {
  dailyPolicyAllowsClaim,
  getEngagementFlagsFromEnv,
  mergeEngagementFlags,
  parseBattleEnergyCaps,
  parseDailyRewardPolicy,
} from "./settings.js";
import { isEngagementHubEnabled } from "./flags.js";

describe("PAGE-078 engagement settings", () => {
  const previousHub = process.env.ENGAGEMENT_HUB_ENABLED;
  const previousVite = process.env.VITE_ENGAGEMENT_HUB_ENABLED;

  afterEach(() => {
    if (previousHub == null) delete process.env.ENGAGEMENT_HUB_ENABLED;
    else process.env.ENGAGEMENT_HUB_ENABLED = previousHub;
    if (previousVite == null) delete process.env.VITE_ENGAGEMENT_HUB_ENABLED;
    else process.env.VITE_ENGAGEMENT_HUB_ENABLED = previousVite;
  });

  it("cannot enable the hub from an admin override when env is fail-closed", () => {
    delete process.env.ENGAGEMENT_HUB_ENABLED;
    delete process.env.VITE_ENGAGEMENT_HUB_ENABLED;
    expect(isEngagementHubEnabled()).toBe(false);
    const env = getEngagementFlagsFromEnv();
    expect(env.engagementHubEnabled).toBe(false);
    expect(mergeEngagementFlags(env, { engagementHubEnabled: true }).engagementHubEnabled).toBe(false);
  });

  it("lets an admin disable the hub only after env has enabled it", () => {
    process.env.ENGAGEMENT_HUB_ENABLED = "true";
    const env = getEngagementFlagsFromEnv();
    expect(env.engagementHubEnabled).toBe(true);
    expect(mergeEngagementFlags(env, {}).engagementHubEnabled).toBe(true);
    expect(mergeEngagementFlags(env, { engagementHubEnabled: false }).engagementHubEnabled).toBe(false);
  });

  it("parses the exact daily policy and battle-energy cap contracts", () => {
    expect(parseDailyRewardPolicy({ streak_reset_policy: "never", active: false })).toEqual({
      streak_reset_policy: "never",
      effective_start: null,
      effective_end: null,
      active: false,
    });
    expect(dailyPolicyAllowsClaim({ streak_reset_policy: "miss_one_day", effective_start: null, effective_end: null, active: false })).toBe(
      false,
    );
    const caps = parseBattleEnergyCaps({
      watch_amount: 5,
      comment_amount: 2,
      share_amount: 20,
      watch_cap: 300,
      comment_cap: 20,
      share_cap: 1,
      storage_cap: 10000,
      session_cap: 500,
      daily_cap: 2000,
      minimum_boost: 1,
      allowed_boost_values: [1, 2, 5, 10],
      fan_energy_threshold: 10000,
      score_multiplier: 1.2,
      boost_duration_sec: 5,
      enabled: true,
    });
    expect(caps.watch_cap).toBe(300);
    expect(caps.score_multiplier).toBe(1.2);
    expect(caps.enabled).toBe(true);
  });
});
