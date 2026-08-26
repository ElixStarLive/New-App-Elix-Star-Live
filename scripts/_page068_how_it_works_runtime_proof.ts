/**
 * PAGE-068 runtime proof — public How It Works route, Settings handoff, CTA destinations.
 * Run: npx tsx scripts/_page068_how_it_works_runtime_proof.ts
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HOW_IT_WORKS_ENGAGEMENT_PATH,
  HOW_IT_WORKS_GUIDELINES_PATH,
  HOW_IT_WORKS_SECTION_TITLES,
  HOW_IT_WORKS_SECTIONS,
  HOW_IT_WORKS_SUPPORT_PATH,
  HOW_IT_WORKS_TITLE,
  HOW_IT_WORKS_UPDATED,
} from "../src/content/howItWorks.ts";

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
  const page = readFileSync(resolve("src/pages/HowItWorks.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/howItWorks.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const legalHub = readFileSync(resolve("src/content/legalHub.ts"), "utf8");
  const settings = readFileSync(resolve("src/pages/Settings.tsx"), "utf8");
  const guidelines = readFileSync(resolve("src/pages/Guidelines.tsx"), "utf8");
  const support = readFileSync(resolve("src/pages/Support.tsx"), "utf8");
  const supplier = readFileSync(resolve("src/pages/LegalSupplier.tsx"), "utf8");
  const nav = readFileSync(resolve("src/lib/settingsNav.ts"), "utf8");
  const shell = readFileSync(resolve("src/lib/appShell.ts"), "utf8");

  assert(app.includes('path="/how-it-works"') && app.includes("<HowItWorks"), "spa route");
  const howIdx = app.indexOf('path="/how-it-works"');
  const requireAuthIdx = app.indexOf("<Route element={<RequireAuth");
  assert(howIdx > 0 && howIdx < requireAuthIdx, "how-it-works outside RequireAuth");
  assert(app.includes('path="/engagement"'), "engagement route exists");
  assert(app.indexOf('path="/engagement"') > requireAuthIdx, "engagement behind RequireAuth");
  assert(GUIDELINES_ROUTE(app), "guidelines public");
  assert(SUPPORT_ROUTE(app), "support public");

  assert(HOW_IT_WORKS_TITLE === "How the app works", "title");
  assert(HOW_IT_WORKS_UPDATED.includes("August 5, 2026"), "date");
  assert(HOW_IT_WORKS_SECTION_TITLES.length === 11, "11 sections");
  assert(HOW_IT_WORKS_SECTIONS.length === 11, "sections array");
  assert(HOW_IT_WORKS_ENGAGEMENT_PATH === "/engagement", "engagement path");
  assert(HOW_IT_WORKS_SUPPORT_PATH === "/support", "support path");
  assert(HOW_IT_WORKS_GUIDELINES_PATH === "/guidelines", "guidelines path");
  assert(page.includes("SettingsOptionSheet") && page.includes("HOW_IT_WORKS_SECTIONS"), "page owner");
  assert(page.includes("exitToFromLocationState"), "named return");
  assert(!page.includes("/api/how-it-works") && !page.includes("<form"), "no API/form");
  assert(!page.includes("localStorage") && !page.includes("tutorialComplete"), "no tutorial progress");
  assert(!content.includes("new Date("), "no invented date");
  assert(!legalHub.includes("/how-it-works"), "Legal Hub does not invent How It Works row");
  assert(settings.includes('go("/how-it-works")'), "Settings handoff");
  assert(guidelines.includes("GUIDELINES_TITLE") && !guidelines.includes("HOW_IT_WORKS_SECTIONS"), "guidelines intact");
  assert(support.includes("SUPPORT_TITLE") && !support.includes("HOW_IT_WORKS_SECTIONS"), "support intact");
  assert(supplier.includes("LEGAL_SUPPLIER_TITLE") && !supplier.includes("HOW_IT_WORKS_SECTIONS"), "supplier intact");
  assert(nav.includes('path === "/how-it-works"'), "named exit");
  assert(shell.includes('pathname === "/how-it-works"'), "public shell");
  assert(!existsSync(resolve("public/how-it-works.html")), "no divergent static html");

  const flat = JSON.stringify(HOW_IT_WORKS_SECTIONS);
  for (const marker of [
    "60% of eligible net gift and creator-subscription revenue",
    "Google Play / Apple",
    "Stripe",
    "Battle Energy",
    "Rising Stars",
  ]) {
    assert(flat.includes(marker), `marker ${marker}`);
  }

  assert((await get("/api/health")).status === 200, "health");

  const spa = await get("/how-it-works");
  assert([200, 304].includes(spa.status), `/how-it-works status ${spa.status}`);
  assert(!spa.location || !spa.location.includes("/login"), "no login redirect");
  const html = spa.text.toLowerCase();
  assert(
    html.includes("<!doctype html") || html.includes("<html") || html.includes("root"),
    "serves html shell for /how-it-works",
  );

  const guidelinesSpa = await get("/guidelines");
  assert([200, 304].includes(guidelinesSpa.status), `/guidelines ${guidelinesSpa.status}`);
  const supportSpa = await get("/support");
  assert([200, 304].includes(supportSpa.status), `/support ${supportSpa.status}`);

  console.log("PAGE-068 HOW IT WORKS RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        publicRoute: true,
        outsideRequireAuth: true,
        elevenSections: true,
        settingsHandoff: true,
        guidelinesCta: true,
        supportCta: true,
        engagementAuthGated: true,
        legalHubNoHowItWorksRow: true,
        noStaticDuplicate: true,
        spaDeepLink: true,
        noTutorialProgress: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-068 HOW IT WORKS RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

function GUIDELINES_ROUTE(app: string) {
  const g = app.indexOf('path="/guidelines"');
  const r = app.indexOf("<Route element={<RequireAuth");
  return g > 0 && g < r;
}

function SUPPORT_ROUTE(app: string) {
  const s = app.indexOf('path="/support"');
  const r = app.indexOf("<Route element={<RequireAuth");
  return s > 0 && s < r;
}
