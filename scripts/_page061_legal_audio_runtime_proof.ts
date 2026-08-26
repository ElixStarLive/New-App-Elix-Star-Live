/**
 * PAGE-061 runtime proof — public Legal Audio route, text markers, Legal Hub handoff, no auth wall.
 * Run: npx tsx scripts/_page061_legal_audio_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_AUDIO_CONTACT,
  LEGAL_AUDIO_SECTION_TITLES,
  LEGAL_AUDIO_SECTIONS,
  LEGAL_AUDIO_TITLE,
} from "../src/content/legalAudio.ts";

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";

async function get(path: string) {
  const res = await fetch(`${base}${path}`, { redirect: "manual" });
  const text = await res.text();
  return { status: res.status, text, location: res.headers.get("location") };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

try {
  const page = readFileSync(resolve("src/pages/LegalAudio.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/legalAudio.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const legalHub = readFileSync(resolve("src/content/legalHub.ts"), "utf8");
  const nav = readFileSync(resolve("src/lib/settingsNav.ts"), "utf8");
  const shell = readFileSync(resolve("src/lib/appShell.ts"), "utf8");
  const terms = readFileSync(resolve("src/pages/Terms.tsx"), "utf8");
  const privacy = readFileSync(resolve("src/pages/Privacy.tsx"), "utf8");
  const copyright = readFileSync(resolve("src/pages/Copyright.tsx"), "utf8");
  const legal = readFileSync(resolve("src/pages/Legal.tsx"), "utf8");

  assert(app.includes('path="/legal/audio"') && app.includes("<LegalAudio"), "spa route");
  const audioRouteIdx = app.indexOf('path="/legal/audio"');
  const requireAuthIdx = app.indexOf("<Route element={<RequireAuth");
  assert(audioRouteIdx > 0 && audioRouteIdx < requireAuthIdx, "audio outside RequireAuth");
  assert(LEGAL_AUDIO_TITLE === "Audio & Music Disclaimer", "title");
  assert(LEGAL_AUDIO_CONTACT === "legal@elixstarlive.com", "contact");
  assert(LEGAL_AUDIO_SECTION_TITLES.length === 5, "5 sections");
  assert(LEGAL_AUDIO_SECTIONS.length === 5, "sections array");
  assert(page.includes("SettingsOptionSheet") && page.includes("LEGAL_AUDIO_SECTIONS"), "page owner");
  assert(page.includes("exitToFromLocationState"), "named return");
  assert(!page.includes("/api/audio") && !page.includes("acceptAudio"), "no audio API");
  assert(!content.includes("new Date("), "no invented date");
  assert(legalHub.includes('path: "/legal/audio"'), "legal hub handoff");
  assert(nav.includes("path.startsWith(`${LEGAL_HOME}/`)"), "named exit under /legal/");
  assert(shell.includes('pathname.startsWith("/legal/")'), "public shell under /legal/");

  // No in-document navigation links (OLD has none).
  assert(!page.includes('href="/copyright"') && !page.includes('href="/legal/dmca"'), "no invented legal links");
  assert(!page.includes('href="/support"') && !page.includes('href="/legal/ugc"'), "no invented support/ugc links");

  const flat = JSON.stringify(LEGAL_AUDIO_SECTIONS) + LEGAL_AUDIO_CONTACT;
  for (const marker of [
    "Original audio:",
    "User-generated audio:",
    "Licensed audio:",
    "DMCA takedown notice",
    "live streams",
    "legal@elixstarlive.com",
  ]) {
    assert(flat.includes(marker), `marker ${marker}`);
  }

  // Prior legal pages remain independent.
  assert(terms.includes("LEGAL_TERMS_TITLE") && !terms.includes("LEGAL_AUDIO_SECTIONS"), "terms intact");
  assert(privacy.includes("LEGAL_PRIVACY_TITLE") && !privacy.includes("LEGAL_AUDIO_SECTIONS"), "privacy intact");
  assert(copyright.includes("LEGAL_COPYRIGHT_TITLE") && !copyright.includes("LEGAL_AUDIO_SECTIONS"), "copyright intact");
  assert(legal.includes("LEGAL_HUB_ITEMS") && !legal.includes("LEGAL_AUDIO_SECTIONS"), "hub intact");

  assert((await get("/api/health")).status === 200, "health");

  const spa = await get("/legal/audio");
  assert([200, 304].includes(spa.status), `/legal/audio status ${spa.status}`);
  assert(!spa.location || !spa.location.includes("/login"), "no login redirect");
  const html = spa.text.toLowerCase();
  assert(
    html.includes("<!doctype html") || html.includes("<html") || html.includes("root"),
    "serves html shell for /legal/audio",
  );

  const hub = await get("/legal");
  assert([200, 304].includes(hub.status), `/legal status ${hub.status}`);

  console.log("PAGE-061 LEGAL AUDIO RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        publicRoute: true,
        outsideRequireAuth: true,
        fiveSections: true,
        legalHubHandoff: true,
        noInternalLegalLinks: true,
        noAudioApi: true,
        spaDeepLink: true,
        priorLegalPagesIntact: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-061 LEGAL AUDIO RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
