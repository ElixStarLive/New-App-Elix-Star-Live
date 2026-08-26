import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HOW_IT_WORKS_ENGAGEMENT_LABEL,
  HOW_IT_WORKS_GUIDELINES_LABEL,
  HOW_IT_WORKS_INTRO,
  HOW_IT_WORKS_SECTIONS,
  HOW_IT_WORKS_SECTION_TITLES,
  HOW_IT_WORKS_SUPPORT_LABEL,
  HOW_IT_WORKS_TITLE,
  HOW_IT_WORKS_UPDATED,
  howItWorksBulletText,
  howItWorksParagraphText,
} from "../src/content/howItWorks.ts";

const oldPath = resolve(process.cwd(), "../Elix Star Live/src/pages/HowItWorks.tsx");
const old = readFileSync(oldPath, "utf8");

let fail = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    fail += 1;
  }
}

check(HOW_IT_WORKS_TITLE === "How the app works", "title");
check(old.includes('title="How the app works"'), "OLD title");
check(HOW_IT_WORKS_UPDATED === "Full guide for fans and creators. Last updated: August 5, 2026", "date");
check(old.includes("Last updated: August 5, 2026"), "OLD date");
check(HOW_IT_WORKS_SECTION_TITLES.length === 11, "11 sections");

const oldTitles = [
  "Main tabs",
  "Videos, sound & duets",
  "Going LIVE & watching",
  "Battles (PK)",
  "Gifts, coins & shop",
  "Creator monetisation (how you earn)",
  "Engagement Hub",
  "Ranking & membership",
  "Social & inbox",
  "Safety & account",
  "Quick tips",
];
for (let i = 0; i < 11; i++) {
  check(HOW_IT_WORKS_SECTION_TITLES[i] === oldTitles[i], `title ${i}`);
  check(old.includes(`title="${oldTitles[i]}"`), `OLD has ${oldTitles[i]}`);
}

check(HOW_IT_WORKS_INTRO.includes("without mixing fake test coins into real money"), "intro");
check(HOW_IT_WORKS_ENGAGEMENT_LABEL === "Open Engagement Hub", "engagement CTA");
check(HOW_IT_WORKS_SUPPORT_LABEL === "Help & Support", "support CTA");
check(HOW_IT_WORKS_GUIDELINES_LABEL === "Community Guidelines", "guidelines CTA");
check(old.includes("Open Engagement Hub"), "OLD engagement");
check(old.includes("Help &amp; Support") || old.includes("Help & Support"), "OLD support");
check(old.includes("Community Guidelines"), "OLD guidelines");
check(old.includes("navigate('/engagement'"), "OLD engagement path");
check(old.includes("navigate('/support'"), "OLD support path");
check(old.includes("navigate('/guidelines'"), "OLD guidelines path");

function flatten(): string {
  const bits: string[] = [HOW_IT_WORKS_UPDATED, HOW_IT_WORKS_INTRO];
  for (const section of HOW_IT_WORKS_SECTIONS) {
    bits.push(section.title);
    for (const p of section.paragraphs ?? []) bits.push(howItWorksParagraphText(p));
    for (const b of section.bullets ?? []) bits.push(howItWorksBulletText(b));
    if (section.footer) bits.push(section.footer);
  }
  bits.push(HOW_IT_WORKS_ENGAGEMENT_LABEL, HOW_IT_WORKS_SUPPORT_LABEL, HOW_IT_WORKS_GUIDELINES_LABEL);
  return bits.join("\n");
}

const newFlat = flatten();
const markers = [
  "Last updated: August 5, 2026",
  "Home / For You",
  "Live Discover",
  "Add sound",
  "Split",
  "On top",
  "Start LIVE",
  "Co-host",
  "Battle Energy",
  "Coins (in the app)",
  "Google Play / Apple",
  "Stripe",
  "Test coins",
  "60% of eligible net gift and creator-subscription revenue",
  "Promote Video",
  "qualified unique views",
  "£1,000 maximum",
  "Treasure Hunt",
  "Reward Wallet",
  "Diamond League",
  "Top 99 / Weekly Ranking",
  "Rising Stars",
  "Blocked accounts",
  "Safety Center",
  "Open Engagement Hub",
  "Help & Support",
  "Community Guidelines",
];

const oldNorm = old.replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/\s+/g, " ");
for (const m of markers) {
  check(oldNorm.includes(m), `OLD has ${m}`);
  check(newFlat.includes(m), `NEW has ${m}`);
}

check(!newFlat.includes("how-it-works.html"), "no static html ref");
check(!newFlat.includes("/api/"), "no API");
check(!newFlat.includes("tutorialComplete"), "no tutorial progress");

console.log(fail === 0 ? "PAGE-068 TEXT COMPARE: PASS" : `PAGE-068 TEXT COMPARE: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
