import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SUPPORT_EMAIL,
  SUPPORT_FAQ_ITEMS,
  SUPPORT_FAQ_QUESTIONS,
  SUPPORT_LEGAL_LINKS,
  SUPPORT_QUICK_LINKS,
  SUPPORT_TITLE,
} from "../src/content/support.ts";

const oldPath = resolve(process.cwd(), "../Elix Star Live/src/pages/Support.tsx");
const old = readFileSync(oldPath, "utf8");

let fail = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    fail += 1;
  }
}

check(SUPPORT_TITLE === "Help & Support", "title");
check(old.includes('title="Help & Support"'), "OLD title");
check(SUPPORT_EMAIL === "support@elixstarlive.co.uk", "email");
check(old.includes("support@elixstarlive.co.uk"), "OLD email");
check(SUPPORT_FAQ_QUESTIONS.length === 8, "8 FAQs");
check(SUPPORT_QUICK_LINKS.map((i) => i.label).join("|") === "Contact Support|Safety Center|Community Guidelines", "quick");
check(
  SUPPORT_LEGAL_LINKS.map((i) => i.label).join("|") === "Terms of Service|Privacy Policy|Copyright Policy",
  "legal",
);

for (const item of SUPPORT_FAQ_ITEMS) {
  check(old.includes(item.question), `OLD Q: ${item.question}`);
  check(old.includes(item.answer), `OLD A: ${item.question}`);
}

const markers = [
  "How do I earn coins?",
  "Are digital coin purchases refundable?",
  "Can I get a refund on a shop purchase?",
  "Apple / Google Play",
  "What are battles?",
  "How do I start a live stream?",
  'Tap the "+" button, select "Go Live"',
  "Can I download my videos?",
  "How do I delete my account?",
  "Settings → Account → Delete Account",
  "What content is not allowed?",
  "Community Guidelines",
  "Safety Center",
  "Terms of Service",
  "Privacy Policy",
  "Copyright Policy",
  "Email us directly",
  "support@elixstarlive.co.uk",
];

for (const m of markers) {
  check(old.includes(m), `OLD has ${m}`);
}

check(SUPPORT_QUICK_LINKS[0]?.mailto === true, "Contact Support is mailto (frozen static contract)");
check(SUPPORT_QUICK_LINKS[1]?.path === "/settings/safety", "safety path");
check(SUPPORT_QUICK_LINKS[2]?.path === "/guidelines", "guidelines path");
check(SUPPORT_LEGAL_LINKS[0]?.path === "/terms", "terms");
check(SUPPORT_LEGAL_LINKS[1]?.path === "/privacy", "privacy");
check(SUPPORT_LEGAL_LINKS[2]?.path === "/copyright", "copyright");

// Frozen PAGE-069 contract: no ticket form in NEW
const newPage = readFileSync(resolve(process.cwd(), "src/pages/Support.tsx"), "utf8");
check(!newPage.includes("apiCreateReport"), "no report ticket API");
check(!newPage.includes("Message Sent"), "no fake success");
check(!newPage.includes("<textarea"), "no invented form");
check(!newPage.includes("/api/support"), "no support POST");

console.log(fail === 0 ? "PAGE-069 TEXT COMPARE: PASS" : `PAGE-069 TEXT COMPARE: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
