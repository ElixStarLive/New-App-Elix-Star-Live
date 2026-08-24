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
  starts_at: "2026-08-01T00:00:00.000Z",
  ends_at: "2026-09-01T00:00:00.000Z",
  status: "draft",
  created_by: "admin-1",
  created_at: "2026-08-22T00:00:00.000Z",
};

const challenge = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  season_id: season.id,
  category_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  region_id: null,
  week_index: 1,
  title: "Week 1",
  description: null,
  sound_track_id: "epidemic-1",
  opens_at: "2026-08-01T00:00:00.000Z",
  closes_at: "2026-08-08T00:00:00.000Z",
  status: "scheduled",
  leaderboard_frozen: false,
};

const audit = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  action: "create_season",
  entity_type: "season",
  entity_id: season.id,
  created_at: "2026-08-22T00:00:00.000Z",
};

describe("PAGE-077 admin Rising Stars parse", () => {
  it("accepts sanitized seasons, challenges, and audit and rejects secrets", () => {
    expect(parseAdminRisingStarsSeasons({ seasons: [season] })).toEqual([season]);
    expect(parseAdminRisingStarsSeasons({ seasons: [] })).toEqual([]);
    expect(parseAdminRisingStarsSeasons({ rows: [season] })).toBeNull();
    expect(parseAdminRisingStarsSeasons({ seasons: [{ ...season, client_secret: "sk_live" }] })).toBeNull();
    expect(parseAdminRisingStarsChallenges({ challenges: [challenge] })).toEqual([challenge]);
    expect(parseAdminRisingStarsChallenges({ challenges: [{ ...challenge, week_index: 1.5 }] })).toBeNull();
    expect(parseAdminRisingStarsAudit({ audit: [audit] })).toEqual([audit]);
    expect(parseAdminRisingStarsAudit({ audit: [{ ...audit, details: { secret: "x" } }] })).toBeNull();
    expect(parseAdminRisingStarsAudit({ rows: [audit] })).toBeNull();
  });
});
