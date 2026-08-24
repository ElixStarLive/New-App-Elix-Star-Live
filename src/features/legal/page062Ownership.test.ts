import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_HUB_PATHS } from "@/content/legalHub";
import { LEGAL_UGC_SECTION_TITLES, LEGAL_UGC_TITLE } from "@/content/legalUgc";

const page = readFileSync(resolve(process.cwd(), "src/pages/LegalUGC.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/legalUgc.ts"), "utf8");
const hub = readFileSync(resolve(process.cwd(), "src/pages/Legal.tsx"), "utf8");
const audio = readFileSync(resolve(process.cwd(), "src/pages/LegalAudio.tsx"), "utf8");
const affiliate = readFileSync(resolve(process.cwd(), "src/pages/LegalAffiliate.tsx"), "utf8");
const dmca = readFileSync(resolve(process.cwd(), "src/pages/LegalDMCA.tsx"), "utf8");
const safety = readFileSync(resolve(process.cwd(), "src/pages/LegalSafety.tsx"), "utf8");
const guidelines = readFileSync(resolve(process.cwd(), "src/pages/Guidelines.tsx"), "utf8");
const copyright = readFileSync(resolve(process.cwd(), "src/pages/Copyright.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "src/lib/appShell.ts"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");

describe("PAGE-062 Legal UGC ownership", () => {
  it("has one public /legal/ugc owner and the frozen title", () => {
    expect(app.match(/path="\/legal\/ugc"/g)?.length).toBe(1);
    expect(app).not.toMatch(/path="\/ugc"|path="\/legal\/user-content"|path="\/user-generated-content"/);
    expect(shell).toMatch(/pathname\.startsWith\("\/legal\/"\)/);
    expect(LEGAL_UGC_TITLE).toBe("User-Generated Content Policy");
    expect(LEGAL_UGC_SECTION_TITLES).toEqual([
      "About UGC",
      "User Responsibility",
      "Content Verification",
      "Licence Grant",
      "Content Removal",
      "Disclaimer",
    ]);
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/LEGAL_UGC_TITLE/);
    expect(page).toMatch(/exitToFromLocationState/);
    expect(page).toMatch(/LEGAL_UGC_DMCA_PATH/);
    expect(page).not.toMatch(/LegalDocPage|terms\.html|PageScaffold|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|apiRequest|fetch\(/);
    expect(content).not.toMatch(/terms\.html|LegalUGCV2|placeholder policy/);
  });

  it("does not invent APIs, moderation, or later legal pages", () => {
    expect(page).not.toMatch(/\/api\/|acceptUgc|content.?scan|takedown|moderation queue/);
    expect(content).not.toMatch(/\/api\/ugc|POST \/api\/legal/);
    expect(LEGAL_HUB_PATHS).toContain("/legal/ugc");
    expect(hub).toMatch(/LEGAL_HUB_ITEMS/);
    expect(hub).toMatch(/containerReturnState\(LEGAL_HOME\)/);
    expect(hub).not.toMatch(/LEGAL_UGC_SECTIONS/);
    expect(nav).toMatch(/export const LEGAL_HOME = "\/legal"/);
    expect(copyright).not.toMatch(/LEGAL_UGC_SECTIONS|\/legal\/ugc/);
    expect(audio).not.toMatch(/LEGAL_UGC_SECTIONS|User-Generated Content Policy/);
    expect(affiliate).toMatch(/LEGAL_AFFILIATE_TITLE/);
    expect(affiliate).not.toMatch(/LEGAL_UGC_SECTIONS/);
    expect(dmca).toMatch(/LEGAL_DMCA_TITLE/);
    expect(dmca).not.toMatch(/LEGAL_UGC_SECTIONS|LegalDocPage/);
    expect(safety).not.toMatch(/LEGAL_UGC_SECTIONS/);
    expect(guidelines).not.toMatch(/LEGAL_UGC_SECTIONS|User-Generated Content Policy/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/reconnectOnForeground|new WebSocket/);
  });
});
