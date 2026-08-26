import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_COPYRIGHT_CONTACT,
  LEGAL_COPYRIGHT_DMCA_LABEL,
  LEGAL_COPYRIGHT_DMCA_PATH,
  LEGAL_COPYRIGHT_NOTICE,
  LEGAL_COPYRIGHT_SECTION_TITLES,
  LEGAL_COPYRIGHT_SECTIONS,
} from "../src/content/legalCopyright.ts";

const oldPath = resolve(process.cwd(), "../Elix Star Live/src/pages/Copyright.tsx");
const old = readFileSync(oldPath, "utf8");
const titles = [...old.matchAll(/Section title="([^"]+)"/g)].map((m) => m[1]);

let fail = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    fail += 1;
  }
}

check(titles.length === 5, `OLD title count ${titles.length}`);
check(LEGAL_COPYRIGHT_SECTION_TITLES.length === 5, "NEW title count");
for (let i = 0; i < 5; i++) {
  check(
    titles[i] === LEGAL_COPYRIGHT_SECTION_TITLES[i],
    `title ${i}: ${titles[i]} vs ${LEGAL_COPYRIGHT_SECTION_TITLES[i]}`,
  );
}

check(LEGAL_COPYRIGHT_NOTICE === "© 2026 Elix Star Live Ltd. All rights reserved.", "notice");
check(old.includes("© 2026 Elix Star Live Ltd. All rights reserved."), "OLD notice");
check(LEGAL_COPYRIGHT_DMCA_PATH === "/legal/dmca", "dmca path");
check(LEGAL_COPYRIGHT_DMCA_LABEL === "DMCA Policy", "dmca label");
check(LEGAL_COPYRIGHT_CONTACT === "dmca@elixstarlive.com", "contact");

const newFlat = [
  LEGAL_COPYRIGHT_NOTICE,
  ...LEGAL_COPYRIGHT_SECTIONS.map((s) => {
    const link = s.dmcaLink ? `${LEGAL_COPYRIGHT_DMCA_LABEL}${s.afterLink ?? ""}${LEGAL_COPYRIGHT_CONTACT}.` : "";
    return `${s.title}\n${s.paragraph}${link}`;
  }),
].join("\n");

const markers = [
  "© 2026 Elix Star Live Ltd. All rights reserved.",
  "All app content, design, branding, logos, software code",
  "Users retain ownership of the content they create and upload",
  "worldwide, non-exclusive, royalty-free licence",
  "does not claim ownership of user-generated content",
  '"Elix Star Live", the Elix Star Live logo',
  "DMCA Policy",
  "dmca@elixstarlive.com",
  "without authorisation",
];

const oldNorm = old.replace(/<[^>]+>/g, "").replace(/\{\s*['"]|['"]\s*\}/g, "").replace(/\s+/g, " ");
for (const m of markers) {
  check(oldNorm.includes(m), `OLD has ${m}`);
  check(newFlat.includes(m), `NEW has ${m}`);
}

check(!newFlat.includes("copyright.html"), "no static copyright.html owner in SPA copy");
check(!newFlat.includes("/api/copyright"), "no copyright API");

console.log(fail === 0 ? "PAGE-059 TEXT COMPARE: PASS" : `PAGE-059 TEXT COMPARE: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
