/**
 * PAGE-058 runtime proof — public Privacy route, legal text markers, handoffs, no auth wall.
 * Run: npx tsx scripts/_page058_privacy_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_PRIVACY_SECTION_TITLES,
  LEGAL_PRIVACY_TITLE,
  LEGAL_PRIVACY_UPDATED_LABEL,
  LEGAL_PRIVACY_SECTIONS,
} from "../src/content/legalPrivacy.ts";

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
  const page = readFileSync(resolve("src/pages/Privacy.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/legalPrivacy.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const register = readFileSync(resolve("src/pages/Register.tsx"), "utf8");
  const login = readFileSync(resolve("src/pages/Login.tsx"), "utf8");
  const legalHub = readFileSync(resolve("src/content/legalHub.ts"), "utf8");
  const settings = readFileSync(resolve("src/pages/Settings.tsx"), "utf8");
  const nav = readFileSync(resolve("src/lib/settingsNav.ts"), "utf8");
  const shell = readFileSync(resolve("src/lib/appShell.ts"), "utf8");
  const staticHtml = readFileSync(resolve("public/privacy.html"), "utf8");

  assert(app.includes('path="/privacy"') && app.includes("<Privacy"), "spa route");
  const privacyRouteIdx = app.indexOf('path="/privacy"');
  const requireAuthIdx = app.indexOf("<Route element={<RequireAuth");
  assert(privacyRouteIdx > 0 && privacyRouteIdx < requireAuthIdx, "privacy outside RequireAuth");
  assert(LEGAL_PRIVACY_TITLE === "Privacy Policy", "title");
  assert(LEGAL_PRIVACY_UPDATED_LABEL === "Last updated: February 20, 2026", "date");
  assert(LEGAL_PRIVACY_SECTION_TITLES.length === 14, "14 sections");
  assert(LEGAL_PRIVACY_SECTIONS.length === 14, "sections array");
  assert(page.includes("SettingsOptionSheet") && page.includes("LEGAL_PRIVACY_SECTIONS"), "page owner");
  assert(!page.includes("/api/privacy") && !page.includes("acceptPrivacy"), "no privacy API");
  assert(!content.includes("new Date("), "no invented date");
  assert(register.includes('to="/privacy"') && register.includes('containerReturnState("/register")'), "register handoff");
  assert(!login.includes('to="/privacy"') && !login.includes('navigate("/privacy"'), "login has no Privacy link (OLD parity)");
  assert(legalHub.includes('path: "/privacy"'), "legal hub handoff");
  assert(settings.includes('go("/privacy")'), "settings handoff");
  assert(nav.includes('path === "/privacy"'), "named exit");
  assert(shell.includes('pathname === "/privacy"'), "public shell");

  const flat = JSON.stringify(LEGAL_PRIVACY_SECTIONS);
  for (const marker of [
    "children under 13",
    "Elix Star Live Ltd",
    "within 30 days",
    "up to 7 years",
    "hashed passwords (bcrypt)",
    "England and Wales",
    "Apple In-App Purchase, Google Play Billing, or Stripe",
    "Settings → Delete Account",
  ]) {
    assert(flat.includes(marker), `marker ${marker}`);
  }

  // Static HTML is a separate public artifact (OLD dual-owner pattern), not PAGE-058 SPA owner.
  assert(staticHtml.includes("Last updated: July 21, 2026"), "static date");
  assert(staticHtml.includes("delete-account.html"), "static delete link");
  assert(staticHtml.includes("child-safety.html"), "static child-safety link");

  assert((await get("/api/health")).status === 200, "health");

  const spa = await get("/privacy");
  assert([200, 304].includes(spa.status), `/privacy status ${spa.status}`);
  assert(!spa.location || !spa.location.includes("/login"), "no login redirect");
  const html = spa.text.toLowerCase();
  assert(
    html.includes("<!doctype html") || html.includes("<html") || html.includes("root"),
    "serves html shell for /privacy",
  );

  const staticPrivacy = await get("/privacy.html");
  assert([200, 304].includes(staticPrivacy.status), `/privacy.html ${staticPrivacy.status}`);
  assert(staticPrivacy.text.includes("Last updated: July 21, 2026"), "static served date");

  console.log("PAGE-058 PRIVACY RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        publicRoute: true,
        outsideRequireAuth: true,
        fourteenSections: true,
        registerHandoff: true,
        legalHubHandoff: true,
        settingsHandoff: true,
        noPrivacyApi: true,
        spaDeepLink: true,
        staticArtifactSeparate: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-058 PRIVACY RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
