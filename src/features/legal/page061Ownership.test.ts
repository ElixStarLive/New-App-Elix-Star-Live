import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEGAL_AUDIO_CONTACT,
  LEGAL_AUDIO_SECTION_TITLES,
  LEGAL_AUDIO_TITLE,
} from "@/content/legalAudio";

const page = readFileSync(resolve(process.cwd(), "src/pages/LegalAudio.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/legalAudio.ts"), "utf8");
const hub = readFileSync(resolve(process.cwd(), "src/pages/Legal.tsx"), "utf8");
const copyright = readFileSync(resolve(process.cwd(), "src/pages/Copyright.tsx"), "utf8");
const ugc = readFileSync(resolve(process.cwd(), "src/pages/LegalUGC.tsx"), "utf8");
const dmca = readFileSync(resolve(process.cwd(), "src/pages/LegalDMCA.tsx"), "utf8");
const music = readFileSync(resolve(process.cwd(), "src/pages/MusicFeed.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "src/lib/appShell.ts"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");

describe("PAGE-061 Legal Audio ownership", () => {
  it("has one public /legal/audio owner and the frozen in-app document", () => {
    expect(app.match(/path="\/legal\/audio"/g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/legal\/audio" element=\{<LegalAudio \/>\} \/>/);
    expect(app.indexOf('path="/legal/audio"')).toBeLessThan(app.indexOf("<Route element={<RequireAuth"));
    expect(app).not.toMatch(/path="\/audio-policy"|path="\/legal\/music"|path="\/music-policy"/);
    expect(shell).toMatch(/pathname\.startsWith\("\/legal\/"\)/);
    expect(LEGAL_AUDIO_TITLE).toBe("Audio & Music Disclaimer");
    expect(LEGAL_AUDIO_CONTACT).toBe("legal@elixstarlive.com");
    expect(LEGAL_AUDIO_SECTION_TITLES).toEqual([
      "Audio Content",
      "User Responsibility",
      "Audio Removal",
      "Live Streaming Audio",
      "Contact",
    ]);
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/LEGAL_AUDIO_TITLE/);
    expect(page).toMatch(/exitToFromLocationState/);
    expect(page).not.toMatch(/LegalDocPage|terms\.html|PageScaffold|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|apiRequest|fetch\(|new Date\(/);
    expect(content).not.toMatch(/LegalAudioV2|LegalAudioFixed|coming soon|lorem ipsum|terms\.html/);
    expect(content).not.toMatch(/new Date\(/);
  });

  it("does not invent APIs, scanning, or later legal pages", () => {
    expect(page).not.toMatch(/\/api\/audio|acceptAudio|fingerprint|I Agree|mailto:/);
    expect(content).not.toMatch(/\/api\/audio|POST \/api\/legal|GET \/api\/audio\/licenses/);
    expect(hub).toMatch(/LEGAL_HUB_ITEMS/);
    expect(hub).not.toMatch(/LEGAL_AUDIO_SECTIONS/);
    expect(copyright).not.toMatch(/LEGAL_AUDIO_SECTIONS|\/legal\/audio/);
    expect(ugc).toMatch(/LEGAL_UGC_TITLE/);
    expect(ugc).not.toMatch(/LEGAL_AUDIO_SECTIONS/);
    expect(dmca).toMatch(/LEGAL_DMCA_TITLE/);
    expect(dmca).not.toMatch(/LEGAL_AUDIO_SECTIONS|LegalDocPage/);
    expect(music).not.toMatch(/LEGAL_AUDIO_SECTIONS|LegalAudio/);
    expect(nav).toMatch(/path\.startsWith\(`\$\{LEGAL_HOME\}\/`\)/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/reconnectOnForeground|new WebSocket/);
  });
});
