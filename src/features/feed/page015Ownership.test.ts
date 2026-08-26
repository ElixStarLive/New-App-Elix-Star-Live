import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/SavedVideos.tsx"), "utf8");
const feedApi = readFileSync(resolve(process.cwd(), "src/features/feed/feedApi.ts"), "utf8");
const engagementApi = readFileSync(resolve(process.cwd(), "src/features/feed/engagementApi.ts"), "utf8");
const videosQuery = readFileSync(resolve(process.cwd(), "server/modules/videos/query.ts"), "utf8");
const videosRouter = readFileSync(resolve(process.cwd(), "server/modules/videos/router.ts"), "utf8");
const collectionEvents = readFileSync(resolve(process.cwd(), "src/lib/videoCollectionEvents.ts"), "utf8");

describe("PAGE-015 Saved videos ownership", () => {
  it("lists via canonical GET /api/videos/saved/list with Settings exit and video handoff", () => {
    expect(page).toMatch(/apiFetchSavedVideos/);
    expect(page).toMatch(/No saved videos yet\. Tap the bookmark icon on any video to save it\./);
    expect(page).toMatch(/SETTINGS_HOME|\/settings/);
    expect(page).toMatch(/\/video\//);
    expect(page).toMatch(/SAVED_HOME|\/saved/);
    expect(page).toMatch(/viewerId/);
    expect(page).toMatch(/loadSeq/);
    expect(page).toMatch(/subscribeVideoCollection/);
    expect(page).not.toMatch(/elix-page-glass/);
    expect(page).not.toMatch(/localStorage/);
    expect(feedApi).toMatch(/\/api\/videos\/saved\/list/);
    expect(videosRouter).toMatch(/saved\/list/);
    expect(videosRouter).toMatch(/requireAuth/);
  });

  it("orders by save time and filters inaccessible content on the server", () => {
    expect(videosQuery).toMatch(/ORDER BY s\.created_at DESC/);
    expect(videosQuery).toMatch(/deleted_at IS NULL/);
    expect(videosQuery).toMatch(/privacy = 'public' OR v\.user_id = \$1/);
    expect(videosQuery).toMatch(/blocks/);
  });

  it("publishes save/unsave from the single engagement owner", () => {
    expect(engagementApi).toMatch(/publishVideoCollection/);
    expect(engagementApi).toMatch(/\/save/);
    expect(engagementApi).toMatch(/\/unsave/);
    expect(collectionEvents).toMatch(/subscribeVideoCollection/);
    expect(collectionEvents).toMatch(/publishVideoCollection/);
  });
});
