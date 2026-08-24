import { describe, expect, it } from "vitest";
import {
  ADMIN_RS_BADGE_KINDS,
  ADMIN_RS_CHALLENGE_STATUSES,
  ADMIN_RS_REWARD_KINDS,
  ADMIN_RS_SEASON_STATUSES,
  ADMIN_RS_SNAPSHOT_PHASES,
  assertAdminRisingStarsDateOrder,
  isAdminRisingStarsId,
  parseAdminRisingStarsAdvanceTopN,
  parseAdminRisingStarsAuditLimit,
  parseAdminRisingStarsBadgeKind,
  parseAdminRisingStarsChallengeStatus,
  parseAdminRisingStarsCountryCodes,
  parseAdminRisingStarsFrozen,
  parseAdminRisingStarsGrantStatus,
  parseAdminRisingStarsIsoDate,
  parseAdminRisingStarsPayload,
  parseAdminRisingStarsRewardKind,
  parseAdminRisingStarsSeasonStatus,
  parseAdminRisingStarsSlug,
  parseAdminRisingStarsSnapshotPhase,
} from "./risingStars.js";

describe("PAGE-077 admin Rising Stars contract", () => {
  it("freezes the exact season, challenge, badge, and reward enums", () => {
    expect(ADMIN_RS_SEASON_STATUSES).toEqual(["draft", "active", "closed"]);
    expect(ADMIN_RS_CHALLENGE_STATUSES).toEqual([
      "scheduled",
      "open",
      "voting",
      "qualified",
      "final",
      "closed",
    ]);
    expect(ADMIN_RS_SNAPSHOT_PHASES).toEqual(["qualifier", "final"]);
    expect(ADMIN_RS_BADGE_KINDS).toEqual([
      "participation",
      "top10",
      "finalist",
      "winner",
      "region",
      "team",
      "season",
    ]);
    expect(ADMIN_RS_REWARD_KINDS).toEqual([
      "badge",
      "cosmetic",
      "featured",
      "cash_off_platform",
      "creator_credit_manual",
      "none",
    ]);
    expect(isAdminRisingStarsId("ffffffff-ffff-4fff-8fff-ffffffffffff")).toBe(true);
    expect(isAdminRisingStarsId("not-a-uuid")).toBe(false);
  });

  it("whitelists slugs, dates, statuses, and rejects mass-assignment values", () => {
    expect(parseAdminRisingStarsSlug("uk-rising-music", 2, 80)).toBe("uk-rising-music");
    expect(() => parseAdminRisingStarsSlug("UK", 2, 80)).toThrow(/Invalid slug/);
    expect(() => parseAdminRisingStarsSlug("x'; drop table rs_seasons;--", 2, 80)).toThrow(/Invalid slug/);
    expect(parseAdminRisingStarsSeasonStatus(undefined)).toBe("draft");
    expect(parseAdminRisingStarsSeasonStatus("active")).toBe("active");
    expect(() => parseAdminRisingStarsSeasonStatus("open")).toThrow(/Invalid season status/);
    expect(() => parseAdminRisingStarsSeasonStatus("whatever")).toThrow(/Invalid season status/);
    expect(parseAdminRisingStarsChallengeStatus(undefined, true)).toBe("scheduled");
    expect(parseAdminRisingStarsChallengeStatus("voting", false)).toBe("voting");
    expect(() => parseAdminRisingStarsChallengeStatus("live", false)).toThrow(/Invalid challenge status/);
    const start = parseAdminRisingStarsIsoDate("2026-08-01T00:00:00.000Z", "starts_at");
    const end = parseAdminRisingStarsIsoDate("2026-09-01T00:00:00.000Z", "ends_at");
    expect(start < end).toBe(true);
    expect(() => assertAdminRisingStarsDateOrder(end, start)).toThrow(/start must be before end/);
    expect(() => parseAdminRisingStarsIsoDate("not-a-date", "starts_at")).toThrow(/invalid/);
    expect(parseAdminRisingStarsCountryCodes(["gb", "IE"])).toEqual(["GB", "IE"]);
    expect(() => parseAdminRisingStarsCountryCodes(["United Kingdom"])).toThrow(/Invalid country_codes/);
    expect(parseAdminRisingStarsSnapshotPhase("qualifier")).toBe("qualifier");
    expect(() => parseAdminRisingStarsSnapshotPhase("semi")).toThrow(/Invalid phase/);
    expect(parseAdminRisingStarsAdvanceTopN(10)).toBe(10);
    expect(() => parseAdminRisingStarsAdvanceTopN(-1)).toThrow(/Invalid advanceTopN/);
    expect(parseAdminRisingStarsFrozen(true)).toBe(true);
    expect(() => parseAdminRisingStarsFrozen("true")).toThrow(/frozen required/);
    expect(parseAdminRisingStarsBadgeKind("winner")).toBe("winner");
    expect(() => parseAdminRisingStarsBadgeKind("gold")).toThrow(/Invalid badge kind/);
    expect(parseAdminRisingStarsRewardKind("creator_credit_manual")).toBe("creator_credit_manual");
    expect(() => parseAdminRisingStarsRewardKind("paid_iap")).toThrow(/Invalid reward_kind/);
    expect(parseAdminRisingStarsGrantStatus(undefined)).toBe("pending");
    expect(() => parseAdminRisingStarsGrantStatus("paid")).toThrow(/Invalid grant status/);
    expect(parseAdminRisingStarsPayload({})).toEqual({});
    expect(() => parseAdminRisingStarsPayload({ client_secret: "sk_live" })).toThrow(/Invalid payload/);
    expect(parseAdminRisingStarsAuditLimit("50")).toBe(50);
    expect(parseAdminRisingStarsAuditLimit(500)).toBe(100);
    expect(() => parseAdminRisingStarsAuditLimit("0")).toThrow(/Invalid limit/);
  });
});
