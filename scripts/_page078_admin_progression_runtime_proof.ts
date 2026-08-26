/**
 * PAGE-078 runtime proof — Admin Progression (Starter Coins & XP) canonical Neon owners.
 * Run: npx tsx scripts/_page078_admin_progression_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ADMIN_PROGRESSION_ADJUST_STARTER,
  ADMIN_PROGRESSION_ADJUST_XP,
  ADMIN_PROGRESSION_DAILY_TITLE,
  ADMIN_PROGRESSION_ENERGY_TITLE,
  ADMIN_PROGRESSION_FLAGS_TITLE,
  ADMIN_PROGRESSION_MISSIONS_TITLE,
  ADMIN_PROGRESSION_TITLE,
} from "../src/content/adminProgression.ts";

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
  const page = readFileSync(resolve("src/pages/admin/Progression.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/adminProgression.ts"), "utf8");
  const api = readFileSync(resolve("src/features/admin/adminApi.ts"), "utf8");
  const progression = readFileSync(resolve("server/modules/admin/progression.ts"), "utf8");
  const flags = readFileSync(resolve("server/modules/engagement/flags.ts"), "utf8");
  const daily = readFileSync(resolve("server/modules/engagement/dailyLogin.ts"), "utf8");
  const missions = readFileSync(resolve("server/modules/engagement/missions.ts"), "utf8");
  const fan = readFileSync(resolve("server/modules/engagement/progression.ts"), "utf8");
  const routes = readFileSync(resolve("server/modules/app/clientRoutes.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const dashboard = readFileSync(resolve("src/content/adminDashboard.ts"), "utf8");
  const rising = readFileSync(resolve("src/pages/admin/RisingStars.tsx"), "utf8");

  assert(ADMIN_PROGRESSION_TITLE === "Starter Coins & XP", "title");
  assert(ADMIN_PROGRESSION_FLAGS_TITLE.length > 0, "flags");
  assert(ADMIN_PROGRESSION_MISSIONS_TITLE.length > 0, "missions");
  assert(ADMIN_PROGRESSION_DAILY_TITLE.length > 0, "daily");
  assert(ADMIN_PROGRESSION_ENERGY_TITLE.length > 0, "energy");
  assert(ADMIN_PROGRESSION_ADJUST_XP.length > 0 && ADMIN_PROGRESSION_ADJUST_STARTER.length > 0, "adjust");
  assert(app.includes('path="/admin/progression"') && app.includes("<AdminProgression"), "route");
  assert(app.includes("<RequireAdmin"), "shared RequireAdmin");
  assert(dashboard.includes('path: "/admin/progression"'), "dashboard nav");
  assert(page.includes("apiAdminProgressionLoadConfig") && page.includes("apiAdminProgressionAdjust"), "API");
  assert(page.includes("window.confirm") && page.includes("high-impact"), "flag confirm");
  assert(!page.includes("new WebSocket") && !page.includes("Rising Stars Admin"), "no WS / RS bleed");
  assert(page.includes("prev.length === 0") || page.includes("!prev || prev.length === 0"), "keep rows on error");
  assert(api.includes("/api/admin/progression/config") && api.includes("xp-adjustments"), "paths");
  assert(progression.includes("FROM xp_activity_config") && progression.includes("FROM xp_level_requirements"), "levels");
  assert(progression.includes("FROM engagement_missions") && progression.includes("FROM daily_reward_config"), "missions/daily");
  assert(progression.includes("bucket = 'starter'") && progression.includes("engagement_admin_audit"), "starter+audit");
  assert(progression.includes("LEVEL_XP_ORDER") || progression.includes("total_xp_required"), "threshold");
  assert(!progression.includes("VALKEY") && !progression.includes("withdrawals_gbp"), "no money mix");
  assert(flags.includes("engagementHubEnabled") || flags.includes("return resolved === true"), "flags");
  assert(daily.includes("resolveDailyRewardPolicy") || daily.includes("daily_reward"), "daily owner");
  assert(missions.includes("missionRewardsEnabled") || missions.includes("engagement_missions"), "mission owner");
  assert(fan.includes("xp_level_requirements"), "PAGE-049 levels");
  assert(routes.includes("handleAdminProgressionConfig") && routes.includes("requireAdmin"), "routes");
  assert(!rising.includes("apiAdminProgression"), "PAGE-077 separate");
  assert(content.includes("Starter Coins & XP"), "content");

  assert((await get("/api/health")).status === 200, "health");
  for (const path of ["/api/admin/progression/config", "/api/admin/progression/levels", "/api/admin/progression/feature-flags"]) {
    const loggedOut = await get(path);
    assert(loggedOut.status === 401 || loggedOut.status === 403, `${path} logged-out ${loggedOut.status}`);
  }
  const spa = await get("/admin/progression");
  assert([200, 304].includes(spa.status), `/admin/progression spa ${spa.status}`);

  console.log("PAGE-078 ADMIN PROGRESSION RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        requireAdminShared: true,
        starterCoinsAndXpTitle: true,
        flagsMissionsDailyEnergy: true,
        xpAndStarterAdjust: true,
        page049LevelsShared: true,
        keepRowsOnError: true,
        noSecondWebSocket: true,
        noRisingStarsBleed: true,
        loggedOutDenied: true,
        spaDeepLink: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-078 ADMIN PROGRESSION RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
