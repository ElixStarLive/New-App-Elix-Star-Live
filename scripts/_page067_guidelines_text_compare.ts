import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GUIDELINES_INTRO,
  GUIDELINES_REPORT_INTRO,
  GUIDELINES_REPORT_LABEL,
  GUIDELINES_SECTIONS,
  GUIDELINES_SECTION_TITLES,
  GUIDELINES_SETTINGS_LABEL,
  GUIDELINES_TITLE,
  GUIDELINES_UPDATED,
} from "../src/content/guidelines.ts";

const oldPath = resolve(process.cwd(), "../Elix Star Live/src/pages/Guidelines.tsx");
const old = readFileSync(oldPath, "utf8");

let fail = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    fail += 1;
  }
}

check(GUIDELINES_TITLE === "Community Guidelines", "title");
check(old.includes('title="Community Guidelines"'), "OLD title");
check(GUIDELINES_UPDATED === "Last updated: February 4, 2026", "date");
check(old.includes("Last updated: February 4, 2026"), "OLD date");
check(GUIDELINES_SECTION_TITLES.length === 6, "six sections");

const oldTitles = [
  "Be Kind and Respectful",
  "Keep Content Safe",
  "Be Authentic",
  "Respect Intellectual Property",
  "No Illegal Activities",
  "Consequences",
];
for (let i = 0; i < 6; i++) {
  check(GUIDELINES_SECTION_TITLES[i] === oldTitles[i], `title ${i}`);
  check(old.includes(`title="${oldTitles[i]}"`), `OLD has ${oldTitles[i]}`);
}

check(GUIDELINES_INTRO.includes("Elix Star is built on creativity"), "intro");
check(GUIDELINES_REPORT_LABEL === "Report a Violation", "report label");
check(GUIDELINES_SETTINGS_LABEL === "Go to Settings", "settings label");
check(old.includes("Report a Violation"), "OLD report");
check(old.includes("Go to Settings"), "OLD settings");
check(old.includes("navigate('/report'"), "OLD report path");

function flatten(): string {
  const bits: string[] = [GUIDELINES_UPDATED, GUIDELINES_INTRO];
  for (const section of GUIDELINES_SECTIONS) {
    bits.push(section.title, section.paragraph, ...section.bullets);
  }
  bits.push(GUIDELINES_REPORT_INTRO, GUIDELINES_REPORT_LABEL, GUIDELINES_SETTINGS_LABEL);
  return bits.join("\n");
}

const newFlat = flatten();
const markers = [
  "Last updated: February 4, 2026",
  "Elix Star is built on creativity, respect, and authenticity",
  "No targeted harassment or bullying",
  "No hate speech based on race, religion, gender, etc.",
  "No sexual or adult content",
  "No content involving minors in inappropriate situations",
  "Don't impersonate others",
  "Don't engage in spam or manipulation",
  "Don't post copyrighted content without permission",
  "No promotion of illegal drugs",
  "No fraudulent schemes or scams",
  "Content removal",
  "Temporary account suspension",
  "Permanent account ban",
  "Reporting to law enforcement (for serious violations)",
  "please report it",
  "Report a Violation",
  "Go to Settings",
];

for (const m of markers) {
  check(old.includes(m), `OLD has ${m}`);
  check(newFlat.includes(m), `NEW has ${m}`);
}

check(!newFlat.includes("community-guidelines.html"), "no static html ref");
check(!newFlat.includes("/api/"), "no API");
check(!old.includes('href="/legal/safety"'), "OLD has no safety policy link");
check(!old.includes('href="/legal/ugc"'), "OLD has no ugc link");
check(!old.includes('href="/support"'), "OLD has no support link");

console.log(fail === 0 ? "PAGE-067 TEXT COMPARE: PASS" : `PAGE-067 TEXT COMPARE: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
