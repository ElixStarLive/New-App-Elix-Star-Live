import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_HUB_DMCA_CONTACT,
  LEGAL_HUB_ITEMS,
  LEGAL_HUB_LABELS,
  LEGAL_HUB_PATHS,
  LEGAL_HUB_SUPPORT_CONTACT,
  LEGAL_HUB_TITLE,
} from "../src/content/legalHub.ts";

const oldPath = resolve(process.cwd(), "../Elix Star Live/src/pages/Legal.tsx");
const old = readFileSync(oldPath, "utf8");

let fail = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    fail += 1;
  }
}

const oldLabels = [...old.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
const oldPaths = [...old.matchAll(/to:\s*'([^']+)'/g)].map((m) => m[1]);

check(LEGAL_HUB_TITLE === "Legal", "title");
check(old.includes('title="Legal"'), "OLD title");
check(oldLabels.length === 9, `OLD label count ${oldLabels.length}`);
check(LEGAL_HUB_LABELS.length === 9, "NEW label count");
check(LEGAL_HUB_PATHS.length === 9, "NEW path count");

for (let i = 0; i < 9; i++) {
  check(oldLabels[i] === LEGAL_HUB_LABELS[i], `label ${i}: ${oldLabels[i]} vs ${LEGAL_HUB_LABELS[i]}`);
  check(oldPaths[i] === LEGAL_HUB_PATHS[i], `path ${i}: ${oldPaths[i]} vs ${LEGAL_HUB_PATHS[i]}`);
}

check(LEGAL_HUB_DMCA_CONTACT === "dmca@elixstarlive.com", "dmca contact");
check(LEGAL_HUB_SUPPORT_CONTACT === "support@elixstarlive.co.uk", "support contact");
check(old.includes("dmca@elixstarlive.com"), "OLD dmca");
check(old.includes("support@elixstarlive.co.uk"), "OLD support");

check(!LEGAL_HUB_PATHS.includes("/guidelines"), "no guidelines row");
check(!LEGAL_HUB_PATHS.includes("/how-it-works"), "no how-it-works row");
check(!LEGAL_HUB_PATHS.includes("/support"), "no support row");
check(LEGAL_HUB_ITEMS.every((item) => Boolean(item.icon)), "icons present");

const expectedOrder = [
  ["/terms", "Terms & Conditions"],
  ["/privacy", "Privacy Policy"],
  ["/copyright", "Copyright Notice"],
  ["/legal/audio", "Audio & Music Disclaimer"],
  ["/legal/ugc", "UGC Disclaimer"],
  ["/legal/affiliate", "Affiliate / Sponsored Disclosure"],
  ["/legal/supplier", "Supplier Agreement"],
  ["/legal/dmca", "DMCA / Copyright Report"],
  ["/legal/safety", "Safety"],
] as const;

for (let i = 0; i < expectedOrder.length; i++) {
  check(LEGAL_HUB_PATHS[i] === expectedOrder[i][0], `expected path ${i}`);
  check(LEGAL_HUB_LABELS[i] === expectedOrder[i][1], `expected label ${i}`);
}

console.log(fail === 0 ? "PAGE-060 ROW COMPARE: PASS" : `PAGE-060 ROW COMPARE: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
