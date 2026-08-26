import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_SUPPLIER_BUSINESS,
  LEGAL_SUPPLIER_COMPANY,
  LEGAL_SUPPLIER_SECTION_TITLES,
  LEGAL_SUPPLIER_SECTIONS,
  LEGAL_SUPPLIER_SUPPORT,
  LEGAL_SUPPLIER_TITLE,
  LEGAL_SUPPLIER_UPDATED,
} from "../src/content/legalSupplier.ts";

const oldPath = resolve(process.cwd(), "../Elix Star Live/src/pages/LegalSupplier.tsx");
const old = readFileSync(oldPath, "utf8");
const titles = [...old.matchAll(/Section title="([^"]+)"/g)].map((m) => m[1]);

let fail = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    fail += 1;
  }
}

check(LEGAL_SUPPLIER_TITLE === "Supplier Agreement", "title");
check(old.includes('title="Supplier Agreement"'), "OLD title");
check(LEGAL_SUPPLIER_UPDATED === "Last updated: July 15, 2026", "date");
check(old.includes("Last updated: July 15, 2026"), "OLD date");
check(titles.length === 11, `OLD title count ${titles.length}`);
check(LEGAL_SUPPLIER_SECTION_TITLES.length === 11, "NEW title count");
for (let i = 0; i < 11; i++) {
  check(titles[i] === LEGAL_SUPPLIER_SECTION_TITLES[i], `title ${i}: ${titles[i]} vs ${LEGAL_SUPPLIER_SECTION_TITLES[i]}`);
}

check(LEGAL_SUPPLIER_COMPANY === "Elix Star Live Ltd", "company");
check(LEGAL_SUPPLIER_BUSINESS === "info@elixstarlive.co.uk", "business");
check(LEGAL_SUPPLIER_SUPPORT === "support@elixstarlive.co.uk", "support");

function flatten(): string {
  const bits: string[] = [LEGAL_SUPPLIER_UPDATED];
  for (const section of LEGAL_SUPPLIER_SECTIONS) {
    bits.push(section.title);
    for (const p of section.paragraphs ?? []) bits.push(p.text);
    for (const b of section.bullets ?? []) {
      bits.push(b.text ?? `${b.label} ${b.value}`);
    }
    if (section.footer) bits.push(section.footer);
  }
  return bits.join("\n");
}

const newFlat = flatten();
const markers = [
  "Last updated: July 15, 2026",
  "Elix Star Live Ltd",
  "buy-only for end users",
  "Incoterms",
  "product safety, labelling, chemicals",
  "non-exclusive licence",
  "Net 30",
  "VAT/tax details",
  "confidential commercial information",
  "You indemnify us against claims",
  "England and Wales",
  "info@elixstarlive.co.uk",
  "support@elixstarlive.co.uk",
  "signed purchase order or commercial schedule",
];

const oldNorm = old
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/<[^>]+>/g, "")
  .replace(/\{\s*['"]|['"]\s*\}/g, "")
  .replace(/\s+/g, " ");
for (const m of markers) {
  check(oldNorm.includes(m), `OLD has ${m}`);
  check(newFlat.includes(m), `NEW has ${m}`);
}

check(!newFlat.includes("supplier-agreement.html"), "SPA does not reference static html");
check(!newFlat.includes("/api/"), "no API");

console.log(fail === 0 ? "PAGE-066 TEXT COMPARE: PASS" : `PAGE-066 TEXT COMPARE: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
