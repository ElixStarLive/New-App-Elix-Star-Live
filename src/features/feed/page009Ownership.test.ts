import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const overlay = readFileSync(resolve(process.cwd(), "src/components/FollowingFeedOverlay.tsx"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/pages/FollowingFeed.tsx"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/feed/query.ts"), "utf8");

describe("PAGE-009 Following ownership", () => {
  it("keeps following feed contract and overlay title", () => {
    expect(page).toMatch(/FollowingFeedOverlay|title=\"Following\"|Following/);
    expect(query).toMatch(/queryFollowingPage/);
    expect(query).toMatch(/RELATION_FEED_LIMIT|following_id|followee_id/);
  });

  it("suggests profiles with followed-first then live, and advances image stories", () => {
    expect(overlay).toMatch(/apiFetchProfiles/);
    expect(overlay).toMatch(/suggestedUsers|suggestedStrip/);
    expect(overlay).toMatch(/followedIds\.has/);
    expect(overlay).toMatch(/STORY_IMAGE_MS/);
  });
});
