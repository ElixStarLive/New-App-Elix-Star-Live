import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const liveSchema = readFileSync(path.join(root, "infra/liveSchema.ts"), "utf8");

describe("NEW liveSchema owner", () => {
  it("has no OLD dual-schema SQL or Live Neon guess paths", () => {
    expect(liveSchema).not.toMatch(/isLiveNeonSchema|detectLiveNeonSchema|setLiveNeonSchema/);
    expect(liveSchema).not.toMatch(/LIVE_AUTH_USER_SELECT|liveFeedSelectSql|LIVE_FEED_VIDEO_SELECT/);
    expect(liveSchema).not.toMatch(/elix_auth_users|elix_wallet_balances|elix_blocked_users/);
    expect(liveSchema).not.toMatch(/JOIN profiles|FROM profiles|following_id/);
  });

  it("keeps only the fail-closed public table probe", () => {
    expect(liveSchema).toContain("export async function publicTableExists");
  });
});

describe("greenfield migrations", () => {
  it("does not ship the OLD Neon converge repair migration", () => {
    expect(
      existsSync(path.join(root, "migrations/20260824190000_converge_legacy_neon_to_canonical.sql")),
    ).toBe(false);
  });

  it("keeps canonicalize_video_relations as a SELECT 1 no-op", () => {
    const sql = readFileSync(
      path.join(root, "migrations/20260824200000_canonicalize_video_relations.sql"),
      "utf8",
    );
    expect(sql).toMatch(/SELECT 1\s*;/);
    expect(sql).not.toMatch(/ALTER TABLE|following_id|elix_auth|elix_wallet|JOIN profiles/);
  });
});
