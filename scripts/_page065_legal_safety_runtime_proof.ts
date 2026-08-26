/**
 * PAGE-065 runtime proof — public Legal Safety route, Legal Hub handoff, PAGE-041 separation.
 * Run: npx tsx scripts/_page065_legal_safety_runtime_proof.ts
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_SAFETY_CONTACT,
  LEGAL_SAFETY_SECTION_TITLES,
  LEGAL_SAFETY_SECTIONS,
  LEGAL_SAFETY_TITLE,
} from "../src/content/legalSafety.ts";

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
  const page = readFileSync(resolve("src/pages/LegalSafety.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/legalSafety.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const legalHub = readFileSync(resolve("src/content/legalHub.ts"), "utf8");
  const center = readFileSync(resolve("src/pages/settings/SafetyCenter.tsx"), "utf8");
  const report = readFileSync(resolve("src/pages/Report.tsx"), "utf8");
  const nav = readFileSync(resolve("src/lib/settingsNav.ts"), "utf8");
  const shell = readFileSync(resolve("src/lib/appShell.ts"), "utf8");
  const terms = readFileSync(resolve("src/pages/Terms.tsx"), "utf8");
  const privacy = readFileSync(resolve("src/pages/Privacy.tsx"), "utf8");
  const legal = readFileSync(resolve("src/pages/Legal.tsx"), "utf8");
  const dmca = readFileSync(resolve("src/pages/LegalDMCA.tsx"), "utf8");
  const affiliate = readFileSync(resolve("src/pages/LegalAffiliate.tsx"), "utf8");

  assert(app.includes('path="/legal/safety"') && app.includes("<LegalSafety"), "spa route");
  assert(app.includes('path="/settings/safety"') && app.includes("<SafetyCenter"), "PAGE-041 separate");
  const safetyRouteIdx = app.indexOf('path="/legal/safety"');
  const requireAuthIdx = app.indexOf("<Route element={<RequireAuth");
  assert(safetyRouteIdx > 0 && safetyRouteIdx < requireAuthIdx, "legal safety outside RequireAuth");
  assert(LEGAL_SAFETY_TITLE === "Safety Centre", "title");
  assert(LEGAL_SAFETY_CONTACT === "safety@elixstarlive.com", "contact");
  assert(LEGAL_SAFETY_SECTION_TITLES.length === 7, "7 sections");
  assert(LEGAL_SAFETY_SECTIONS.length === 7, "sections array");
  assert(page.includes("SettingsOptionSheet") && page.includes("LEGAL_SAFETY_SECTIONS"), "page owner");
  assert(page.includes("exitToFromLocationState"), "named return");
  assert(!page.includes("/api/safety") && !page.includes("<form"), "no safety API/form");
  assert(!page.includes("/settings/safety") && !page.includes("/report"), "no invented product links");
  assert(!content.includes("new Date(") && !content.includes("child-safety.html"), "no invented date/merge");
  assert(legalHub.includes('path: "/legal/safety"'), "legal hub handoff");
  assert(center.includes('SAFETY_HOME = "/settings/safety"') && !center.includes("LEGAL_SAFETY_SECTIONS"), "PAGE-041 separate");
  assert(!report.includes("LEGAL_SAFETY_SECTIONS") && !report.includes("/legal/safety"), "report separate");
  assert(nav.includes("path.startsWith(`${LEGAL_HOME}/`)"), "named exit under /legal/");
  assert(shell.includes('pathname.startsWith("/legal/")'), "public shell under /legal/");
  assert(existsSync(resolve("public/child-safety.html")), "child-safety.html separate artifact");

  const flat = JSON.stringify(LEGAL_SAFETY_SECTIONS) + LEGAL_SAFETY_CONTACT;
  for (const marker of [
    "under 13",
    "Settings → Blocked Accounts",
    "116 123",
    "988",
    "Nudity and sexual content",
    "safety@elixstarlive.com",
  ]) {
    assert(flat.includes(marker), `marker ${marker}`);
  }

  assert(terms.includes("LEGAL_TERMS_TITLE") && !terms.includes("LEGAL_SAFETY_SECTIONS"), "terms intact");
  assert(privacy.includes("LEGAL_PRIVACY_TITLE") && !privacy.includes("LEGAL_SAFETY_SECTIONS"), "privacy intact");
  assert(legal.includes("LEGAL_HUB_ITEMS") && !legal.includes("LEGAL_SAFETY_SECTIONS"), "hub intact");
  assert(dmca.includes("LEGAL_DMCA_TITLE") && !dmca.includes("LEGAL_SAFETY_SECTIONS"), "dmca intact");
  assert(affiliate.includes("LEGAL_AFFILIATE_TITLE") && !affiliate.includes("LEGAL_SAFETY_SECTIONS"), "affiliate intact");

  assert((await get("/api/health")).status === 200, "health");

  const spa = await get("/legal/safety");
  assert([200, 304].includes(spa.status), `/legal/safety status ${spa.status}`);
  assert(!spa.location || !spa.location.includes("/login"), "no login redirect");
  const html = spa.text.toLowerCase();
  assert(
    html.includes("<!doctype html") || html.includes("<html") || html.includes("root"),
    "serves html shell for /legal/safety",
  );

  const child = await get("/child-safety.html");
  assert([200, 304].includes(child.status), `/child-safety.html ${child.status}`);
  assert(child.text.includes("Child Safety Standards"), "child-safety artifact");
  assert(child.text.includes("Last updated: July 19, 2026"), "child-safety date");

  const hub = await get("/legal");
  assert([200, 304].includes(hub.status), `/legal status ${hub.status}`);

  console.log("PAGE-065 LEGAL SAFETY RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        publicRoute: true,
        outsideRequireAuth: true,
        sevenSections: true,
        legalHubHandoff: true,
        safetyCenterSeparated: true,
        reportSeparated: true,
        childSafetyArtifactSeparate: true,
        noSafetyApi: true,
        spaDeepLink: true,
        priorLegalPagesIntact: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-065 LEGAL SAFETY RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
