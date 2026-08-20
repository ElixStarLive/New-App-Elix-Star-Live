import fs from "fs";
import path from "path";

const root = "C:/Users/Absm Construction/Desktop/Elix Star Live/server/routes";

const mounts = [
  ["stories.router.ts", "/api/stories"],
  ["adminProgression.router.ts", "/api/admin/progression"],
  ["gifts.router.ts", "/api/gifts"],
  ["feed.router.ts", "/api/feed"],
  ["wallet.router.ts", "/api/wallet"],
  ["media.router.ts", "/api/media"],
  ["chat.router.ts", "/api/chat"],
  ["auth.router.ts", "/api/auth"],
  ["adminMonetisation.router.ts", "/api/admin/monetisation"],
  ["adminActions.ts", "/api/admin"],
  ["live.router.ts", "/api/live"],
  ["videos.router.ts", "/api/videos"],
  ["misc.router.ts", "/api"],
  ["reposts.router.ts", "/api/reposts"],
  ["engagement.router.ts", "/api/engagement"],
  ["adminRisingStars.router.ts", "/api/admin/rising-stars"],
  ["progression.router.ts", "/api/progression"],
  ["shop.router.ts", "/api/shop"],
  ["profiles.router.ts", "/api/profiles"],
  ["risingStars.router.ts", "/api/rising-stars"],
  ["music.router.ts", "/api/music"],
];

const endpoints = [];
function add(method, p) {
  const fp = p.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  endpoints.push(`${method.toUpperCase()} ${fp}`);
}

const routeRe =
  /(?:router|coinPackagesRouter)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;

for (const [file, prefix] of mounts) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  let m;
  const re = new RegExp(routeRe.source, "g");
  while ((m = re.exec(src))) {
    if (
      file === "shop.router.ts" &&
      src.slice(Math.max(0, m.index - 80), m.index).includes("coinPackages")
    ) {
      add(m[1], "/api/coin-packages" + (m[2] === "/" ? "" : m[2]));
      continue;
    }
    add(m[1], prefix + (m[2] === "/" ? "" : m[2]));
  }
}

const payout = fs.readFileSync(path.join(root, "payout.router.ts"), "utf8");
const ci = payout.indexOf("const creatorRouter");
const ai = payout.indexOf("const adminPayoutRouter");
const creator = payout.slice(ci, ai);
const admin = payout.slice(ai);
let m;
const r1 = /creatorRouter\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
while ((m = r1.exec(creator))) add(m[1], "/api/creator" + (m[2] === "/" ? "" : m[2]));
const r2 = /adminPayoutRouter\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
while ((m = r2.exec(admin))) add(m[1], "/api/admin" + (m[2] === "/" ? "" : m[2]));

[
  ["get", "/api/test-coins/balance"],
  ["post", "/api/test-coins/authorize"],
  ["post", "/api/test-coins/mint"],
  ["get", "/health"],
  ["get", "/api/health"],
  ["get", "/api/metrics"],
  ["post", "/api/stripe-webhook"],
  ["post", "/api/livekit/webhook"],
  ["post", "/api/webhooks/google-play"],
  ["post", "/api/webhooks/apple-iap"],
  ["get", "/api/media/public/*"],
].forEach(([a, b]) => add(a, b));

const uniq = [...new Set(endpoints)].sort();
const parts = [];
parts.push("REST_COUNT=" + uniq.length);
parts.push(...uniq);
parts.push("");

// WS inbound
const handlers = fs.readFileSync(
  "C:/Users/Absm Construction/Desktop/Elix Star Live/server/websocket/handlers.ts",
  "utf8",
);
const inbound = [...handlers.matchAll(/case\s+"([^"]+)"/g)].map((x) => x[1]);
parts.push("WS_INBOUND_COUNT=" + inbound.length);
parts.push(...inbound);
parts.push("");

// WS outbound from sendToClient / broadcastToRoom / sendToUserGlobal second arg
const wsDir = "C:/Users/Absm Construction/Desktop/Elix Star Live/server";
function walk(dir, acc) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules") continue;
      walk(p, acc);
    } else if (ent.name.endsWith(".ts") && !ent.name.endsWith(".test.ts")) {
      acc.push(p);
    }
  }
}
const files = [];
walk(wsDir, files);
const outSet = new Set();
const patterns = [
  /sendToClient\(\s*\w+\s*,\s*"([^"]+)"/g,
  /broadcastToRoom\(\s*[^,]+,\s*"([^"]+)"/g,
  /sendToUserGlobal\(\s*[^,]+,\s*"([^"]+)"/g,
  /broadcastToFeedSubscribers\(\s*"([^"]+)"/g,
];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const pat of patterns) {
    const re = new RegExp(pat.source, "g");
    let mm;
    while ((mm = re.exec(src))) outSet.add(mm[1]);
  }
}
outSet.add("pong");
outSet.add("force_disconnect");
outSet.add("stream_started");
outSet.add("live_share");
const outbound = [...outSet].sort();
parts.push("WS_OUTBOUND_COUNT=" + outbound.length);
parts.push(...outbound);
parts.push("");

// CREATE TABLE — skip "IF" from multiline CREATE TABLE IF NOT EXISTS
const migDir = "C:/Users/Absm Construction/Desktop/Elix Star Live/server/migrations";
const tables = new Set();
const migFiles = fs.readdirSync(migDir).filter((n) => n.endsWith(".sql"));
for (const n of migFiles) {
  const src = fs.readFileSync(path.join(migDir, n), "utf8");
  for (const mm of src.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi)) {
    if (mm[1].toUpperCase() === "IF") continue;
    tables.add(mm[1]);
  }
}
parts.push("MIGRATION_FILES=" + migFiles.length);
parts.push("CREATE_TABLES=" + tables.size);
parts.push(...[...tables].sort());

const outPath =
  "C:/Users/Absm Construction/Desktop/New App Elix Star Live/docs/old-spec/_extract-out.txt";
fs.writeFileSync(outPath, parts.join("\n") + "\n", "utf8");
console.log("wrote", outPath, {
  rest: uniq.length,
  inbound: inbound.length,
  outbound: outbound.length,
  tables: tables.size,
  migrations: migFiles.length,
});
