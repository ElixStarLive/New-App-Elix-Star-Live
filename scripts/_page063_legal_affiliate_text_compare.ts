import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_AFFILIATE_CONTACT,
  LEGAL_AFFILIATE_SECTION_TITLES,
  LEGAL_AFFILIATE_SECTIONS,
  LEGAL_AFFILIATE_TITLE,
} from "../src/content/legalAffiliate.ts";

const oldPath = resolve(process.cwd(), "../Elix Star Live/src/pages/LegalAffiliate.tsx");
const old = readFileSync(oldPath, "utf8");
const titles = [...old.matchAll(/Section title="([^"]+)"/g)].map((m) => m[1]);

let fail = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    fail += 1;
  }
}

check(LEGAL_AFFILIATE_TITLE === "Affiliate & Sponsored Content", "title");
check(old.includes('title="Affiliate & Sponsored Content"'), "OLD title");
check(titles.length === 4, `OLD title count ${titles.length}`);
check(LEGAL_AFFILIATE_SECTION_TITLES.length === 4, "NEW title count");
for (let i = 0; i < 4; i++) {
  check(
    titles[i] === LEGAL_AFFILIATE_SECTION_TITLES[i],
    `title ${i}: ${titles[i]} vs ${LEGAL_AFFILIATE_SECTION_TITLES[i]}`,
  );
}

check(LEGAL_AFFILIATE_CONTACT === "legal@elixstarlive.com", "contact");
check(old.includes("legal@elixstarlive.com"), "OLD contact");

function flatten(): string {
  const bits: string[] = [];
  for (const section of LEGAL_AFFILIATE_SECTIONS) {
    bits.push(section.title);
    bits.push(section.paragraph);
    if (section.contact) bits.push(`${LEGAL_AFFILIATE_CONTACT}.`);
    for (const bullet of section.bullets ?? []) bits.push(bullet);
  }
  return bits.join("\n");
}

const newFlat = flatten();
const markers = [
  "affiliate links, sponsored products, or paid partnerships",
  "Clearly disclose any paid partnerships or affiliate relationships",
  'Use appropriate labels (e.g. "Ad", "Sponsored", "Paid Partnership")',
  "UK Advertising Standards Authority (ASA)",
  "US Federal Trade Commission (FTC)",
  "Not promote illegal, misleading, or harmful products",
  "third-party brands and services",
  "in-app reporting feature",
  "legal@elixstarlive.com",
];

const oldNorm = old.replace(/<[^>]+>/g, "").replace(/\{\s*['"]|['"]\s*\}/g, "").replace(/\s+/g, " ");
for (const m of markers) {
  check(oldNorm.includes(m), `OLD has ${m}`);
  check(newFlat.includes(m), `NEW has ${m}`);
}

check(!newFlat.includes("commission rate"), "no invented commission");
check(!newFlat.includes("referral code"), "no referral code");
check(!newFlat.includes("/api/"), "no API");

console.log(fail === 0 ? "PAGE-063 TEXT COMPARE: PASS" : `PAGE-063 TEXT COMPARE: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
