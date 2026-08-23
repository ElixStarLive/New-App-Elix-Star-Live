import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/MusicFeed.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/music/musicApi.ts"), "utf8");

describe("PAGE-016 Music ownership", () => {
  it("keeps catalog/search preview and Create pickSound handoff", () => {
    expect(page).toMatch(/apiFetchMusicPlaylists|apiSearchMusicTracks/);
    expect(page).toMatch(/toggleMusicPreview|isMusicTrackSaved/);
    expect(page).toMatch(/isCreateSoundPick|createPathWithSound/);
    expect(api).toMatch(/\/api\/music/);
  });
});
