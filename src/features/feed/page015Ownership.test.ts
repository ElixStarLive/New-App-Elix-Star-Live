import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/SavedVideos.tsx"), "utf8");
const feedApi = readFileSync(resolve(process.cwd(), "src/features/feed/feedApi.ts"), "utf8");
const videosRouter = readFileSync(resolve(process.cwd(), "server/modules/videos/router.ts"), "utf8");

describe("PAGE-015 Saved videos ownership", () => {
  it("lists saved videos with Settings exit and video handoff", () => {
    expect(page).toMatch(/apiFetchSavedVideos/);
    expect(page).toMatch(/No saved videos yet\. Tap the bookmark icon on any video to save it\./);
    expect(page).toMatch(/SETTINGS_HOME|\/settings/);
    expect(page).toMatch(/\/video\//);
    expect(page).toMatch(/SAVED_HOME|\/saved/);
    expect(feedApi).toMatch(/\/api\/videos\/saved\/list/);
    expect(videosRouter).toMatch(/saved\/list/);
  });
});
