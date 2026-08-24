import { describe, expect, it } from "vitest";
import { AppError } from "../../middleware/errors.js";
import {
  parseAdjustment,
  parseDailyRewardPatch,
  parseFeatureFlagPatch,
  parseLevelPatch,
  parseMissionPatch,
  parseXpConfigPatch,
} from "./progression.js";

describe("PAGE-078 admin progression parsers", () => {
  it("rejects mass assignment and invalid XP config", () => {
    expect(() => parseXpConfigPatch({ source: "daily_activity", xp_amount: 10, enabled: true, extra: 1 })).toThrow(
      AppError,
    );
    expect(() => parseXpConfigPatch({ source: "daily_activity", xp_amount: -1, enabled: true })).toThrow(AppError);
    expect(parseXpConfigPatch({ source: "daily_activity", xp_amount: 10, enabled: false, description: "Eligible daily activity" })).toEqual({
      source: "daily_activity",
      xp_amount: 10,
      enabled: false,
    });
  });

  it("rejects non-monotonic-capable and unknown level fields", () => {
    expect(() => parseLevelPatch({ level: 2, total_xp_required: 0, title: "X" })).toThrow(AppError);
    expect(() => parseLevelPatch({ level: 2, total_xp_required: 10, unknown: true })).toThrow(AppError);
    expect(parseLevelPatch({ level: 2, total_xp_required: 400, title: "Active Fan", badge_code: "active_fan" })).toEqual({
      level: 2,
      total_xp_required: 400,
      title: "Active Fan",
      badge_code: "active_fan",
    });
  });

  it("requires a non-zero integer adjustment, reason, and idempotency key", () => {
    expect(() =>
      parseAdjustment({
        user_id: "11111111-1111-4111-8111-111111111111",
        amount_delta: 0,
        reason: "qa restore",
        idempotency_key: "idem-key-1",
      }),
    ).toThrow(AppError);
    expect(() =>
      parseAdjustment({
        user_id: "11111111-1111-4111-8111-111111111111",
        amount_delta: 5,
        reason: "ab",
        idempotency_key: "idem-key-1",
      }),
    ).toThrow(AppError);
    expect(
      parseAdjustment({
        user_id: "11111111-1111-4111-8111-111111111111",
        amount_delta: -12,
        reason: "qa restore",
        idempotency_key: "idem-key-1",
      }),
    ).toMatchObject({ amountDelta: -12, reason: "qa restore" });
  });

  it("rejects invented mission audiences and unknown mission fields", () => {
    expect(() => parseMissionPatch({ audience: "everyone", goal_count: 3 })).toThrow(AppError);
    expect(() => parseMissionPatch({ goal_count: 3, price: 9 })).toThrow(AppError);
    expect(parseMissionPatch({ goal_count: 3, audience: "viewers_only", enabled: true })).toEqual({
      title: undefined,
      description: undefined,
      goal_count: 3,
      reward_xp: undefined,
      reward_promo_coins: undefined,
      reward_energy: undefined,
      enabled: true,
      sort_order: undefined,
      audience: "viewers_only",
      starts_at: undefined,
      ends_at: undefined,
    });
  });

  it("requires a 1-7 daily reward with a non-empty label", () => {
    expect(() =>
      parseDailyRewardPatch({ streak_day: 8, reward_xp: 1, reward_promo_coins: 0, reward_label: "x" }),
    ).toThrow(AppError);
    expect(() =>
      parseDailyRewardPatch({ streak_day: 3, reward_xp: 0, reward_promo_coins: 0, reward_label: "" }),
    ).toThrow(AppError);
    expect(
      parseDailyRewardPatch({ streak_day: 3, reward_xp: 0, reward_promo_coins: 0, reward_label: "Gift coupon" }),
    ).toEqual({
      streak_day: 3,
      reward_xp: 0,
      reward_promo_coins: 0,
      reward_label: "Gift coupon",
    });
  });

  it("requires confirm for high-impact flags and rejects unknown keys", () => {
    expect(() => parseFeatureFlagPatch({ promotionalCoinsEnabled: false })).toThrow(/CONFIRM_REQUIRED/);
    expect(() => parseFeatureFlagPatch({ inventedFlag: true })).toThrow(AppError);
    expect(parseFeatureFlagPatch({ liveQuestsEnabled: true, reason: "qa" })).toEqual({
      flags: { liveQuestsEnabled: true },
      reason: "qa",
      confirm: false,
    });
    expect(parseFeatureFlagPatch({ battleEnergyEnabled: false, confirm: true })).toMatchObject({
      flags: { battleEnergyEnabled: false },
      confirm: true,
    });
  });
});
