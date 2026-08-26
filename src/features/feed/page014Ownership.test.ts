import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/VideoView.tsx"), "utf8");
const player = readFileSync(resolve(process.cwd(), "src/components/ForYouPlayer.tsx"), "utf8");
const videosRouter = readFileSync(resolve(process.cwd(), "server/modules/videos/router.ts"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/videos/query.ts"), "utf8");
const feedApi = readFileSync(resolve(process.cwd(), "src/features/feed/feedApi.ts"), "utf8");
const voice = readFileSync(resolve(process.cwd(), "server/modules/videos/voiceOnly.ts"), "utf8");

describe("PAGE-014 Video View ownership", () => {
  it("loads one video by id into ForYouPlayer with named exit and access owners", () => {
    expect(page).toMatch(/apiFetchVideoById/);
    expect(page).toMatch(/ForYouPlayer/);
    expect(page).toMatch(/loadSeq/);
    expect(page).toMatch(/viewerId/);
    expect(page).toMatch(/page-above-bottom-nav/);
    expect(page).toMatch(/Loading…/);
    expect(page).toMatch(/Video not found or unavailable\./);
    expect(page).toMatch(/Couldn(?:'|&apos;)t load this video\./);
    expect(page).toMatch(/VIDEO_EXIT_TO|returnToFromLocationState/);
    expect(page).not.toMatch(/elix-page-glass/);
    expect(page).not.toMatch(/useVideoStore|getVideoById/);
    expect(feedApi).toMatch(/export async function apiFetchVideoById/);
    expect(feedApi).toMatch(/apiDownloadVoiceOnlyVideo/);
    expect(videosRouter).toMatch(/router\.get\("\/:videoId"/);
    expect(videosRouter).toMatch(/\/:videoId\/download/);
    expect(query).toMatch(/queryVideoDetail/);
    expect(query).toMatch(/privacy = 'public' OR v\.user_id = \$1/);
    expect(query).toMatch(/blocks/);
    expect(voice).toMatch(/fetchVoiceOnlyMp4|voice.?only/i);
    expect(player).toMatch(/apiTrackView/);
    expect(player).toMatch(/apiDownloadVoiceOnlyVideo/);
    expect(player).toMatch(/\/upload\?duet=/);
    expect(player).toMatch(/ReportModal|reportOpen/);
  });
});
