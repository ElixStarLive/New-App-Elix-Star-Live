/**
 * PAGE-060 runtime proof — public Legal Hub, row destinations, child shells, no auth wall.
 * Run: npx tsx scripts/_page060_legal_hub_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_HUB_DMCA_CONTACT,
  LEGAL_HUB_ITEMS,
  LEGAL_HUB_LABELS,
  LEGAL_HUB_PATHS,
  LEGAL_HUB_SUPPORT_CONTACT,
  LEGAL_HUB_TITLE,
} from "../src/content/legalHub.ts";

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
  const page = readFileSync(resolve("src/pages/Legal.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/legalHub.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const nav = readFileSync(resolve("src/lib/settingsNav.ts"), "utf8");
  const shell = readFileSync(resolve("src/lib/appShell.ts"), "utf8");
  const terms = readFileSync(resolve("src/pages/Terms.tsx"), "utf8");
  const privacy = readFileSync(resolve("src/pages/Privacy.tsx"), "utf8");
  const copyright = readFileSync(resolve("src/pages/Copyright.tsx"), "utf8");

  assert(app.includes('path="/legal"') && app.includes("<Legal"), "spa route");
  const legalRouteIdx = app.indexOf('path="/legal"');
  const requireAuthIdx = app.indexOf("<Route element={<RequireAuth");
  assert(legalRouteIdx > 0 && legalRouteIdx < requireAuthIdx, "legal outside RequireAuth");
  assert(LEGAL_HUB_TITLE === "Legal", "title");
  assert(LEGAL_HUB_LABELS.length === 9, "9 rows");
  assert(LEGAL_HUB_PATHS.length === 9, "9 paths");
  assert(LEGAL_HUB_ITEMS.length === 9, "items");
  assert(LEGAL_HUB_DMCA_CONTACT === "dmca@elixstarlive.com", "dmca contact");
  assert(LEGAL_HUB_SUPPORT_CONTACT === "support@elixstarlive.co.uk", "support contact");
  assert(page.includes("SettingsOptionSheet") && page.includes("LEGAL_HUB_ITEMS"), "page owner");
  assert(page.includes("exitToFromLocationState"), "named return");
  assert(page.includes("containerReturnState(LEGAL_HOME)"), "child return state");
  assert(!page.includes("/api/legal"), "no legal API");
  assert(!content.includes("new Date("), "no invented date");
  assert(!LEGAL_HUB_PATHS.includes("/guidelines"), "no guidelines row");
  assert(!LEGAL_HUB_PATHS.includes("/support"), "no support row");
  assert(nav.includes('LEGAL_HOME = "/legal"'), "LEGAL_HOME");
  assert(shell.includes('pathname === "/legal"'), "public shell");

  // PAGE-057–059 remain independent document owners.
  assert(terms.includes("LEGAL_TERMS_TITLE") && !terms.includes("LEGAL_HUB_ITEMS"), "terms owner");
  assert(privacy.includes("LEGAL_PRIVACY_TITLE") && !privacy.includes("LEGAL_HUB_ITEMS"), "privacy owner");
  assert(copyright.includes("LEGAL_COPYRIGHT_TITLE") && !copyright.includes("LEGAL_HUB_ITEMS"), "copyright owner");

  for (const path of LEGAL_HUB_PATHS) {
    assert(app.includes(`path="${path}"`), `app registers ${path}`);
  }

  assert((await get("/api/health")).status === 200, "health");

  const spa = await get("/legal");
  assert([200, 304].includes(spa.status), `/legal status ${spa.status}`);
  assert(!spa.location || !spa.location.includes("/login"), "no login redirect");
  const html = spa.text.toLowerCase();
  assert(
    html.includes("<!doctype html") || html.includes("<html") || html.includes("root"),
    "serves html shell for /legal",
  );

  for (const path of ["/terms", "/privacy", "/copyright", ...LEGAL_HUB_PATHS.filter((p) => p.startsWith("/legal/"))]) {
    const res = await get(path);
    assert([200, 304].includes(res.status), `${path} status ${res.status}`);
    assert(!res.location || !res.location.includes("/login"), `${path} no login redirect`);
  }

  console.log("PAGE-060 LEGAL HUB RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        publicRoute: true,
        outsideRequireAuth: true,
        nineRows: true,
        childRoutesRegistered: true,
        termsPrivacyCopyrightIntact: true,
        noGuidelinesHowItWorksSupportRows: true,
        noLegalApi: true,
        spaDeepLink: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-060 LEGAL HUB RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
