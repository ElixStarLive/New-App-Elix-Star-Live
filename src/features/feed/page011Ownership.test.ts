import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/Discover.tsx"), "utf8");
const routes = readFileSync(resolve(process.cwd(), "server/modules/app/clientRoutes.ts"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/discover/query.ts"), "utf8");

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
    expect(routes).toMatch(/discoverRouter\.get\("\/discover"/);
    expect(routes).toMatch(/discoverRouter\.get\("\/discover\/search"/);
    expect(query).toMatch(/queryDiscoverPage/);
    expect(query).toMatch(/queryDiscoverTrending/);
    expect(query).toMatch(/LIMIT 50|LIMIT 30/);
  });
});
