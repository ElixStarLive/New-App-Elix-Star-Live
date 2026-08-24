import { describe, expect, it } from "vitest";
import { assignChallengeRanks } from "./challenge.js";
import { isRisingStarsUuid } from "./hub.js";
import type { RisingStarsEntry } from "../../../shared/contracts/risingStars.js";

const entry = (id: string, votes: number, created: string): RisingStarsEntry => ({
  id,
  challenge_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  creator_user_id: id,
  video_id: null,
  team_id: null,
  status: "active",
  vote_count: votes,
  created_at: created,
  username: "Creator",
  avatar_url: null,
});

describe("PAGE-056 Rising Stars challenge ranks", () => {
  it("assigns official rank from the server vote order only", () => {
    const ranked = assignChallengeRanks([
      entry("11111111-1111-4111-8111-111111111111", 9, "2026-08-01T00:00:00.000Z"),
      entry("22222222-2222-4222-8222-222222222222", 4, "2026-08-01T00:00:00.000Z"),
    ]);
    expect(ranked.map((row) => row.rank)).toEqual([1, 2]);
    expect(ranked[0]?.entry_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(ranked.every((row) => row.rank >= 1)).toBe(true);
  });

  it("rejects non-UUID challenge identities", () => {
    expect(isRisingStarsUuid("week-1")).toBe(false);
    expect(isRisingStarsUuid("")).toBe(false);
    expect(isRisingStarsUuid("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBe(true);
  });
});
