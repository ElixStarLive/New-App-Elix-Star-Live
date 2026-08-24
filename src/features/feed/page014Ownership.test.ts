import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/VideoView.tsx"), "utf8");
const videosRouter = readFileSync(resolve(process.cwd(), "server/modules/videos/router.ts"), "utf8");
const feedApi = readFileSync(resolve(process.cwd(), "src/features/feed/feedApi.ts"), "utf8");

describe("PAGE-014 Video View ownership", () => {
  it("loads one video by id into ForYouPlayer with named exit copy", () => {
    expect(page).toMatch(/apiFetchVideoById/);
    expect(page).toMatch(/ForYouPlayer/);
    expect(page).toMatch(/Loading…/);
    expect(page).toMatch(/Video not found or unavailable\./);
    expect(page).toMatch(/Couldn(?:'|&apos;)t load this video\./);
    expect(page).toMatch(/VIDEO_EXIT_TO|returnToFromLocationState/);
    expect(feedApi).toMatch(/export async function apiFetchVideoById/);
    expect(videosRouter).toMatch(/router\.get\("\/:videoId"/);
  });
});
