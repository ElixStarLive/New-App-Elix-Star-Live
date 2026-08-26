import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/Hashtag.tsx"), "utf8");
const feedApi = readFileSync(resolve(process.cwd(), "src/features/feed/feedApi.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/hashtags/router.ts"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/hashtags/query.ts"), "utf8");
const normalize = readFileSync(resolve(process.cwd(), "shared/hashtag.ts"), "utf8");
const forYou = readFileSync(resolve(process.cwd(), "src/components/ForYouPlayer.tsx"), "utf8");
const discover = readFileSync(resolve(process.cwd(), "src/pages/Discover.tsx"), "utf8");

describe("PAGE-013 Hashtag ownership", () => {
  it("keeps one hashtag GET, exact normalize, race-safe loadSeq, Discover exit, video handoff", () => {
    expect(page).toMatch(/apiFetchHashtag/);
    expect(page).toMatch(/loadSeq/);
    expect(page).toMatch(/viewerId/);
    expect(page).toMatch(/No videos found for this hashtag/);
    expect(page).toMatch(/Loading\.\.\./);
    expect(page).toMatch(/DISCOVER_HOME|\/discover/);
    expect(page).toMatch(/\/video\//);
    expect(page).not.toMatch(/elix-page-glass/);
    expect(page).not.toMatch(/apiFetchHashtagVideos|\/api\/videos\?/);
    expect(feedApi).toMatch(/\/api\/hashtags\/\$\{encodeURIComponent/);
    expect(feedApi).not.toMatch(/\/api\/hashtags\/.*\/videos/);
    expect(router).toMatch(/router\.get\("\/:tag"/);
    expect(query).toMatch(/HASHTAG_VIDEO_LIMIT\s*=\s*100|LIMIT 100/);
    expect(query).toMatch(/ORDER BY \(SELECT COUNT\(\*\) FROM video_views/);
    expect(query).toMatch(/viewerBlockSql|blocks/);
    expect(normalize).toMatch(/normalizeHashtag/);
    expect(forYou).toMatch(/\/hashtag\//);
    expect(discover).toMatch(/\/hashtag\//);
  });
});
