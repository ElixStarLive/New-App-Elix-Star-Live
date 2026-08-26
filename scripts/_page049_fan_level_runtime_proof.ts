/**
 * PAGE-049 runtime proof — Fan Level GET, Neon XP/level derivation, mission XP sync,
 * forged XP/level rejection, hub/wallet/reward separation, account isolation.
 * Run: npx tsx scripts/_page049_fan_level_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

delete process.env.TEST_DATABASE_URL;
if (process.env.NODE_ENV === "test") process.env.NODE_ENV = "development";

process.env.VALKEY_URL = process.env.VALKEY_URL || "redis://127.0.0.1:6379";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
process.env.ENGAGEMENT_HUB_ENABLED = "true";
process.env.VITE_ENGAGEMENT_HUB_ENABLED = "true";
process.env.MISSION_REWARDS_ENABLED = process.env.MISSION_REWARDS_ENABLED || "true";
process.env.PROMOTIONAL_COINS_ENABLED = process.env.PROMOTIONAL_COINS_ENABLED || "true";
process.env.BATTLE_ENERGY_ENABLED = process.env.BATTLE_ENERGY_ENABLED || "true";
process.env.ENGAGEMENT_NEON_APPROVED = process.env.ENGAGEMENT_NEON_APPROVED || "true";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { getPool, withTransaction } = await import("../server/infra/postgres.ts");
const {
  engagementFanLevelResponseSchema,
  engagementHubResponseSchema,
  engagementRewardWalletResponseSchema,
} = await import("../shared/contracts/engagement.ts");
const { grantEngagementXp } = await import("../server/modules/engagement/progression.ts");
const { missionPeriodKey } = await import("../server/modules/engagement/period.ts");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";

async function json(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function accessToken(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const session = (body as { session?: { access_token?: unknown } }).session;
  if (!session || typeof session !== "object") return "";
  return typeof session.access_token === "string" ? session.access_token : "";
}

async function register(stamp: string) {
  const username = `p49${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
  const email = `${username}@example.com`;
  const password = "password12";
  const registered = await json("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      username,
      password,
      ageConfirmed13Plus: true,
      consentVersion: "2026-07-21",
    }),
  });
  assert(registered.status === 201, `register ${username} → ${registered.status}`);
  const id = String((registered.body as { user?: { id?: string } })?.user?.id ?? "");
  assert(Boolean(id), "register missing user id");
  await getPool()!.query(`UPDATE users SET email_confirmed_at = NOW() WHERE id = $1`, [id]);
  const login = await json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert(login.status === 200, `login ${username} → ${login.status}`);
  const token = accessToken(login.body);
  assert(Boolean(token), "login missing access_token");
  return { id, token, username };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

type Fan = {
  level: number;
  tier: string;
  total_xp: number;
  next_level_total_xp: number | null;
  xp_to_next_level: number | null;
};

try {
  const page = readFileSync(resolve("src/pages/engagement/EngagementFanLevel.tsx"), "utf8");
  const api = readFileSync(resolve("src/features/engagement/engagementFanLevelApi.ts"), "utf8");
  const session = readFileSync(resolve("src/features/engagement/engagementFanLevelSession.ts"), "utf8");
  const router = readFileSync(resolve("server/modules/engagement/router.ts"), "utf8");
  const progression = readFileSync(resolve("server/modules/engagement/progression.ts"), "utf8");
  const hubPage = readFileSync(resolve("src/pages/engagement/EngagementHub.tsx"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const walletSrc = readFileSync(resolve("server/modules/wallet/router.ts"), "utf8");
  const payoutSrc = readFileSync(resolve("server/modules/payouts/service.ts"), "utf8");
  const fanTiers = readFileSync(resolve("shared/engagement/fanTiers.ts"), "utf8");

  assert(app.includes('path="/engagement/fan-level"'), "route");
  assert(app.includes("RequireAuth"), "RequireAuth");
  assert(page.includes("Fan Level") && page.includes("ENGAGEMENT_HOME"), "page");
  assert(page.includes("FAN_TIER_LADDER"), "shared ladder");
  assert(hubPage.includes("/engagement/fan-level"), "hub child");
  assert(api.includes("/api/engagement/fan-level"), "api");
  assert(router.includes('router.get("/fan-level"') && !router.includes('router.post("/fan-level"'), "GET only");
  assert(progression.includes("xp_level_requirements") && progression.includes("grantEngagementXp"), "progression owner");
  assert(session.includes("++generation"), "stale gen");
  assert(!page.includes("localStorage") && !page.includes("WebSocket"), "no local/ws");
  assert(fanTiers.includes("Bronze Fan") && fanTiers.includes("Legend Fan"), "tier ladder");
  assert(!payoutSrc.includes("grantEngagementXp") && !payoutSrc.includes("getFanLevelForUser"), "payout sep");
  assert(!walletSrc.includes("total_xp") && !walletSrc.includes("fan_level"), "wallet sep");

  assert((await json("/api/health")).status === 200, "health");
  assert((await json("/api/engagement/fan-level")).status === 401, "unauth");

  const accountA = await register("a");
  const accountB = await register("b");

  const empty = await json("/api/engagement/fan-level", { headers: auth(accountA.token) });
  assert(empty.status === 200 || empty.status === 404, `fan-level → ${empty.status}`);
  if (empty.status === 404) {
    throw new Error(
      "ENGAGEMENT_HUB_DISABLED on target server — start proof server with ENGAGEMENT_HUB_ENABLED=true",
    );
  }
  assert(engagementFanLevelResponseSchema.safeParse(empty.body).success, "fan schema");
  const start = (empty.body as { fan_level: Fan }).fan_level;
  assert(start.level === 0 && start.total_xp === 0 && start.tier === "Bronze Fan", "zero start");
  assert(start.next_level_total_xp != null && (start.next_level_total_xp as number) > 0, "has next threshold");
  assert(start.xp_to_next_level === start.next_level_total_xp, "xp_to_next equals threshold at 0");

  const forgedXp = await json("/api/engagement/xp", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ xp: 1_000_000 }),
  });
  assert([404, 405].includes(forgedXp.status), `forged xp → ${forgedXp.status}`);
  const forgedLevel = await json("/api/engagement/fan-level", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ level: 999, total_xp: 1_000_000, next_level_total_xp: 1 }),
  });
  assert(forgedLevel.status !== 200, `forged level → ${forgedLevel.status}`);
  const forgedPut = await json("/api/engagement/fan-level", {
    method: "PUT",
    headers: auth(accountA.token),
    body: JSON.stringify({ level: 50 }),
  });
  assert(forgedPut.status !== 200, `forged put → ${forgedPut.status}`);

  const afterForge = await json("/api/engagement/fan-level", { headers: auth(accountA.token) });
  assert((afterForge.body as { fan_level: Fan }).fan_level.total_xp === 0, "forge did not mutate XP");
  assert((afterForge.body as { fan_level: Fan }).fan_level.level === 0, "forge did not mutate level");

  const curve = await getPool()!.query<{ level: number; total_xp_required: string }>(
    `SELECT level, total_xp_required::text AS total_xp_required
     FROM xp_level_requirements
     WHERE level IN (1, 2, 10, 20)
     ORDER BY level`,
  );
  const byLevel = Object.fromEntries(curve.rows.map((row) => [row.level, Number(row.total_xp_required)]));
  assert(byLevel[1] > 0 && byLevel[2] > byLevel[1] && byLevel[10] > byLevel[2], "PAGE-078 curve");

  await getPool()!.query(`UPDATE user_engagement SET total_xp = $2, battle_energy = 0 WHERE user_id = $1`, [
    accountA.id,
    byLevel[1] - 1,
  ]);
  const below = await json("/api/engagement/fan-level", { headers: auth(accountA.token) });
  assert((below.body as { fan_level: Fan }).fan_level.level === 0, "below L1");
  assert((below.body as { fan_level: Fan }).fan_level.xp_to_next_level === 1, "1 XP to L1");

  await withTransaction(async (client) => {
    await grantEngagementXp(client, accountA.id, { xp: 1, energy: 0 });
  });
  const atL1 = await json("/api/engagement/fan-level", { headers: auth(accountA.token) });
  assert((atL1.body as { fan_level: Fan }).fan_level.level === 1, "level-up to 1");
  assert((atL1.body as { fan_level: Fan }).fan_level.total_xp === byLevel[1], "XP at L1 threshold");
  assert(
    (atL1.body as { fan_level: Fan }).fan_level.next_level_total_xp === byLevel[2],
    "next threshold L2",
  );

  const jumpXp = byLevel[10] - byLevel[1];
  await withTransaction(async (client) => {
    await grantEngagementXp(client, accountA.id, { xp: jumpXp, energy: 0 });
  });
  const silver = await json("/api/engagement/fan-level", { headers: auth(accountA.token) });
  assert((silver.body as { fan_level: Fan }).fan_level.level === 10, "multi-level to 10");
  assert((silver.body as { fan_level: Fan }).fan_level.tier === "Silver Fan", "Silver Fan");
  assert((silver.body as { fan_level: Fan }).fan_level.total_xp === byLevel[10], "XP at L10");

  const hub = await json("/api/engagement/hub", { headers: auth(accountA.token) });
  assert(hub.status === 200, "hub");
  assert(engagementHubResponseSchema.safeParse(hub.body).success, "hub schema");
  assert(
    (hub.body as { hub: { total_xp: number; fan_level: number; fan_tier: string } }).hub.total_xp ===
      byLevel[10],
    "hub XP match",
  );
  assert(
    (hub.body as { hub: { fan_level: number; fan_tier: string } }).hub.fan_level === 10 &&
      (hub.body as { hub: { fan_tier: string } }).hub.fan_tier === "Silver Fan",
    "hub level/tier match",
  );

  const rewards = await json("/api/engagement/wallet", { headers: auth(accountA.token) });
  assert(rewards.status === 200, "reward wallet");
  assert(engagementRewardWalletResponseSchema.safeParse(rewards.body).success, "reward schema");
  assert(
    (rewards.body as { wallet: { totalXp: number; fanLevel: number; fanTier: string } }).wallet.totalXp ===
      byLevel[10],
    "reward XP",
  );
  assert(
    (rewards.body as { wallet: { fanLevel: number; fanTier: string } }).wallet.fanLevel === 10 &&
      (rewards.body as { wallet: { fanTier: string } }).wallet.fanTier === "Silver Fan",
    "reward level/tier",
  );

  const wallet = await json("/api/wallet", { headers: auth(accountA.token) });
  assert(wallet.status === 200, "paid wallet");
  assert((wallet.body as { total_xp?: unknown }).total_xp === undefined, "paid wallet no XP");
  assert((wallet.body as { fan_level?: unknown }).fan_level === undefined, "paid wallet no level");
  const paidBefore = Number((wallet.body as { coin_balance: number }).coin_balance ?? 0);

  const payout = await json("/api/creator/balance", { headers: auth(accountA.token) });
  assert(payout.status === 200, "payout");
  assert((payout.body as { gbp: { available_pence: number } }).gbp.available_pence === 0, "no GBP");
  assert((payout.body as { total_xp?: unknown }).total_xp === undefined, "payout no XP");

  await getPool()!.query(`UPDATE user_engagement SET total_xp = 0, battle_energy = 0, fan_level = 0 WHERE user_id = $1`, [
    accountA.id,
  ]);
  const period = missionPeriodKey("daily");
  await getPool()!.query(
    `INSERT INTO user_mission_progress (user_id, mission_id, period_key, progress, claimed)
     VALUES ($1, 'daily_like', $2, 5, FALSE)
     ON CONFLICT (user_id, mission_id, period_key)
     DO UPDATE SET progress = 5, claimed = FALSE`,
    [accountA.id, period],
  );
  await getPool()!.query(
    `UPDATE engagement_missions SET reward_xp = 40, reward_energy = 2, reward_promo_coins = GREATEST(reward_promo_coins, 5)
     WHERE id = 'daily_like'`,
    [],
  );

  const claim1 = await json("/api/engagement/missions/daily_like/claim", {
    method: "POST",
    headers: auth(accountA.token),
    body: "{}",
  });
  assert(claim1.status === 200, `mission claim → ${claim1.status}`);
  const claim2 = await json("/api/engagement/missions/daily_like/claim", {
    method: "POST",
    headers: auth(accountA.token),
    body: "{}",
  });
  assert(claim2.status === 200, "duplicate claim status");
  assert((claim2.body as { alreadyClaimed?: boolean }).alreadyClaimed === true, "duplicate alreadyClaimed");

  const afterMission = await json("/api/engagement/fan-level", { headers: auth(accountA.token) });
  assert((afterMission.body as { fan_level: Fan }).fan_level.total_xp === 40, "mission XP once");

  const [c1, c2] = await Promise.all([
    withTransaction(async (client) => {
      await grantEngagementXp(client, accountA.id, { xp: 7, energy: 0 });
    }),
    withTransaction(async (client) => {
      await grantEngagementXp(client, accountA.id, { xp: 11, energy: 0 });
    }),
  ]);
  void c1;
  void c2;
  const concurrent = await json("/api/engagement/fan-level", { headers: auth(accountA.token) });
  assert((concurrent.body as { fan_level: Fan }).fan_level.total_xp === 58, "concurrent XP 40+7+11");

  const neon = await getPool()!.query<{ total_xp: string; fan_level: number }>(
    `SELECT total_xp::text AS total_xp, fan_level FROM user_engagement WHERE user_id = $1`,
    [accountA.id],
  );
  assert(Number(neon.rows[0]?.total_xp ?? -1) === 58, "Neon XP");
  assert(
    Number(neon.rows[0]?.fan_level ?? -1) === (concurrent.body as { fan_level: Fan }).fan_level.level,
    "Neon fan_level column",
  );

  const walletAfter = await json("/api/wallet", { headers: auth(accountA.token) });
  assert(Number((walletAfter.body as { coin_balance: number }).coin_balance ?? 0) === paidBefore, "paid unchanged");

  const isolated = await json("/api/engagement/fan-level", { headers: auth(accountB.token) });
  assert((isolated.body as { fan_level: Fan }).fan_level.total_xp === 0, "B XP 0");
  assert((isolated.body as { fan_level: Fan }).fan_level.level === 0, "B level 0");

  const logout = await json("/api/auth/logout", { method: "POST", headers: auth(accountA.token) });
  assert(logout.status === 200, "logout");
  assert(
    (await json("/api/engagement/fan-level", { headers: auth(accountA.token) })).status === 401,
    "post-logout 401",
  );

  console.log("PAGE-049 FAN LEVEL RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        zeroStart: true,
        levelUp: true,
        multiLevelCrossing: true,
        page078Curve: true,
        hubSynced: true,
        rewardWalletSynced: true,
        missionXpOnce: true,
        concurrentXp: true,
        forgedRejected: true,
        paidSeparated: true,
        payoutSeparated: true,
        accountIsolated: true,
        neonPersisted: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-049 FAN LEVEL RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
