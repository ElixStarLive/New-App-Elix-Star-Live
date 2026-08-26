import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_DMCA_CONTACT,
  LEGAL_DMCA_INTRO,
  LEGAL_DMCA_MAILTO_HREF,
  LEGAL_DMCA_MAILTO_LABEL,
  LEGAL_DMCA_SECTION_TITLES,
  LEGAL_DMCA_SECTIONS,
  LEGAL_DMCA_TITLE,
} from "../src/content/legalDmca.ts";

const oldPath = resolve(process.cwd(), "../Elix Star Live/src/pages/LegalDMCA.tsx");
const old = readFileSync(oldPath, "utf8");
const titles = [...old.matchAll(/Section title="([^"]+)"/g)].map((m) => m[1]);

let fail = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    fail += 1;
  }
}

check(LEGAL_DMCA_TITLE === "DMCA / Copyright Policy", "title");
check(old.includes('title="DMCA / Copyright Policy"'), "OLD title");
check(titles.length === 4, `OLD title count ${titles.length}`);
check(LEGAL_DMCA_SECTION_TITLES.length === 4, "NEW title count");
for (let i = 0; i < 4; i++) {
  check(titles[i] === LEGAL_DMCA_SECTION_TITLES[i], `title ${i}: ${titles[i]} vs ${LEGAL_DMCA_SECTION_TITLES[i]}`);
}

check(LEGAL_DMCA_CONTACT === "dmca@elixstarlive.com", "contact");
check(LEGAL_DMCA_MAILTO_LABEL === "Email DMCA Agent", "mailto label");
check(
  LEGAL_DMCA_MAILTO_HREF === "mailto:dmca@elixstarlive.com?subject=DMCA%20Notice%20-%20ElixStarLive",
  "mailto href",
);
check(old.includes("dmca@elixstarlive.com"), "OLD contact");
check(old.includes("Email DMCA Agent"), "OLD mailto label");

function flatten(): string {
  const bits: string[] = [LEGAL_DMCA_INTRO];
  for (const section of LEGAL_DMCA_SECTIONS) {
    bits.push(section.title);
    bits.push(section.paragraph);
    if (section.contact) bits.push(LEGAL_DMCA_CONTACT);
    if (section.mailto) bits.push(LEGAL_DMCA_MAILTO_LABEL);
    for (const bullet of section.bullets ?? []) bits.push(bullet);
  }
  return bits.join("\n");
}

const newFlat = flatten();
const markers = [
  "Digital Millennium Copyright Act (DMCA)",
  "equivalent UK/EU copyright regulations",
  "Your full legal name and contact information (email, phone, address)",
  "A description of the copyrighted work that has been infringed",
  "The URL or location of the infringing content on our platform",
  "good faith belief the use is not authorised",
  "under penalty of perjury",
  "Your physical or electronic signature",
  "Consent to the jurisdiction of the courts in your area",
  "repeat copyright infringers",
  "dmca@elixstarlive.com",
  "Email DMCA Agent",
];

const oldNorm = old.replace(/<[^>]+>/g, "").replace(/\{\s*['"]|['"]\s*\}/g, "").replace(/\s+/g, " ");
for (const m of markers) {
  check(oldNorm.includes(m), `OLD has ${m}`);
  check(newFlat.includes(m), `NEW has ${m}`);
}

check(!newFlat.includes("/api/"), "no API");
check(!newFlat.includes("submitted successfully"), "no fake success");

console.log(fail === 0 ? "PAGE-064 TEXT COMPARE: PASS" : `PAGE-064 TEXT COMPARE: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
