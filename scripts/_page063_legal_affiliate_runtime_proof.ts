/**
 * PAGE-063 runtime proof — public Legal Affiliate route, text markers, Legal Hub handoff.
 * Run: npx tsx scripts/_page063_legal_affiliate_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_AFFILIATE_CONTACT,
  LEGAL_AFFILIATE_SECTION_TITLES,
  LEGAL_AFFILIATE_SECTIONS,
  LEGAL_AFFILIATE_TITLE,
} from "../src/content/legalAffiliate.ts";

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
  const page = readFileSync(resolve("src/pages/LegalAffiliate.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/legalAffiliate.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const legalHub = readFileSync(resolve("src/content/legalHub.ts"), "utf8");
  const nav = readFileSync(resolve("src/lib/settingsNav.ts"), "utf8");
  const shell = readFileSync(resolve("src/lib/appShell.ts"), "utf8");
  const terms = readFileSync(resolve("src/pages/Terms.tsx"), "utf8");
  const privacy = readFileSync(resolve("src/pages/Privacy.tsx"), "utf8");
  const copyright = readFileSync(resolve("src/pages/Copyright.tsx"), "utf8");
  const legal = readFileSync(resolve("src/pages/Legal.tsx"), "utf8");
  const audio = readFileSync(resolve("src/pages/LegalAudio.tsx"), "utf8");
  const ugc = readFileSync(resolve("src/pages/LegalUGC.tsx"), "utf8");

  assert(app.includes('path="/legal/affiliate"') && app.includes("<LegalAffiliate"), "spa route");
  const affiliateRouteIdx = app.indexOf('path="/legal/affiliate"');
  const requireAuthIdx = app.indexOf("<Route element={<RequireAuth");
  assert(affiliateRouteIdx > 0 && affiliateRouteIdx < requireAuthIdx, "affiliate outside RequireAuth");
  assert(LEGAL_AFFILIATE_TITLE === "Affiliate & Sponsored Content", "title");
  assert(LEGAL_AFFILIATE_CONTACT === "legal@elixstarlive.com", "contact");
  assert(LEGAL_AFFILIATE_SECTION_TITLES.length === 4, "4 sections");
  assert(LEGAL_AFFILIATE_SECTIONS.length === 4, "sections array");
  assert(page.includes("SettingsOptionSheet") && page.includes("LEGAL_AFFILIATE_SECTIONS"), "page owner");
  assert(page.includes("exitToFromLocationState"), "named return");
  assert(!page.includes("/api/affiliate") && !page.includes("signupAffiliate"), "no affiliate API");
  assert(!content.includes("new Date("), "no invented date");
  assert(!content.includes("commission rate") && !content.includes("referral code"), "no invented economics");
  assert(legalHub.includes('path: "/legal/affiliate"'), "legal hub handoff");
  assert(nav.includes("path.startsWith(`${LEGAL_HOME}/`)"), "named exit under /legal/");
  assert(shell.includes('pathname.startsWith("/legal/")'), "public shell under /legal/");

  assert(!page.includes('href="/terms"') && !page.includes('href="/privacy"'), "no invented terms/privacy links");
  assert(!page.includes('href="/copyright"') && !page.includes('href="/legal/ugc"'), "no invented copyright/ugc links");
  assert(!page.includes('href="/guidelines"') && !page.includes('href="/support"'), "no invented guidelines/support links");

  const flat = JSON.stringify(LEGAL_AFFILIATE_SECTIONS) + LEGAL_AFFILIATE_CONTACT;
  for (const marker of [
    "Advertising Standards Authority",
    "Federal Trade Commission",
    "Paid Partnership",
    "in-app reporting feature",
    "legal@elixstarlive.com",
  ]) {
    assert(flat.includes(marker), `marker ${marker}`);
  }

  assert(terms.includes("LEGAL_TERMS_TITLE") && !terms.includes("LEGAL_AFFILIATE_SECTIONS"), "terms intact");
  assert(privacy.includes("LEGAL_PRIVACY_TITLE") && !privacy.includes("LEGAL_AFFILIATE_SECTIONS"), "privacy intact");
  assert(copyright.includes("LEGAL_COPYRIGHT_TITLE") && !copyright.includes("LEGAL_AFFILIATE_SECTIONS"), "copyright intact");
  assert(legal.includes("LEGAL_HUB_ITEMS") && !legal.includes("LEGAL_AFFILIATE_SECTIONS"), "hub intact");
  assert(audio.includes("LEGAL_AUDIO_TITLE") && !audio.includes("LEGAL_AFFILIATE_SECTIONS"), "audio intact");
  assert(ugc.includes("LEGAL_UGC_TITLE") && !ugc.includes("LEGAL_AFFILIATE_SECTIONS"), "ugc intact");

  assert((await get("/api/health")).status === 200, "health");

  const spa = await get("/legal/affiliate");
  assert([200, 304].includes(spa.status), `/legal/affiliate status ${spa.status}`);
  assert(!spa.location || !spa.location.includes("/login"), "no login redirect");
  const html = spa.text.toLowerCase();
  assert(
    html.includes("<!doctype html") || html.includes("<html") || html.includes("root"),
    "serves html shell for /legal/affiliate",
  );

  const hub = await get("/legal");
  assert([200, 304].includes(hub.status), `/legal status ${hub.status}`);

  console.log("PAGE-063 LEGAL AFFILIATE RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        publicRoute: true,
        outsideRequireAuth: true,
        fourSections: true,
        legalHubHandoff: true,
        noAffiliateApi: true,
        noInventedEconomics: true,
        spaDeepLink: true,
        priorLegalPagesIntact: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-063 LEGAL AFFILIATE RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
