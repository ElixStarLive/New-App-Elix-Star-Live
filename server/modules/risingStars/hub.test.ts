import { describe, expect, it } from "vitest";
import { assignStandingRanks, isRisingStarsUuid } from "./hub.js";

describe("PAGE-055 Rising Stars hub", () => {
  it("accepts only UUID identities", () => {
    expect(isRisingStarsUuid("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBe(true);
    expect(isRisingStarsUuid("season-1")).toBe(false);
    expect(isRisingStarsUuid("")).toBe(false);
  });

  it("assigns official rank from the server vote order and does not invent a client tie-break", () => {
    const ranked = assignStandingRanks([
      {
        creator_user_id: "11111111-1111-4111-8111-111111111111",
        username: "alpha",
        avatar_url: null,
        total_votes: 9,
        entries: 1,
      },
      {
        creator_user_id: "22222222-2222-4222-8222-222222222222",
        username: "beta",
        avatar_url: null,
        total_votes: 4,
        entries: 1,
      },
    ]);
    expect(ranked.map((row) => row.rank)).toEqual([1, 2]);
    expect(ranked[0]?.creator_user_id).toBe("11111111-1111-4111-8111-111111111111");
  });
});
