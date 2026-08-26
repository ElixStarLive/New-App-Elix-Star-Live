import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_SAFETY_CONTACT,
  LEGAL_SAFETY_INTRO,
  LEGAL_SAFETY_SECTION_TITLES,
  LEGAL_SAFETY_SECTIONS,
  LEGAL_SAFETY_TITLE,
} from "../src/content/legalSafety.ts";

const oldPath = resolve(process.cwd(), "../Elix Star Live/src/pages/LegalSafety.tsx");
const old = readFileSync(oldPath, "utf8");
const titles = [...old.matchAll(/Section title="([^"]+)"/g)].map((m) => m[1]);

let fail = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    fail += 1;
  }
}

check(LEGAL_SAFETY_TITLE === "Safety Centre", "title");
check(old.includes('title="Safety Centre"'), "OLD title");
check(titles.length === 7, `OLD title count ${titles.length}`);
check(LEGAL_SAFETY_SECTION_TITLES.length === 7, "NEW title count");
for (let i = 0; i < 7; i++) {
  check(titles[i] === LEGAL_SAFETY_SECTION_TITLES[i], `title ${i}: ${titles[i]} vs ${LEGAL_SAFETY_SECTION_TITLES[i]}`);
}

check(LEGAL_SAFETY_CONTACT === "safety@elixstarlive.com", "contact");
check(old.includes("safety@elixstarlive.com"), "OLD contact");

function flatten(): string {
  const bits: string[] = [LEGAL_SAFETY_INTRO];
  for (const section of LEGAL_SAFETY_SECTIONS) {
    bits.push(section.title);
    if (section.paragraph) bits.push(section.paragraph);
    if (section.contact) bits.push(LEGAL_SAFETY_CONTACT);
    for (const bullet of section.bullets ?? []) {
      bits.push(`${bullet.emphasis ? `${bullet.emphasis} ` : ""}${bullet.text}`);
    }
  }
  return bits.join("\n");
}

const newFlat = flatten();
const markers = [
  "safe and respectful environment",
  "report it directly from any video, live stream, profile, or message",
  "Settings → Blocked Accounts",
  "Viewers can report live streams in real time",
  "Nudity and sexual content",
  "Harassment and bullying",
  "not intended for users under 13",
  "reported to relevant authorities",
  "999 (Emergency) or 116 123 (Samaritans)",
  "911 (Emergency) or 988 (Suicide & Crisis Lifeline)",
  "112 (Emergency)",
  "safety@elixstarlive.com",
];

const oldNorm = old.replace(/<[^>]+>/g, "").replace(/\{\s*['"]|['"]\s*\}/g, "").replace(/\s+/g, " ");
for (const m of markers) {
  check(oldNorm.includes(m), `OLD has ${m}`);
  check(newFlat.includes(m), `NEW has ${m}`);
}

check(!newFlat.includes("child-safety.html"), "SPA does not own child-safety.html");
check(!newFlat.includes("/api/"), "no API");
check(!newFlat.includes("/settings/safety"), "no Safety Center route in SPA copy");

console.log(fail === 0 ? "PAGE-065 TEXT COMPARE: PASS" : `PAGE-065 TEXT COMPARE: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
