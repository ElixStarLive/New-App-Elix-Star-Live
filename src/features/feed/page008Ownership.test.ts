import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const overlay = readFileSync(resolve(process.cwd(), "src/components/StemFeedOverlay.tsx"), "utf8");
const feedApi = readFileSync(resolve(process.cwd(), "src/features/feed/feedApi.ts"), "utf8");
const profileRouter = readFileSync(resolve(process.cwd(), "server/modules/profile/router.ts"), "utf8");
const stemPage = readFileSync(resolve(process.cwd(), "src/pages/StemFeed.tsx"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/feed/query.ts"), "utf8");
const stemHook = readFileSync(resolve(process.cwd(), "src/features/feed/useStemFeed.ts"), "utf8");

describe("PAGE-008 STEM ownership", () => {
  it("uses server STEM ranking and shared ForYouPlayer without live cards", () => {
    expect(stemPage).toMatch(/apiFetchStemFeed|useStemFeed|ForYouPlayer/);
    expect(stemHook).toMatch(/viewerId/);
    expect(stemPage).not.toMatch(/ForYouLiveCard/);
    expect(query).toMatch(/queryStemPage|queryStemRanked/);
    expect(query).toMatch(/STEM_MAX|STEM_TOP_TRENDING|STEM_EXTRA_SLOTS/);
  });

  it("restores suggested-user circles via GET /api/profiles", () => {
    expect(profileRouter).toMatch(/router\.get\("\/"/);
    expect(feedApi).toMatch(/export async function apiFetchProfiles/);
    expect(overlay).toMatch(/apiFetchProfiles/);
    expect(overlay).toMatch(/suggestedUsers/);
    expect(overlay).toMatch(/\/watch\//);
    expect(overlay).toMatch(/\/profile\//);
  });
});
