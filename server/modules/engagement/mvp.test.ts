import { describe, expect, it } from "vitest";
import { engagementMvpResponseSchema } from "../../../shared/contracts/engagement.js";
import { normalizeMvpPeriod } from "./mvp.js";

describe("PAGE-050 MVP contract", () => {
  it("normalizes period to the server-owned today/week/all set", () => {
    expect(normalizeMvpPeriod("today")).toBe("today");
    expect(normalizeMvpPeriod("week")).toBe("week");
    expect(normalizeMvpPeriod("all")).toBe("all");
    expect(normalizeMvpPeriod("month")).toBe("today");
    expect(normalizeMvpPeriod(undefined)).toBe("today");
  });

  it("rejects flattened items and negative points", () => {
    expect(
      engagementMvpResponseSchema.safeParse({
        items: [{ id: "u1", title: "alice", detail: "12 paid gift coins this week" }],
      }).success,
    ).toBe(false);
    expect(
      engagementMvpResponseSchema.safeParse({
        period: "today",
        leaderboard: [{ rank: 1, user_id: "11111111-1111-4111-8111-111111111111", points: 12 }],
        viewer_id: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(true);
    expect(
      engagementMvpResponseSchema.safeParse({
        period: "today",
        leaderboard: [{ rank: 1, user_id: "11111111-1111-4111-8111-111111111111", points: -1 }],
        viewer_id: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(false);
  });
});
