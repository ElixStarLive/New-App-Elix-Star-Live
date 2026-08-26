import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_PRIVACY_INTRO,
  LEGAL_PRIVACY_SECTION_TITLES,
  LEGAL_PRIVACY_SECTIONS,
  LEGAL_PRIVACY_UPDATED_LABEL,
  type PrivacyPart,
} from "../src/content/legalPrivacy.ts";

const oldPath = resolve(process.cwd(), "../Elix Star Live/src/pages/Privacy.tsx");
const old = readFileSync(oldPath, "utf8");
const titles = [...old.matchAll(/Section title="([^"]+)"/g)].map((m) => m[1]);

let fail = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    fail += 1;
  }
}

check(titles.length === 14, `OLD title count ${titles.length}`);
check(LEGAL_PRIVACY_SECTION_TITLES.length === 14, "NEW title count");
for (let i = 0; i < 14; i++) {
  check(
    titles[i] === LEGAL_PRIVACY_SECTION_TITLES[i],
    `title ${i}: ${titles[i]} vs ${LEGAL_PRIVACY_SECTION_TITLES[i]}`,
  );
}
check(LEGAL_PRIVACY_UPDATED_LABEL === "Last updated: February 20, 2026", "date");
check(old.includes("Last updated: February 20, 2026"), "OLD date");

function flatParts(parts: readonly PrivacyPart[]): string {
  return parts.map((p) => (typeof p === "string" ? p : "em" in p ? p.em : p.strong)).join("");
}

function flatten(): string {
  const bits: string[] = [flatParts(LEGAL_PRIVACY_INTRO)];
  for (const section of LEGAL_PRIVACY_SECTIONS) {
    bits.push(section.title);
    for (const block of section.blocks) {
      if (block.kind === "subhead") bits.push(block.text);
      else if (block.kind === "ul") {
        for (const item of block.items) bits.push(flatParts(item));
      } else {
        bits.push(flatParts(block.parts));
      }
    }
  }
  return bits.join("\n");
}

const newFlat = flatten();
const markers = [
  'Elix Star Live Ltd ("we", "us", "our"), registered in England and Wales',
  "Email address",
  "Password (securely hashed — we never store plain-text passwords)",
  "Apple In-App Purchase, Google Play Billing, or Stripe",
  "We do not sell your personal data",
  "within 30 days",
  "up to 7 years",
  "Settings → Delete Account",
  "Information Commissioner's Office (ICO)",
  "children under 13",
  "hashed passwords (bcrypt)",
  "Data Protection Officer",
  "Standard Contractual Clauses",
  "third-party advertising trackers",
  "England and Wales",
];

const oldNorm = old.replace(/<[^>]+>/g, "").replace(/\{\s*['"]|['"]\s*\}/g, "").replace(/\s+/g, " ");
for (const m of markers) {
  check(oldNorm.includes(m), `OLD has ${m}`);
  check(newFlat.includes(m), `NEW has ${m}`);
}

check(!newFlat.includes("privacy.html"), "SPA does not reference privacy.html");
check(!newFlat.includes("delete-account.html"), "SPA delete wording matches in-app Settings path");
check(!newFlat.includes("child-safety.html"), "SPA children section has no static child-safety link");

console.log(fail === 0 ? "PAGE-058 TEXT COMPARE: PASS" : `PAGE-058 TEXT COMPARE: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
