import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_AUDIO_CONTACT,
  LEGAL_AUDIO_SECTION_TITLES,
  LEGAL_AUDIO_SECTIONS,
  LEGAL_AUDIO_TITLE,
} from "../src/content/legalAudio.ts";

const oldPath = resolve(process.cwd(), "../Elix Star Live/src/pages/LegalAudio.tsx");
const old = readFileSync(oldPath, "utf8");
const titles = [...old.matchAll(/Section title="([^"]+)"/g)].map((m) => m[1]);

let fail = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    fail += 1;
  }
}

check(LEGAL_AUDIO_TITLE === "Audio & Music Disclaimer", "title");
check(old.includes('title="Audio & Music Disclaimer"'), "OLD title");
check(titles.length === 5, `OLD title count ${titles.length}`);
check(LEGAL_AUDIO_SECTION_TITLES.length === 5, "NEW title count");
for (let i = 0; i < 5; i++) {
  check(titles[i] === LEGAL_AUDIO_SECTION_TITLES[i], `title ${i}: ${titles[i]} vs ${LEGAL_AUDIO_SECTION_TITLES[i]}`);
}

check(LEGAL_AUDIO_CONTACT === "legal@elixstarlive.com", "contact");
check(old.includes("legal@elixstarlive.com"), "OLD contact");

function flatten(): string {
  const bits: string[] = [];
  for (const section of LEGAL_AUDIO_SECTIONS) {
    bits.push(section.title);
    bits.push(section.paragraph);
    if (section.contact) bits.push(LEGAL_AUDIO_CONTACT);
    for (const bullet of section.bullets ?? []) {
      bits.push(`${bullet.emphasis ? `${bullet.emphasis} ` : ""}${bullet.text}`);
    }
  }
  return bits.join("\n");
}

const newFlat = flatten();
const markers = [
  "Audio used within Elix Star Live falls into the following categories:",
  "Original audio:",
  "User-generated audio:",
  "Licensed audio:",
  "royalty-free or commercial licences",
  "When uploading content that contains audio, you confirm that you either:",
  "Created the audio yourself (it is your original work)",
  "Creative Commons licence",
  "DMCA takedown notice",
  "Playing copyrighted music during live streams",
  "legal@elixstarlive.com",
];

const oldNorm = old.replace(/<[^>]+>/g, "").replace(/\{\s*['"]|['"]\s*\}/g, "").replace(/\s+/g, " ");
for (const m of markers) {
  check(oldNorm.includes(m), `OLD has ${m}`);
  check(newFlat.includes(m), `NEW has ${m}`);
}

check(!newFlat.includes("/copyright"), "no copyright link in SPA copy");
check(!newFlat.includes("/legal/dmca"), "no dmca route in SPA copy");
check(!newFlat.includes("/api/"), "no API");

console.log(fail === 0 ? "PAGE-061 TEXT COMPARE: PASS" : `PAGE-061 TEXT COMPARE: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
