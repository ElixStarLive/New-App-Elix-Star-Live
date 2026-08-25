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
    expect(() => parseXpConfigPatch({ source: "daily_activity", xpAmount: 10, enabled: true, extra: 1 })).toThrow(
      AppError,
    );
    expect(() => parseXpConfigPatch({ source: "daily_activity", xpAmount: -1, enabled: true })).toThrow(AppError);
    expect(parseXpConfigPatch({ source: "daily_activity", xpAmount: 10, enabled: false, description: "Eligible daily activity" })).toEqual({
      source: "daily_activity",
      xpAmount: 10,
      enabled: false,
    });
  });

  it("rejects non-monotonic-capable and unknown level fields", () => {
    expect(() => parseLevelPatch({ level: 2, totalXpRequired: 0, title: "X" })).toThrow(AppError);
    expect(() => parseLevelPatch({ level: 2, totalXpRequired: 10, unknown: true })).toThrow(AppError);
    expect(parseLevelPatch({ level: 2, totalXpRequired: 400, title: "Active Fan", badgeCode: "active_fan" })).toEqual({
      level: 2,
      totalXpRequired: 400,
      title: "Active Fan",
      badgeCode: "active_fan",
    });
  });

  it("requires a non-zero integer adjustment, reason, and idempotency key", () => {
    expect(() =>
      parseAdjustment({
        userId: "11111111-1111-4111-8111-111111111111",
        amountDelta: 0,
        reason: "qa restore",
        idempotencyKey: "idem-key-1",
      }),
    ).toThrow(AppError);
    expect(() =>
      parseAdjustment({
        userId: "11111111-1111-4111-8111-111111111111",
        amountDelta: 5,
        reason: "ab",
        idempotencyKey: "idem-key-1",
      }),
    ).toThrow(AppError);
    expect(
      parseAdjustment({
        userId: "11111111-1111-4111-8111-111111111111",
        amountDelta: -12,
        reason: "qa restore",
        idempotencyKey: "idem-key-1",
      }),
    ).toMatchObject({ amountDelta: -12, reason: "qa restore" });
  });

  it("rejects invented mission audiences and unknown mission fields", () => {
    expect(() => parseMissionPatch({ audience: "everyone", goalCount: 3 })).toThrow(AppError);
    expect(() => parseMissionPatch({ goalCount: 3, price: 9 })).toThrow(AppError);
    expect(parseMissionPatch({ goalCount: 3, audience: "viewers_only", enabled: true })).toEqual({
      title: undefined,
      description: undefined,
      goalCount: 3,
      rewardXp: undefined,
      rewardPromoCoins: undefined,
      rewardEnergy: undefined,
      enabled: true,
      sortOrder: undefined,
      audience: "viewers_only",
      startsAt: undefined,
      endsAt: undefined,
    });
  });

  it("requires a 1-7 daily reward with a non-empty label", () => {
    expect(() =>
      parseDailyRewardPatch({ streakDay: 8, rewardXp: 1, rewardPromoCoins: 0, rewardLabel: "x" }),
    ).toThrow(AppError);
    expect(() =>
      parseDailyRewardPatch({ streakDay: 3, rewardXp: 0, rewardPromoCoins: 0, rewardLabel: "" }),
    ).toThrow(AppError);
    expect(
      parseDailyRewardPatch({ streakDay: 3, rewardXp: 0, rewardPromoCoins: 0, rewardLabel: "Gift coupon" }),
    ).toEqual({
      streakDay: 3,
      rewardXp: 0,
      rewardPromoCoins: 0,
      rewardLabel: "Gift coupon",
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
