import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/Hashtag.tsx"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/hashtags/router.ts"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/hashtags/query.ts"), "utf8");
const normalize = readFileSync(resolve(process.cwd(), "shared/hashtag.ts"), "utf8");

describe("PAGE-013 Hashtag ownership", () => {
  it("keeps one hashtag GET, exact normalize, Discover exit, video handoff", () => {
    expect(page).toMatch(/apiFetchHashtag/);
    expect(page).toMatch(/No videos found for this hashtag/);
    expect(page).toMatch(/Loading\.\.\./);
    expect(page).toMatch(/DISCOVER_HOME|\/discover/);
    expect(page).toMatch(/\/video\//);
    expect(router).toMatch(/router\.get\("\/:tag"/);
    expect(query).toMatch(/HASHTAG_VIDEO_LIMIT\s*=\s*100|LIMIT 100/);
    expect(normalize).toMatch(/normalizeHashtag|strip/);
  });
});
