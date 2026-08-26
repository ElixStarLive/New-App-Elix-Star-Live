/**
 * PAGE-069 runtime proof — public Support route, static/readable (no ticket API), handoffs.
 * Run: npx tsx scripts/_page069_support_runtime_proof.ts
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SUPPORT_EMAIL,
  SUPPORT_FAQ_QUESTIONS,
  SUPPORT_MAILTO,
  SUPPORT_QUICK_LINKS,
  SUPPORT_TITLE,
} from "../src/content/support.ts";

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
  const page = readFileSync(resolve("src/pages/Support.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/support.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const legalHub = readFileSync(resolve("src/content/legalHub.ts"), "utf8");
  const settings = readFileSync(resolve("src/pages/Settings.tsx"), "utf8");
  const how = readFileSync(resolve("src/pages/HowItWorks.tsx"), "utf8");
  const guidelines = readFileSync(resolve("src/pages/Guidelines.tsx"), "utf8");
  const safetyCenter = readFileSync(resolve("src/pages/settings/SafetyCenter.tsx"), "utf8");
  const nav = readFileSync(resolve("src/lib/settingsNav.ts"), "utf8");
  const shell = readFileSync(resolve("src/lib/appShell.ts"), "utf8");

  assert(app.includes('path="/support"') && app.includes("<Support"), "spa route");
  const supportIdx = app.indexOf('path="/support"');
  const requireAuthIdx = app.indexOf("<Route element={<RequireAuth");
  assert(supportIdx > 0 && supportIdx < requireAuthIdx, "support outside RequireAuth");
  assert(SUPPORT_TITLE === "Help & Support", "title");
  assert(SUPPORT_EMAIL === "support@elixstarlive.co.uk", "email");
  assert(SUPPORT_MAILTO === "mailto:support@elixstarlive.co.uk", "mailto");
  assert(SUPPORT_FAQ_QUESTIONS.length === 8, "8 FAQs");
  assert(SUPPORT_QUICK_LINKS[0]?.mailto === true, "Contact Support mailto");
  assert(page.includes("SettingsOptionSheet") && page.includes("SUPPORT_FAQ_ITEMS"), "page owner");
  assert(page.includes("exitToFromLocationState"), "named return");
  assert(page.includes("SUPPORT_MAILTO"), "mailto wiring");
  assert(!page.includes("/api/support") && !page.includes("apiCreateReport"), "no ticket API");
  assert(!page.includes("<form") && !page.includes("<textarea") && !page.includes('type="email"'), "no form");
  assert(!page.includes("Message Sent") && !page.includes("Sending..."), "no fake success");
  assert(!content.includes("new Date("), "no invented date");
  assert(!legalHub.includes("/support"), "Legal Hub does not invent Support row");
  assert(settings.includes('go("/support")'), "Settings handoff");
  assert(how.includes("HOW_IT_WORKS_SUPPORT_PATH") || how.includes('"/support"'), "How It Works CTA");
  assert(guidelines.includes("GUIDELINES_TITLE") && !guidelines.includes("SUPPORT_FAQ_ITEMS"), "guidelines intact");
  assert(safetyCenter.includes('go("/support")'), "Safety Center handoff");
  assert(nav.includes('path === "/support"'), "named exit");
  assert(shell.includes('pathname === "/support"'), "public shell");
  assert(existsSync(resolve("public/support.html")), "static artifact exists (separate web owner)");

  assert((await get("/api/health")).status === 200, "health");

  const spa = await get("/support");
  assert([200, 304].includes(spa.status), `/support status ${spa.status}`);
  assert(!spa.location || !spa.location.includes("/login"), "no login redirect");
  const html = spa.text.toLowerCase();
  assert(
    html.includes("<!doctype html") || html.includes("<html") || html.includes("root"),
    "serves html shell for /support",
  );

  const staticDoc = await get("/support.html");
  assert([200, 304].includes(staticDoc.status), `/support.html ${staticDoc.status}`);
  assert(staticDoc.text.includes("support@elixstarlive.co.uk"), "static email");

  for (const path of ["/guidelines", "/how-it-works", "/terms", "/privacy", "/copyright"]) {
    const res = await get(path);
    assert([200, 304].includes(res.status), `${path} ${res.status}`);
  }

  console.log("PAGE-069 SUPPORT RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        publicRoute: true,
        outsideRequireAuth: true,
        eightFaqs: true,
        contactMailto: true,
        noTicketForm: true,
        noSupportApi: true,
        settingsHandoff: true,
        howItWorksHandoff: true,
        safetyCenterHandoff: true,
        legalHubNoSupportRow: true,
        staticArtifactSeparate: true,
        spaDeepLink: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-069 SUPPORT RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
