import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/Discover.tsx"), "utf8");
const feedApi = readFileSync(resolve(process.cwd(), "src/features/feed/feedApi.ts"), "utf8");
const routes = readFileSync(resolve(process.cwd(), "server/modules/app/clientRoutes.ts"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/discover/query.ts"), "utf8");
const topNav = readFileSync(resolve(process.cwd(), "src/components/TopNav.tsx"), "utf8");
const eligibility = readFileSync(resolve(process.cwd(), "shared/stemEligibility.ts"), "utf8");

describe("PAGE-011 Discover ownership", () => {
  it("keeps Explore aggregate, in-page search, and named For You exit", () => {
    expect(page).toMatch(/apiFetchDiscover/);
    expect(page).toMatch(/apiDiscoverSearch/);
    expect(page).toMatch(/title="Explore"/);
    expect(page).toMatch(/focusSearch|discover-search/);
    expect(page).not.toMatch(/navigate\("\/search"/);
    expect(page).toMatch(/FEED_HOME|\/feed/);
    expect(page).toMatch(/\/rising-stars/);
    expect(page).toMatch(/searchShortcut\("music"\)/);
    expect(page).toMatch(/viewerId/);
    expect(page).toMatch(/\/video\/\$\{video\.id\}/);
    expect(page).toMatch(/\/profile\/\$\{/);
    expect(page).toMatch(/\/hashtag\//);
    expect(page).not.toMatch(/history\.back\(|navigate\(-1\)/);
    expect(feedApi).toMatch(/\/api\/discover/);
    expect(feedApi).toMatch(/\/api\/discover\/search/);
    expect(routes).toMatch(/discoverRouter\.get\("\/discover"/);
    expect(routes).toMatch(/discoverRouter\.get\("\/discover\/search"/);
    expect(query).toMatch(/queryDiscoverPage/);
    expect(query).toMatch(/queryDiscoverTrending/);
    expect(query).toMatch(/LIMIT 30/);
    expect(query).toMatch(/LIMIT 50/);
    expect(eligibility).toMatch(/isIndecentExploreCaption|STEM_INDECENTISH_KEYWORDS|exploreIndecentLikePatterns/);
  });

  it("TopNav Explore points at /discover and Discover does not own a second socket", () => {
    expect(topNav).toMatch(/path: "\/discover"/);
    expect(page).not.toMatch(/wsClient\.connect|new WebSocket/);
  });
});
