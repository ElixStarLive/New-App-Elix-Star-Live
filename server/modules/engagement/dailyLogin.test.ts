import { describe, expect, it } from "vitest";
import {
  engagementDailyLoginClaimResponseSchema,
  engagementDailyLoginResponseSchema,
} from "../../../shared/contracts/engagement.js";
import { AppError } from "../../middleware/errors.js";
import { nextStreakDay, validateDailyRewardConfig, yesterdayUtcDateKey } from "./dailyLogin.js";
import { utcDateKey } from "./period.js";

const days = [
  { streak_day: 1, reward_xp: 100, reward_promo_coins: 0, reward_label: "100 XP" },
  { streak_day: 2, reward_xp: 200, reward_promo_coins: 0, reward_label: "200 XP" },
  { streak_day: 3, reward_xp: 0, reward_promo_coins: 0, reward_label: "Gift coupon" },
  { streak_day: 4, reward_xp: 0, reward_promo_coins: 500, reward_label: "500 Promotional Coins" },
  { streak_day: 5, reward_xp: 0, reward_promo_coins: 0, reward_label: "Temporary profile frame" },
  { streak_day: 6, reward_xp: 1000, reward_promo_coins: 0, reward_label: "1,000 XP" },
  { streak_day: 7, reward_xp: 500, reward_promo_coins: 1000, reward_label: "Mystery reward" },
];

describe("PAGE-053 daily login contract", () => {
  it("wraps streak after day 7 and restarts after a gap", () => {
    expect(nextStreakDay(0)).toBe(1);
    expect(nextStreakDay(1)).toBe(2);
    expect(nextStreakDay(6)).toBe(7);
    expect(nextStreakDay(7)).toBe(1);
    expect(nextStreakDay(8)).toBe(1);
  });

  it("uses the UTC calendar day as the server day key", () => {
    expect(yesterdayUtcDateKey("2026-08-21")).toBe("2026-08-20");
    expect(utcDateKey(new Date("2026-08-21T23:59:59.000Z"))).toBe("2026-08-21");
    expect(utcDateKey(new Date("2026-08-22T00:00:00.000Z"))).toBe("2026-08-22");
  });

  it("rejects malformed 7-day config instead of granting", () => {
    expect(() => validateDailyRewardConfig(days.slice(0, 6))).toThrow(AppError);
    expect(() =>
      validateDailyRewardConfig([...days, { streak_day: 1, reward_xp: 1, reward_promo_coins: 0, reward_label: "dup" }]),
    ).toThrow(AppError);
    expect(() =>
      validateDailyRewardConfig(days.map((row) => (row.streak_day === 4 ? { ...row, reward_promo_coins: -1 } : row))),
    ).toThrow(AppError);
    expect(() =>
      validateDailyRewardConfig(days.map((row) => (row.streak_day === 3 ? { ...row, reward_label: "  " } : row))),
    ).toThrow(AppError);
    expect(validateDailyRewardConfig([...days].reverse())).toEqual(days);
  });

  it("rejects the stub items payload and accepts the authoritative daily contract", () => {
    expect(
      engagementDailyLoginResponseSchema.safeParse({
        items: [{ id: "daily-login", title: "Claim", claimable: true }],
      }).success,
    ).toBe(false);
    expect(
      engagementDailyLoginResponseSchema.safeParse({
        daily: {
          can_claim: true,
          streak_day: 1,
          claimed_today: false,
          next_reward: days[0],
          days,
        },
      }).success,
    ).toBe(true);
    expect(
      engagementDailyLoginClaimResponseSchema.safeParse({
        ok: true,
        alreadyClaimed: true,
        daily: {
          can_claim: false,
          streak_day: 1,
          claimed_today: true,
          next_reward: null,
          days,
        },
        reward: null,
      }).success,
    ).toBe(true);
  });
});
