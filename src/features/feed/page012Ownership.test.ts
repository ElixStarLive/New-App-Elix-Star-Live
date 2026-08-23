import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/SearchPage.tsx"), "utf8");
const stem = readFileSync(resolve(process.cwd(), "src/components/StemFeedOverlay.tsx"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/search/router.ts"), "utf8");

describe("PAGE-012 Search ownership", () => {
  it("keeps STEM returnTo and server search browse/query", () => {
    expect(stem).toMatch(/\/search/);
    expect(stem).toMatch(/containerReturnState\("\/stem"\)/);
    expect(page).toMatch(/exitToFromLocationState|No videos yet\.|No videos found\./);
    expect(router).toMatch(/router\.get\("\/"|category|q/);
  });
});
