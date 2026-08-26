import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/SearchPage.tsx"), "utf8");
const stem = readFileSync(resolve(process.cwd(), "src/components/StemFeedOverlay.tsx"), "utf8");
const inbox = readFileSync(resolve(process.cwd(), "src/pages/Inbox.tsx"), "utf8");
const feedApi = readFileSync(resolve(process.cwd(), "src/features/feed/feedApi.ts"), "utf8");
const routes = readFileSync(resolve(process.cwd(), "server/modules/app/clientRoutes.ts"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/search/query.ts"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");

describe("PAGE-012 Search ownership", () => {
  it("uses server GET /api/search with race-safe loadSeq and named returnTo exits", () => {
    expect(page).toMatch(/apiFetchSearch/);
    expect(page).toMatch(/loadSeq/);
    expect(page).toMatch(/exitToFromLocationState/);
    expect(page).toMatch(/returnToFromLocationState/);
    expect(page).toMatch(/viewerId/);
    expect(page).toMatch(/app-live-column-host/);
    expect(page).toMatch(/dy > 80/);
    expect(page).not.toMatch(/localStorage|elix_recent_searches/);
    expect(page).not.toMatch(/apiFetchForYouFeed|apiFetchProfiles\(|apiFetchDiscover/);
    expect(feedApi).toMatch(/\/api\/search/);
    expect(routes).toMatch(/discoverRouter\.get\("\/search"/);
    expect(query).toMatch(/querySearchPage/);
    expect(query).toMatch(/querySearchUsers/);
    expect(query).toMatch(/querySearchVideos/);
    expect(query).toMatch(/querySearchBrowse/);
    expect(nav).toMatch(/SEARCH_EXIT_TO/);
    expect(nav).toMatch(/inboxReturnState/);
  });

  it("STEM and Inbox open Search with returnTo", () => {
    expect(stem).toMatch(/\/search/);
    expect(stem).toMatch(/containerReturnState\("\/stem"\)/);
    expect(inbox).toMatch(/navigate\("\/search"/);
    expect(inbox).toMatch(/inboxReturnState\(\)/);
  });
});
