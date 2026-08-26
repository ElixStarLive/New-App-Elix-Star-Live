import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/MusicFeed.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/music/musicApi.ts"), "utf8");
const preview = readFileSync(resolve(process.cwd(), "src/features/music/previewPlayer.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/music/router.ts"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/music/query.ts"), "utf8");
const epidemic = readFileSync(resolve(process.cwd(), "server/modules/music/epidemic.ts"), "utf8");
const musicCache = readFileSync(resolve(process.cwd(), "server/modules/music/musicCache.ts"), "utf8");

describe("PAGE-016 Music ownership", () => {
  it("keeps catalog/search preview and Create pickSound handoff", () => {
    expect(page).toMatch(/apiFetchMusicPlaylists|apiSearchMusicTracks/);
    expect(page).toMatch(/toggleMusicPreview|isMusicTrackSaved/);
    expect(page).toMatch(/isCreateSoundPick|createPathWithSound/);
    expect(page).toMatch(/Original Sound/);
    expect(page).toMatch(/viewerId/);
    expect(page).toMatch(/attachMusicPreviewLifecycle|stopMusicPreview/);
    expect(page).not.toMatch(/Use this sound/);
    expect(page).not.toMatch(/local-sounds/);
    expect(api).toMatch(/\/api\/music\/playlists/);
    expect(api).toMatch(/\/api\/music\/search/);
    expect(api).toMatch(/\/api\/music\/status/);
    expect(api).toMatch(/\/api\/music\/global/);
    expect(api).toMatch(/\/api\/music\/collections/);
    expect(api).toMatch(/\/api\/music\/tracks\/.*\/preview/);
  });

  it("exposes canonical music routes and Valkey elix:music cache keys", () => {
    expect(router).toMatch(/\/status/);
    expect(router).toMatch(/\/global/);
    expect(router).toMatch(/\/playlists/);
    expect(router).toMatch(/\/collections/);
    expect(router).toMatch(/\/search/);
    expect(router).toMatch(/\/tracks\/:id\/preview/);
    expect(query).toMatch(/queryMusicGlobal|queryMusicCollections|queryMusicPlaylists/);
    expect(query).toMatch(/elix:music|musicCacheKey/);
    expect(musicCache).toMatch(/elix:music:/);
    expect(musicCache).toMatch(/preview:v2/);
    expect(epidemic).toMatch(/musicCacheKey|previewCacheKey/);
    expect(preview).toMatch(/generation/);
  });
});
