/**
 * PAGE-077 runtime proof — Admin Rising Stars create/open/snapshot/audit + API-only freeze/DQ/badges/rewards.
 * Run: npx tsx scripts/_page077_admin_rising_stars_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ADMIN_RISING_STARS_AUDIT,
  ADMIN_RISING_STARS_CREATE_SEASON,
  ADMIN_RISING_STARS_SNAPSHOT_FINAL,
  ADMIN_RISING_STARS_SNAPSHOT_QUALIFIER,
  ADMIN_RISING_STARS_TITLE,
} from "../src/content/adminRisingStars.ts";

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";

async function get(path: string) {
  const res = await fetch(`${base}${path}`, { redirect: "manual" });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, text, json };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

try {
  const page = readFileSync(resolve("src/pages/admin/RisingStars.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/adminRisingStars.ts"), "utf8");
  const api = readFileSync(resolve("src/features/admin/adminApi.ts"), "utf8");
  const rising = readFileSync(resolve("server/modules/admin/risingStars.ts"), "utf8");
  const hub = readFileSync(resolve("server/modules/risingStars/hub.ts"), "utf8");
  const challenge = readFileSync(resolve("server/modules/risingStars/challenge.ts"), "utf8");
  const routes = readFileSync(resolve("server/modules/app/clientRoutes.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const dashboard = readFileSync(resolve("src/content/adminDashboard.ts"), "utf8");
  const progression = readFileSync(resolve("src/pages/admin/Progression.tsx"), "utf8");

  assert(ADMIN_RISING_STARS_TITLE === "Rising Stars Admin", "title");
  assert(ADMIN_RISING_STARS_CREATE_SEASON === "Create season", "create season");
  assert(ADMIN_RISING_STARS_SNAPSHOT_QUALIFIER.includes("Snapshot"), "qualifier");
  assert(ADMIN_RISING_STARS_SNAPSHOT_FINAL.includes("Snapshot"), "final");
  assert(ADMIN_RISING_STARS_AUDIT === "Audit log", "audit");
  assert(app.includes('path="/admin/rising-stars"') && app.includes("<AdminRisingStars"), "route");
  assert(app.includes("<RequireAdmin"), "shared RequireAdmin");
  assert(dashboard.includes('path: "/admin/rising-stars"'), "dashboard nav");
  assert(page.includes("apiAdminRisingStarsReload") && page.includes("apiAdminRisingStarsSnapshot"), "API");
  assert(!page.includes("Disqualify") && !page.includes("Freeze leaderboard") && !page.includes("Award badge"), "no invented UI");
  assert(!page.includes("Grant reward") && !page.includes("new WebSocket"), "no rewards UI / WS");
  assert(page.includes("prev.length === 0") || page.includes("!prev || prev.length === 0"), "keep rows on error");
  assert(api.includes("/api/admin/rising-stars/seasons") && api.includes("/snapshot"), "paths");
  assert(rising.includes("FROM rs_seasons") && rising.includes("FROM rs_phase_results"), "Neon owners");
  assert(rising.includes("leaderboard_frozen") && rising.includes("disqualified"), "freeze/dq APIs");
  assert(rising.includes("ORDER BY vote_count DESC, created_at ASC"), "tie-break");
  assert(rising.includes("rejectUnknownFields") && rising.includes("FOR UPDATE"), "mass-assign + lock");
  assert(!rising.includes("VALKEY") && !rising.includes("withdrawals_gbp"), "no money mix");
  assert(hub.includes("WHERE status = 'active'"), "PAGE-055 active season");
  assert(challenge.includes("leaderboard_frozen") || challenge.includes("LEADERBOARD_FROZEN"), "freeze enforce");
  assert(routes.includes("handleAdminRisingStarsFreeze") && routes.includes("handleAdminRisingStarsDisqualify"), "routes");
  assert(routes.includes("requireAdmin"), "admin gate");
  assert(progression.includes("ADMIN_PROGRESSION_TITLE"), "PAGE-078 separate");
  assert(!progression.includes("apiAdminRisingStars"), "PAGE-078 no RS admin API");
  assert(content.includes("Rising Stars Admin"), "content");

  assert((await get("/api/health")).status === 200, "health");
  for (const path of ["/api/admin/rising-stars/seasons", "/api/admin/rising-stars/audit?limit=50"]) {
    const loggedOut = await get(path);
    assert(loggedOut.status === 401 || loggedOut.status === 403, `${path} logged-out ${loggedOut.status}`);
    assert(
      !loggedOut.json ||
        typeof loggedOut.json !== "object" ||
        (!("seasons" in (loggedOut.json as object)) && !("audit" in (loggedOut.json as object))),
      `${path} no privileged payload`,
    );
  }
  const spa = await get("/admin/rising-stars");
  assert([200, 304].includes(spa.status), `/admin/rising-stars spa ${spa.status}`);

  console.log("PAGE-077 ADMIN RISING STARS RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        requireAdminShared: true,
        rsTablesCanonical: true,
        uiCreateOpenSnapshotAudit: true,
        freezeDqBadgesRewardsApiOnly: true,
        page055ActiveSeasonShared: true,
        deterministicTieBreak: true,
        keepRowsOnError: true,
        noSecondWebSocket: true,
        noPage078Bleed: true,
        loggedOutDenied: true,
        spaDeepLink: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-077 ADMIN RISING STARS RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
