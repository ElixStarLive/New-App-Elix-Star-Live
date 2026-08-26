/**
 * PAGE-066 runtime proof — public Legal Supplier route, Legal Hub handoff, static artifact separate.
 * Run: npx tsx scripts/_page066_legal_supplier_runtime_proof.ts
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_SUPPLIER_SECTION_TITLES,
  LEGAL_SUPPLIER_SECTIONS,
  LEGAL_SUPPLIER_TITLE,
  LEGAL_SUPPLIER_UPDATED,
} from "../src/content/legalSupplier.ts";

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
  const page = readFileSync(resolve("src/pages/LegalSupplier.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/legalSupplier.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const legalHub = readFileSync(resolve("src/content/legalHub.ts"), "utf8");
  const nav = readFileSync(resolve("src/lib/settingsNav.ts"), "utf8");
  const shell = readFileSync(resolve("src/lib/appShell.ts"), "utf8");
  const terms = readFileSync(resolve("src/pages/Terms.tsx"), "utf8");
  const privacy = readFileSync(resolve("src/pages/Privacy.tsx"), "utf8");
  const legal = readFileSync(resolve("src/pages/Legal.tsx"), "utf8");
  const safety = readFileSync(resolve("src/pages/LegalSafety.tsx"), "utf8");
  const dmca = readFileSync(resolve("src/pages/LegalDMCA.tsx"), "utf8");

  assert(app.includes('path="/legal/supplier"') && app.includes("<LegalSupplier"), "spa route");
  const supplierRouteIdx = app.indexOf('path="/legal/supplier"');
  const requireAuthIdx = app.indexOf("<Route element={<RequireAuth");
  assert(supplierRouteIdx > 0 && supplierRouteIdx < requireAuthIdx, "supplier outside RequireAuth");
  assert(LEGAL_SUPPLIER_TITLE === "Supplier Agreement", "title");
  assert(LEGAL_SUPPLIER_UPDATED === "Last updated: July 15, 2026", "date");
  assert(LEGAL_SUPPLIER_SECTION_TITLES.length === 11, "11 sections");
  assert(LEGAL_SUPPLIER_SECTIONS.length === 11, "sections array");
  assert(page.includes("SettingsOptionSheet") && page.includes("LEGAL_SUPPLIER_SECTIONS"), "page owner");
  assert(page.includes("exitToFromLocationState"), "named return");
  assert(!page.includes("/api/supplier") && !page.includes("<form"), "no supplier API/form");
  assert(!page.includes('href="/terms"') && !page.includes('href="/support"'), "no invented links");
  assert(!content.includes("new Date("), "no invented date");
  assert(legalHub.includes('path: "/legal/supplier"'), "legal hub handoff");
  assert(nav.includes("path.startsWith(`${LEGAL_HOME}/`)"), "named exit under /legal/");
  assert(shell.includes('pathname.startsWith("/legal/")'), "public shell under /legal/");
  assert(existsSync(resolve("public/supplier-agreement.html")), "static artifact exists");

  const flat = JSON.stringify(LEGAL_SUPPLIER_SECTIONS);
  for (const marker of [
    "buy-only for end users",
    "Net 30",
    "England and Wales",
    "You indemnify us",
    "info@elixstarlive.co.uk",
  ]) {
    assert(flat.includes(marker), `marker ${marker}`);
  }

  assert(terms.includes("LEGAL_TERMS_TITLE") && !terms.includes("LEGAL_SUPPLIER_SECTIONS"), "terms intact");
  assert(privacy.includes("LEGAL_PRIVACY_TITLE") && !privacy.includes("LEGAL_SUPPLIER_SECTIONS"), "privacy intact");
  assert(legal.includes("LEGAL_HUB_ITEMS") && !legal.includes("LEGAL_SUPPLIER_SECTIONS"), "hub intact");
  assert(safety.includes("LEGAL_SAFETY_TITLE") && !safety.includes("LEGAL_SUPPLIER_SECTIONS"), "safety intact");
  assert(dmca.includes("LEGAL_DMCA_TITLE") && !dmca.includes("LEGAL_SUPPLIER_SECTIONS"), "dmca intact");

  assert((await get("/api/health")).status === 200, "health");

  const spa = await get("/legal/supplier");
  assert([200, 304].includes(spa.status), `/legal/supplier status ${spa.status}`);
  assert(!spa.location || !spa.location.includes("/login"), "no login redirect");
  const html = spa.text.toLowerCase();
  assert(
    html.includes("<!doctype html") || html.includes("<html") || html.includes("root"),
    "serves html shell for /legal/supplier",
  );

  const staticDoc = await get("/supplier-agreement.html");
  assert([200, 304].includes(staticDoc.status), `/supplier-agreement.html ${staticDoc.status}`);
  assert(staticDoc.text.includes("Last updated: July 15, 2026"), "static date");

  const hub = await get("/legal");
  assert([200, 304].includes(hub.status), `/legal status ${hub.status}`);

  console.log("PAGE-066 LEGAL SUPPLIER RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        publicRoute: true,
        outsideRequireAuth: true,
        elevenSections: true,
        legalHubHandoff: true,
        noSupplierApi: true,
        staticArtifactSeparate: true,
        spaDeepLink: true,
        priorLegalPagesIntact: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-066 LEGAL SUPPLIER RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
