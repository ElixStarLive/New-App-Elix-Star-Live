/**
 * PAGE-067 runtime proof — public Guidelines route, Settings/Safety handoffs, Report separation.
 * Run: npx tsx scripts/_page067_guidelines_runtime_proof.ts
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GUIDELINES_REPORT_PATH,
  GUIDELINES_SECTION_TITLES,
  GUIDELINES_SECTIONS,
  GUIDELINES_TITLE,
  GUIDELINES_UPDATED,
} from "../src/content/guidelines.ts";

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
  const page = readFileSync(resolve("src/pages/Guidelines.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/guidelines.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const legalHub = readFileSync(resolve("src/content/legalHub.ts"), "utf8");
  const settings = readFileSync(resolve("src/pages/Settings.tsx"), "utf8");
  const safetyCenter = readFileSync(resolve("src/pages/settings/SafetyCenter.tsx"), "utf8");
  const report = readFileSync(resolve("src/pages/Report.tsx"), "utf8");
  const legalSafety = readFileSync(resolve("src/pages/LegalSafety.tsx"), "utf8");
  const legalUgc = readFileSync(resolve("src/pages/LegalUGC.tsx"), "utf8");
  const supplier = readFileSync(resolve("src/pages/LegalSupplier.tsx"), "utf8");
  const nav = readFileSync(resolve("src/lib/settingsNav.ts"), "utf8");
  const shell = readFileSync(resolve("src/lib/appShell.ts"), "utf8");

  assert(app.includes('path="/guidelines"') && app.includes("<Guidelines"), "spa route");
  const guidelinesRouteIdx = app.indexOf('path="/guidelines"');
  const requireAuthIdx = app.indexOf("<Route element={<RequireAuth");
  assert(guidelinesRouteIdx > 0 && guidelinesRouteIdx < requireAuthIdx, "guidelines outside RequireAuth");
  assert(GUIDELINES_TITLE === "Community Guidelines", "title");
  assert(GUIDELINES_UPDATED === "Last updated: February 4, 2026", "date");
  assert(GUIDELINES_SECTION_TITLES.length === 6, "6 sections");
  assert(GUIDELINES_SECTIONS.length === 6, "sections array");
  assert(GUIDELINES_REPORT_PATH === "/report", "report path");
  assert(page.includes("SettingsOptionSheet") && page.includes("GUIDELINES_SECTIONS"), "page owner");
  assert(page.includes("exitToFromLocationState"), "named return");
  assert(page.includes("GUIDELINES_REPORT_PATH"), "report handoff");
  assert(!page.includes("/api/guidelines") && !page.includes("<form"), "no guidelines API/form");
  assert(!content.includes("new Date("), "no invented date");
  assert(!legalHub.includes("/guidelines"), "Legal Hub does not invent Guidelines row");
  assert(settings.includes('go("/guidelines")'), "Settings handoff");
  assert(safetyCenter.includes('go("/guidelines")'), "Safety Center handoff");
  assert(report.includes('REPORT_HOME = "/report"'), "PAGE-046 owner");
  assert(!report.includes("GUIDELINES_SECTIONS"), "report does not own guidelines");
  assert(nav.includes('path === "/guidelines"'), "named exit");
  assert(shell.includes('pathname === "/guidelines"'), "public shell");
  assert(!existsSync(resolve("public/guidelines.html")), "no divergent static guidelines.html");
  assert(!existsSync(resolve("public/community-guidelines.html")), "no community-guidelines.html");

  const flat = JSON.stringify(GUIDELINES_SECTIONS);
  for (const marker of [
    "No targeted harassment or bullying",
    "No content involving minors in inappropriate situations",
    "Temporary account suspension",
    "Permanent account ban",
  ]) {
    assert(flat.includes(marker), `marker ${marker}`);
  }

  assert(legalSafety.includes("LEGAL_SAFETY_TITLE") && !legalSafety.includes("GUIDELINES_SECTIONS"), "safety intact");
  assert(legalUgc.includes("LEGAL_UGC_TITLE") && !legalUgc.includes("GUIDELINES_SECTIONS"), "ugc intact");
  assert(supplier.includes("LEGAL_SUPPLIER_TITLE") && !supplier.includes("GUIDELINES_SECTIONS"), "supplier intact");

  assert((await get("/api/health")).status === 200, "health");

  const spa = await get("/guidelines");
  assert([200, 304].includes(spa.status), `/guidelines status ${spa.status}`);
  assert(!spa.location || !spa.location.includes("/login"), "no login redirect");
  const html = spa.text.toLowerCase();
  assert(
    html.includes("<!doctype html") || html.includes("<html") || html.includes("root"),
    "serves html shell for /guidelines",
  );

  const reportRoute = await get("/report");
  assert([200, 304].includes(reportRoute.status), `/report status ${reportRoute.status}`);

  console.log("PAGE-067 GUIDELINES RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        publicRoute: true,
        outsideRequireAuth: true,
        sixSections: true,
        settingsHandoff: true,
        safetyCenterHandoff: true,
        reportSeparation: true,
        legalHubNoGuidelinesRow: true,
        noStaticDuplicate: true,
        spaDeepLink: true,
        priorLegalPagesIntact: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-067 GUIDELINES RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
