/**
 * PAGE-057 runtime proof — public Terms route, legal text markers, handoffs, no auth wall.
 * Run: npx tsx scripts/_page057_terms_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_TERMS_SECTION_TITLES,
  LEGAL_TERMS_TITLE,
  LEGAL_TERMS_UPDATED_LABEL,
  legalTermsSections,
} from "../src/content/legalTerms.ts";

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";

async function get(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, { headers, redirect: "manual" });
  const text = await res.text();
  return { status: res.status, text, location: res.headers.get("location") };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

try {
  const page = readFileSync(resolve("src/pages/Terms.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/legalTerms.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const register = readFileSync(resolve("src/pages/Register.tsx"), "utf8");
  const legalHub = readFileSync(resolve("src/content/legalHub.ts"), "utf8");
  const settings = readFileSync(resolve("src/pages/Settings.tsx"), "utf8");
  const nav = readFileSync(resolve("src/lib/settingsNav.ts"), "utf8");
  const shell = readFileSync(resolve("src/lib/appShell.ts"), "utf8");

  assert(app.includes('path="/terms"') && app.includes("<Terms"), "spa route");
  const termsRouteIdx = app.indexOf('path="/terms"');
  const requireAuthIdx = app.indexOf("<Route element={<RequireAuth");
  assert(termsRouteIdx > 0 && termsRouteIdx < requireAuthIdx, "terms outside RequireAuth");
  assert(LEGAL_TERMS_TITLE === "Terms of Service", "title");
  assert(LEGAL_TERMS_UPDATED_LABEL === "Last updated: July 23, 2026", "date");
  assert(LEGAL_TERMS_SECTION_TITLES.length === 27, "27 sections");
  assert(legalTermsSections(false).length === 27, "sections fn");
  assert(page.includes("SettingsOptionSheet") && page.includes("legalTermsSections"), "page owner");
  assert(!page.includes("/api/terms") && !page.includes("acceptTerms"), "no terms API");
  assert(!content.includes("new Date("), "no invented date");
  assert(register.includes('to="/terms"') && register.includes('containerReturnState("/register")'), "register handoff");
  assert(legalHub.includes('path: "/terms"'), "legal hub handoff");
  assert(settings.includes('go("/terms")'), "settings handoff");
  assert(nav.includes('path === "/terms"'), "named exit");
  assert(shell.includes('pathname === "/terms"'), "public shell");

  const flat = JSON.stringify(legalTermsSections(false));
  for (const marker of [
    "You must be at least 13 years old.",
    "Elix Star Live Ltd",
    "Stripe only",
    "twelve (12) months",
    "dmca@elixstarlive.com",
    "England and Wales",
    "Digital coin purchases are final and non-refundable.",
  ]) {
    assert(flat.includes(marker), `marker ${marker}`);
  }

  assert((await get("/api/health")).status === 200, "health");

  // Public SPA deep-link: production hosts fall through to index.html for /terms.
  const spa = await get("/terms");
  assert([200, 304].includes(spa.status), `/terms status ${spa.status}`);
  assert(!spa.location || !spa.location.includes("/login"), "no login redirect");
  const html = spa.text.toLowerCase();
  assert(
    html.includes("<!doctype html") || html.includes("<html") || html.includes("root"),
    "serves html shell for /terms",
  );
  assert(!html.includes("unauthenticated") || html.includes("id=\"root\""), "not auth error json");

  // Static artifact remains separately hosted but is not the PAGE-057 SPA owner.
  const staticTerms = await get("/terms.html");
  assert([200, 304].includes(staticTerms.status), `/terms.html ${staticTerms.status}`);
  assert(staticTerms.text.includes("Last updated: July 23, 2026"), "static date");

  console.log("PAGE-057 TERMS RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        publicRoute: true,
        outsideRequireAuth: true,
        twentySevenSections: true,
        registerHandoff: true,
        legalHubHandoff: true,
        settingsHandoff: true,
        noTermsApi: true,
        spaDeepLink: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-057 TERMS RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
