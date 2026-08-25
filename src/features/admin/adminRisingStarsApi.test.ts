import { describe, expect, it } from "vitest";
import {
  parseAdminRisingStarsAudit,
  parseAdminRisingStarsChallenges,
  parseAdminRisingStarsSeasons,
} from "./adminApi";

const season = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  slug: "uk-rising-music",
  title: "UK Rising",
  description: null,
  startsAt: "2026-08-01T00:00:00.000Z",
  endsAt: "2026-09-01T00:00:00.000Z",
  status: "draft",
  createdBy: "admin-1",
  createdAt: "2026-08-22T00:00:00.000Z",
};

const challenge = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  seasonId: season.id,
  categoryId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  regionId: null,
  weekIndex: 1,
  title: "Week 1",
  description: null,
  soundTrackId: "epidemic-1",
  opensAt: "2026-08-01T00:00:00.000Z",
  closesAt: "2026-08-08T00:00:00.000Z",
  status: "scheduled",
  leaderboardFrozen: false,
};

const audit = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  action: "create_season",
  entityType: "season",
  entityId: season.id,
  createdAt: "2026-08-22T00:00:00.000Z",
};

describe("PAGE-077 admin Rising Stars parse", () => {
  it("accepts sanitized seasons, challenges, and audit and rejects secrets", () => {
    expect(parseAdminRisingStarsSeasons({ seasons: [season] })).toEqual([season]);
    expect(parseAdminRisingStarsSeasons({ seasons: [] })).toEqual([]);
    expect(parseAdminRisingStarsSeasons({ rows: [season] })).toBeNull();
    expect(parseAdminRisingStarsSeasons({ seasons: [{ ...season, client_secret: "sk_live" }] })).toBeNull();
    expect(parseAdminRisingStarsChallenges({ challenges: [challenge] })).toEqual([challenge]);
    expect(parseAdminRisingStarsChallenges({ challenges: [{ ...challenge, weekIndex: 1.5 }] })).toBeNull();
    expect(parseAdminRisingStarsAudit({ audit: [audit] })).toEqual([audit]);
    expect(parseAdminRisingStarsAudit({ audit: [{ ...audit, details: { secret: "x" } }] })).toBeNull();
    expect(parseAdminRisingStarsAudit({ rows: [audit] })).toBeNull();
  });
});
