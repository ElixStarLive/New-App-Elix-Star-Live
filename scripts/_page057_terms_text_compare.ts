import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_TERMS_SECTION_TITLES,
  LEGAL_TERMS_UPDATED_LABEL,
  legalTermsSections,
} from "../src/content/legalTerms.ts";

const oldPath = resolve(process.cwd(), "../Elix Star Live/src/pages/Terms.tsx");
const old = readFileSync(oldPath, "utf8");
const titles = [...old.matchAll(/Section title="([^"]+)"/g)].map((m) => m[1]);

let fail = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    fail += 1;
  }
}

check(titles.length === 27, `OLD title count ${titles.length}`);
check(LEGAL_TERMS_SECTION_TITLES.length === 27, "NEW title count");
for (let i = 0; i < 27; i++) {
  check(titles[i] === LEGAL_TERMS_SECTION_TITLES[i], `title ${i}: ${titles[i]} vs ${LEGAL_TERMS_SECTION_TITLES[i]}`);
}
check(LEGAL_TERMS_UPDATED_LABEL === "Last updated: July 23, 2026", "date");
check(old.includes("Last updated: July 23, 2026"), "OLD date");

function flatten(isIOS: boolean): string {
  const sections = legalTermsSections(isIOS);
  const bits: string[] = [];
  for (const section of sections) {
    bits.push(section.title);
    for (const block of section.blocks) {
      if (block.kind === "ul") {
        for (const item of block.items) {
          bits.push(item.map((p) => (typeof p === "string" ? p : "em" in p ? p.em : p.strong)).join(""));
        }
      } else {
        bits.push(block.parts.map((p) => (typeof p === "string" ? p : "em" in p ? p.em : p.strong)).join(""));
      }
    }
  }
  return bits.join("\n");
}

const newFlat = flatten(false);
const markers = [
  "You must be at least 13 years old.",
  "Shop checkout uses Stripe only",
  "Digital coin purchases are final and non-refundable.",
  "twelve (12) months",
  "dmca@elixstarlive.com",
  "England and Wales",
  "supplier-agreement.html",
  "support@elixstarlive.co.uk",
  "Coins are purchased through Apple In-App Purchase (iOS) or Google Play Billing (Android).",
  "Elix Star Live Ltd",
];
const oldNorm = old.replace(/<[^>]+>/g, "").replace(/\{\s*['"]|['"]\s*\}/g, "").replace(/\s+/g, " ");
for (const m of markers) {
  check(oldNorm.includes(m), `OLD has ${m}`);
  check(newFlat.includes(m), `NEW has ${m}`);
}

const iosLine = "Coins are purchased through the App Store (in-app purchase).";
check(flatten(true).includes(iosLine), "iOS coin line");
check(!flatten(true).includes("Google Play Billing (Android)"), "iOS does not use Android coin line");

console.log(fail === 0 ? "PAGE-057 TEXT COMPARE: PASS" : `PAGE-057 TEXT COMPARE: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
