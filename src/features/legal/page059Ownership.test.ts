import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEGAL_COPYRIGHT_SECTION_TITLES,
  LEGAL_COPYRIGHT_TITLE,
  LEGAL_COPYRIGHT_NOTICE,
} from "@/content/legalCopyright";

const page = readFileSync(resolve(process.cwd(), "src/pages/Copyright.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/legalCopyright.ts"), "utf8");
const terms = readFileSync(resolve(process.cwd(), "src/pages/Terms.tsx"), "utf8");
const privacy = readFileSync(resolve(process.cwd(), "src/pages/Privacy.tsx"), "utf8");
const legal = readFileSync(resolve(process.cwd(), "src/pages/Legal.tsx"), "utf8");
const dmca = readFileSync(resolve(process.cwd(), "src/pages/LegalDMCA.tsx"), "utf8");
const audio = readFileSync(resolve(process.cwd(), "src/pages/LegalAudio.tsx"), "utf8");
const ugc = readFileSync(resolve(process.cwd(), "src/pages/LegalUGC.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "src/lib/appShell.ts"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");

describe("PAGE-059 Copyright ownership", () => {
  it("has one public /copyright owner and the frozen in-app document", () => {
    expect(app.match(/path="\/copyright"/g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/copyright" element=\{<Copyright \/>\} \/>/);
    expect(app).not.toMatch(/path="\/legal\/copyright"|path="\/copyright-policy"|path="\/ip"/);
    expect(shell).toMatch(/pathname === "\/copyright"/);
    expect(LEGAL_COPYRIGHT_TITLE).toBe("Copyright Notice");
    expect(LEGAL_COPYRIGHT_NOTICE).toBe("© 2026 Elix Star Live Ltd. All rights reserved.");
    expect(LEGAL_COPYRIGHT_SECTION_TITLES).toEqual([
      "Ownership",
      "User Content",
      "Third-Party Content",
      "Trademarks",
      "Report Copyright Infringement",
    ]);
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/LEGAL_COPYRIGHT_TITLE/);
    expect(page).toMatch(/exitToFromLocationState/);
    expect(page).toMatch(/LEGAL_COPYRIGHT_DMCA_PATH/);
    expect(page).not.toMatch(/LegalDocPage|PageScaffold|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|apiRequest|fetch\(|new Date\(/);
    expect(content).not.toMatch(/CopyrightV2|CopyrightFixed|coming soon|lorem ipsum/);
  });

  it("does not invent APIs, takedown, or later legal pages", () => {
    expect(page).not.toMatch(/\/api\/copyright|submitClaim|takedown|counter-notice|I Agree/);
    expect(content).not.toMatch(/\/api\/copyright|POST \/api\/legal/);
    expect(terms).not.toMatch(/LEGAL_COPYRIGHT_TITLE|legalCopyright/);
    expect(privacy).not.toMatch(/LEGAL_COPYRIGHT_TITLE|legalCopyright/);
    expect(legal).not.toMatch(/LEGAL_COPYRIGHT_TITLE|LEGAL_COPYRIGHT_SECTIONS|legalCopyright/);
    expect(legal).toMatch(/LEGAL_HUB_ITEMS/);
    expect(dmca).toMatch(/LEGAL_DMCA_TITLE/);
    expect(dmca).not.toMatch(/LEGAL_COPYRIGHT_SECTIONS|LegalDocPage/);
    expect(audio).not.toMatch(/LEGAL_COPYRIGHT_SECTIONS/);
    expect(ugc).toMatch(/LEGAL_UGC_DMCA_PATH/);
    expect(nav).toMatch(/path === "\/copyright"/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/reconnectOnForeground|new WebSocket/);
  });
});
