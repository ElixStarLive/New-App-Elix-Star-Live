import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_UGC_DMCA_LABEL,
  LEGAL_UGC_DMCA_PATH,
  LEGAL_UGC_SECTION_TITLES,
  LEGAL_UGC_SECTIONS,
  LEGAL_UGC_TITLE,
} from "../src/content/legalUgc.ts";

const oldPath = resolve(process.cwd(), "../Elix Star Live/src/pages/LegalUGC.tsx");
const old = readFileSync(oldPath, "utf8");
const titles = [...old.matchAll(/Section title="([^"]+)"/g)].map((m) => m[1]);

let fail = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    fail += 1;
  }
}

check(LEGAL_UGC_TITLE === "User-Generated Content Policy", "title");
check(old.includes('title="User-Generated Content Policy"'), "OLD title");
check(titles.length === 6, `OLD title count ${titles.length}`);
check(LEGAL_UGC_SECTION_TITLES.length === 6, "NEW title count");
for (let i = 0; i < 6; i++) {
  check(titles[i] === LEGAL_UGC_SECTION_TITLES[i], `title ${i}: ${titles[i]} vs ${LEGAL_UGC_SECTION_TITLES[i]}`);
}

check(LEGAL_UGC_DMCA_PATH === "/legal/dmca", "dmca path");
check(LEGAL_UGC_DMCA_LABEL === "DMCA Policy", "dmca label");
check(old.includes("DMCA Policy"), "OLD dmca label");
check(old.includes("/legal/dmca"), "OLD dmca path");

function flatten(): string {
  const bits: string[] = [];
  for (const section of LEGAL_UGC_SECTIONS) {
    bits.push(section.title);
    for (const p of section.paragraphs) bits.push(p);
    if (section.dmcaLink) bits.push(`${LEGAL_UGC_DMCA_LABEL}.`);
    for (const b of section.bullets ?? []) bits.push(b);
  }
  return bits.join("\n");
}

const newFlat = flatten();
const markers = [
  "user-generated content (UGC) platform",
  "Elix Star Live Ltd",
  "You own or have all necessary rights to the content",
  "Community Guidelines and Terms of Service",
  "does not pre-screen, endorse, or verify",
  "worldwide, non-exclusive, royalty-free licence",
  "until you delete your content or account",
  "in-app reporting tools",
  "DMCA Policy",
  "safe harbour",
];

const oldNorm = old.replace(/<[^>]+>/g, "").replace(/\{\s*['"]|['"]\s*\}/g, "").replace(/\s+/g, " ");
for (const m of markers) {
  check(oldNorm.includes(m), `OLD has ${m}`);
  check(newFlat.includes(m), `NEW has ${m}`);
}

check(!newFlat.includes("/terms"), "no Terms route in SPA copy");
check(!newFlat.includes("/guidelines"), "no Guidelines route in SPA copy");
check(!newFlat.includes("/copyright"), "no Copyright route in SPA copy");
check(!newFlat.includes("/api/"), "no API");

console.log(fail === 0 ? "PAGE-062 TEXT COMPARE: PASS" : `PAGE-062 TEXT COMPARE: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
