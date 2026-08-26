/**
 * PAGE-064 runtime proof — public Legal DMCA route, mailto submission, Legal Hub/Copyright/UGC handoffs.
 * Run: npx tsx scripts/_page064_legal_dmca_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_DMCA_CONTACT,
  LEGAL_DMCA_MAILTO_HREF,
  LEGAL_DMCA_SECTION_TITLES,
  LEGAL_DMCA_SECTIONS,
  LEGAL_DMCA_TITLE,
} from "../src/content/legalDmca.ts";

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
  const page = readFileSync(resolve("src/pages/LegalDMCA.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/legalDmca.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const legalHub = readFileSync(resolve("src/content/legalHub.ts"), "utf8");
  const copyright = readFileSync(resolve("src/content/legalCopyright.ts"), "utf8");
  const ugc = readFileSync(resolve("src/content/legalUgc.ts"), "utf8");
  const audio = readFileSync(resolve("src/pages/LegalAudio.tsx"), "utf8");
  const report = readFileSync(resolve("src/pages/Report.tsx"), "utf8");
  const nav = readFileSync(resolve("src/lib/settingsNav.ts"), "utf8");
  const shell = readFileSync(resolve("src/lib/appShell.ts"), "utf8");
  const terms = readFileSync(resolve("src/pages/Terms.tsx"), "utf8");
  const privacy = readFileSync(resolve("src/pages/Privacy.tsx"), "utf8");
  const legal = readFileSync(resolve("src/pages/Legal.tsx"), "utf8");
  const affiliate = readFileSync(resolve("src/pages/LegalAffiliate.tsx"), "utf8");

  assert(app.includes('path="/legal/dmca"') && app.includes("<LegalDMCA"), "spa route");
  const dmcaRouteIdx = app.indexOf('path="/legal/dmca"');
  const requireAuthIdx = app.indexOf("<Route element={<RequireAuth");
  assert(dmcaRouteIdx > 0 && dmcaRouteIdx < requireAuthIdx, "dmca outside RequireAuth");
  assert(LEGAL_DMCA_TITLE === "DMCA / Copyright Policy", "title");
  assert(LEGAL_DMCA_CONTACT === "dmca@elixstarlive.com", "contact");
  assert(LEGAL_DMCA_SECTION_TITLES.length === 4, "4 sections");
  assert(LEGAL_DMCA_SECTIONS.length === 4, "sections array");
  assert(
    LEGAL_DMCA_MAILTO_HREF === "mailto:dmca@elixstarlive.com?subject=DMCA%20Notice%20-%20ElixStarLive",
    "mailto",
  );
  assert(page.includes("SettingsOptionSheet") && page.includes("LEGAL_DMCA_SECTIONS"), "page owner");
  assert(page.includes("exitToFromLocationState"), "named return");
  assert(page.includes("LEGAL_DMCA_MAILTO_HREF"), "mailto CTA");
  assert(!page.includes("<form") && !page.includes("/api/dmca"), "no form/API");
  assert(!content.includes("new Date("), "no invented date");
  assert(legalHub.includes('path: "/legal/dmca"'), "legal hub handoff");
  assert(copyright.includes('LEGAL_COPYRIGHT_DMCA_PATH = "/legal/dmca"'), "copyright handoff");
  assert(ugc.includes('LEGAL_UGC_DMCA_PATH = "/legal/dmca"'), "ugc handoff");
  assert(!audio.includes("/legal/dmca"), "audio has no DMCA route link (OLD parity)");
  assert(!report.includes("/legal/dmca") && !report.includes("LEGAL_DMCA"), "report separation");
  assert(nav.includes("path.startsWith(`${LEGAL_HOME}/`)"), "named exit under /legal/");
  assert(shell.includes('pathname.startsWith("/legal/")'), "public shell under /legal/");

  const flat = JSON.stringify(LEGAL_DMCA_SECTIONS) + LEGAL_DMCA_CONTACT;
  for (const marker of [
    "penalty of perjury",
    "repeat copyright infringers",
    "good faith belief",
    "physical or electronic signature",
    "dmca@elixstarlive.com",
  ]) {
    assert(flat.includes(marker), `marker ${marker}`);
  }

  assert(terms.includes("LEGAL_TERMS_TITLE") && !terms.includes("LEGAL_DMCA_SECTIONS"), "terms intact");
  assert(privacy.includes("LEGAL_PRIVACY_TITLE") && !privacy.includes("LEGAL_DMCA_SECTIONS"), "privacy intact");
  assert(legal.includes("LEGAL_HUB_ITEMS") && !legal.includes("LEGAL_DMCA_SECTIONS"), "hub intact");
  assert(affiliate.includes("LEGAL_AFFILIATE_TITLE") && !affiliate.includes("LEGAL_DMCA_SECTIONS"), "affiliate intact");

  assert((await get("/api/health")).status === 200, "health");

  const spa = await get("/legal/dmca");
  assert([200, 304].includes(spa.status), `/legal/dmca status ${spa.status}`);
  assert(!spa.location || !spa.location.includes("/login"), "no login redirect");
  const html = spa.text.toLowerCase();
  assert(
    html.includes("<!doctype html") || html.includes("<html") || html.includes("root"),
    "serves html shell for /legal/dmca",
  );

  for (const path of ["/legal", "/copyright", "/legal/ugc"]) {
    const res = await get(path);
    assert([200, 304].includes(res.status), `${path} status ${res.status}`);
    assert(!res.location || !res.location.includes("/login"), `${path} no login redirect`);
  }

  console.log("PAGE-064 LEGAL DMCA RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        publicRoute: true,
        outsideRequireAuth: true,
        fourSections: true,
        mailtoSubmissionOnly: true,
        noDmcaFormApi: true,
        legalHubHandoff: true,
        copyrightHandoff: true,
        ugcHandoff: true,
        reportSeparated: true,
        spaDeepLink: true,
        priorLegalPagesIntact: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-064 LEGAL DMCA RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
