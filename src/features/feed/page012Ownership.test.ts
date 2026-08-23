import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/SearchPage.tsx"), "utf8");
const stem = readFileSync(resolve(process.cwd(), "src/components/StemFeedOverlay.tsx"), "utf8");
const routes = readFileSync(resolve(process.cwd(), "server/modules/app/clientRoutes.ts"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/search/query.ts"), "utf8");

describe("PAGE-012 Search ownership", () => {
  it("keeps STEM returnTo and server search browse/query", () => {
    expect(stem).toMatch(/\/search/);
    expect(stem).toMatch(/containerReturnState\("\/stem"\)/);
    expect(page).toMatch(/exitToFromLocationState|No videos yet\.|No videos found\./);
    expect(routes).toMatch(/discoverRouter\.get\("\/search"/);
    expect(query).toMatch(/querySearchPage/);
  });
});
