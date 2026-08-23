import { describe, expect, it } from "vitest";
import { engagementMissionsResponseSchema } from "../../../shared/contracts/engagement.js";
import { missionPeriodKey } from "./period.js";

describe("PAGE-048 missions contract", () => {
  it("rejects a flattened items/wallet payload", () => {
    expect(
      engagementMissionsResponseSchema.safeParse({
        items: [{ id: "daily_like", title: "Like", detail: "1/5", claimable: true }],
      }).success,
    ).toBe(false);
    expect(
      engagementMissionsResponseSchema.safeParse({
        missions: [
          {
            id: "daily_like",
            scope: "daily",
            title: "Like 5 videos",
            description: "Like five videos today",
            goal_count: 5,
            reward_xp: 0,
            reward_promo_coins: 10,
            reward_energy: 0,
            metric_key: "like",
            period_key: missionPeriodKey("daily", new Date("2026-08-21T12:00:00.000Z")),
            progress: 2,
            completed: false,
            claimed: false,
          },
        ],
      }).success,
    ).toBe(true);
  });
});
