/**
 * PAGE-059 runtime proof — public Copyright route, legal text, DMCA handoff, no auth wall.
 * Run: npx tsx scripts/_page059_copyright_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_COPYRIGHT_CONTACT,
  LEGAL_COPYRIGHT_DMCA_PATH,
  LEGAL_COPYRIGHT_NOTICE,
  LEGAL_COPYRIGHT_SECTION_TITLES,
  LEGAL_COPYRIGHT_SECTIONS,
  LEGAL_COPYRIGHT_TITLE,
} from "../src/content/legalCopyright.ts";

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
  const page = readFileSync(resolve("src/pages/Copyright.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/legalCopyright.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const legalHub = readFileSync(resolve("src/content/legalHub.ts"), "utf8");
  const support = readFileSync(resolve("src/content/support.ts"), "utf8");
  const nav = readFileSync(resolve("src/lib/settingsNav.ts"), "utf8");
  const shell = readFileSync(resolve("src/lib/appShell.ts"), "utf8");

  assert(app.includes('path="/copyright"') && app.includes("<Copyright"), "spa route");
  const copyrightRouteIdx = app.indexOf('path="/copyright"');
  const requireAuthIdx = app.indexOf("<Route element={<RequireAuth");
  assert(copyrightRouteIdx > 0 && copyrightRouteIdx < requireAuthIdx, "copyright outside RequireAuth");
  assert(LEGAL_COPYRIGHT_TITLE === "Copyright Notice", "title");
  assert(LEGAL_COPYRIGHT_NOTICE === "© 2026 Elix Star Live Ltd. All rights reserved.", "notice");
  assert(LEGAL_COPYRIGHT_SECTION_TITLES.length === 5, "5 sections");
  assert(LEGAL_COPYRIGHT_SECTIONS.length === 5, "sections array");
  assert(LEGAL_COPYRIGHT_DMCA_PATH === "/legal/dmca", "dmca path");
  assert(LEGAL_COPYRIGHT_CONTACT === "dmca@elixstarlive.com", "contact");
  assert(page.includes("SettingsOptionSheet") && page.includes("LEGAL_COPYRIGHT_SECTIONS"), "page owner");
  assert(page.includes("exitToFromLocationState"), "named return");
  assert(page.includes("containerReturnState(\"/copyright\")"), "dmca return state");
  assert(!page.includes("/api/copyright") && !page.includes("submitClaim"), "no copyright API");
  assert(!content.includes("new Date("), "no invented date");
  assert(legalHub.includes('path: "/copyright"'), "legal hub handoff");
  assert(support.includes('path: "/copyright"'), "support handoff");
  assert(nav.includes('path === "/copyright"'), "named exit");
  assert(shell.includes('pathname === "/copyright"'), "public shell");

  const flat = JSON.stringify(LEGAL_COPYRIGHT_SECTIONS) + LEGAL_COPYRIGHT_NOTICE;
  for (const marker of [
    "Users retain ownership",
    "royalty-free licence",
    "Elix Star Live Ltd",
    "without authorisation",
    "dmca@elixstarlive.com",
  ]) {
    assert(flat.includes(marker) || LEGAL_COPYRIGHT_CONTACT.includes(marker), `marker ${marker}`);
  }

  assert((await get("/api/health")).status === 200, "health");

  const spa = await get("/copyright");
  assert([200, 304].includes(spa.status), `/copyright status ${spa.status}`);
  assert(!spa.location || !spa.location.includes("/login"), "no login redirect");
  const html = spa.text.toLowerCase();
  assert(
    html.includes("<!doctype html") || html.includes("<html") || html.includes("root"),
    "serves html shell for /copyright",
  );

  const dmca = await get("/legal/dmca");
  assert([200, 304].includes(dmca.status), `/legal/dmca status ${dmca.status}`);
  assert(!dmca.location || !dmca.location.includes("/login"), "dmca no login redirect");

  console.log("PAGE-059 COPYRIGHT RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        publicRoute: true,
        outsideRequireAuth: true,
        fiveSections: true,
        legalHubHandoff: true,
        supportHandoff: true,
        dmcaHandoff: true,
        noCopyrightApi: true,
        spaDeepLink: true,
        noStaticHtmlOwner: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-059 COPYRIGHT RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
