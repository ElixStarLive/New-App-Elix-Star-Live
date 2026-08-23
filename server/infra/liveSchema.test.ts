import { describe, expect, it } from "vitest";
import { liveFeedSelectSql } from "./liveSchema";

describe("live Neon video projection", () => {
  it("exposes persisted live music as sound_id", () => {
    const sql = liveFeedSelectSql(null);
    expect(sql).toMatch(/NULLIF\(v\.music, ''\) AS sound_id/);
    expect(sql).not.toMatch(/NULL::text AS sound_id/);
    expect(sql).toMatch(/\bv\.music\b/);
  });
});
