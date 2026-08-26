/**
 * PAGE-048 runtime proof — Missions GET/claim, Neon progress, reward settlement,
 * forged progress/reward rejection, hub/wallet/payout separation, account isolation.
 * Run: npx tsx scripts/_page048_missions_runtime_proof.ts
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

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { getPool } = await import("../server/infra/postgres.ts");
const {
  engagementMissionsResponseSchema,
  engagementMissionClaimResponseSchema,
  engagementHubResponseSchema,
  engagementFanLevelResponseSchema,
} = await import("../shared/contracts/engagement.ts");
const { bumpEngagement } = await import("../server/modules/engagement/progress.ts");
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
  const username = `p48${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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

type Mission = {
  id: string;
  scope: string;
  title: string;
  goal_count: number;
  reward_xp: number;
  reward_promo_coins: number;
  reward_energy: number;
  metric_key: string;
  period_key: string;
  progress: number;
  completed: boolean;
  claimed: boolean;
};

try {
  const page = readFileSync(resolve("src/pages/engagement/EngagementMissions.tsx"), "utf8");
  const api = readFileSync(resolve("src/features/engagement/engagementMissionsApi.ts"), "utf8");
  const session = readFileSync(resolve("src/features/engagement/engagementMissionsSession.ts"), "utf8");
  const router = readFileSync(resolve("server/modules/engagement/router.ts"), "utf8");
  const missionsSrc = readFileSync(resolve("server/modules/engagement/missions.ts"), "utf8");
  const progressSrc = readFileSync(resolve("server/modules/engagement/progress.ts"), "utf8");
  const hubPage = readFileSync(resolve("src/pages/engagement/EngagementHub.tsx"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const walletSrc = readFileSync(resolve("server/modules/wallet/router.ts"), "utf8");
  const payoutSrc = readFileSync(resolve("server/modules/payouts/service.ts"), "utf8");

  assert(app.includes('path="/engagement/missions"'), "route");
  assert(app.includes("RequireAuth"), "RequireAuth owner");
  assert(page.includes("Missions") && page.includes("ENGAGEMENT_HOME"), "missions page");
  assert(hubPage.includes("/engagement/missions"), "hub child link");
  assert(api.includes("/api/engagement/missions") && api.includes("/claim"), "missions api");
  assert(router.includes('router.get("/missions"') && router.includes('router.post("/missions/:id/claim"'), "router");
  assert(missionsSrc.includes("bucket: \"promo\"") && missionsSrc.includes("alreadyClaimed"), "claim settlement");
  assert(progressSrc.includes("missionPeriodKey") && progressSrc.includes("bumpEngagement"), "progress owner");
  assert(session.includes("++generation"), "stale gen");
  assert(!page.includes("localStorage") && !page.includes("WebSocket"), "no local/ws owner");
  assert(!walletSrc.includes("mission_claim") || walletSrc.includes("promo"), "wallet not mission owner");
  assert(!payoutSrc.includes("claimMissionForUser") && !payoutSrc.includes("listMissionsForUser"), "payout separation");

  assert((await json("/api/health")).status === 200, "health");
  assert((await json("/api/engagement/missions")).status === 401, "unauth missions");

  const accountA = await register("a");
  const accountB = await register("b");

  const list0 = await json("/api/engagement/missions", { headers: auth(accountA.token) });
  assert(list0.status === 200 || list0.status === 404, `missions → ${list0.status}`);
  if (list0.status === 404) {
    throw new Error(
      "ENGAGEMENT_HUB_DISABLED on target server — start proof server with ENGAGEMENT_HUB_ENABLED=true",
    );
  }
  assert(engagementMissionsResponseSchema.safeParse(list0.body).success, "missions schema");
  const missions0 = (list0.body as { missions: Mission[] }).missions;
  assert(missions0.length > 0, "canonical mission definitions present");
  assert(
    missions0.every((m, i, arr) => i === 0 || arr[i - 1].scope <= m.scope),
    "scope ordering",
  );

  const likeMission = missions0.find((m) => m.metric_key === "like" && m.scope === "daily");
  assert(Boolean(likeMission), "daily like mission");
  const missionId = likeMission!.id;
  const goal = likeMission!.goal_count;
  const period = likeMission!.period_key || missionPeriodKey(likeMission!.scope);
  assert(likeMission!.progress === 0 && likeMission!.completed === false, "starts incomplete");

  const earlyClaim = await json(`/api/engagement/missions/${encodeURIComponent(missionId)}/claim`, {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ reward_xp: 999999, reward_promo_coins: 999999, reward_energy: 999999 }),
  });
  assert(earlyClaim.status === 400, `claim-before-complete → ${earlyClaim.status}`);

  const forgedProgress = await json(`/api/engagement/missions/${encodeURIComponent(missionId)}/progress`, {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ progress: goal }),
  });
  assert([404, 405].includes(forgedProgress.status), `forged progress → ${forgedProgress.status}`);

  await getPool()!.query(
    `UPDATE engagement_missions
     SET reward_xp = GREATEST(reward_xp, 25),
         reward_promo_coins = GREATEST(reward_promo_coins, 10),
         reward_energy = GREATEST(reward_energy, 3)
     WHERE id = $1`,
    [missionId],
  );

  await bumpEngagement(accountA.id, "like", Math.max(1, Math.floor(goal / 2) || 1));
  const mid = await json("/api/engagement/missions", { headers: auth(accountA.token) });
  assert(mid.status === 200, "mid list");
  const midRow = (mid.body as { missions: Mission[] }).missions.find((m) => m.id === missionId)!;
  assert(midRow.progress > 0 && midRow.progress < goal, `partial ${midRow.progress}/${goal}`);
  assert(midRow.completed === false, "partial not complete");

  const neonProg = await getPool()!.query<{ progress: number; claimed: boolean }>(
    `SELECT progress, claimed FROM user_mission_progress
     WHERE user_id = $1 AND mission_id = $2 AND period_key = $3`,
    [accountA.id, missionId, period],
  );
  assert((neonProg.rows[0]?.progress ?? 0) === midRow.progress, "Neon progress matches API");
  assert(neonProg.rows[0]?.claimed !== true, "Neon unclaimed");

  await bumpEngagement(accountA.id, "like", goal);
  const ready = await json("/api/engagement/missions", { headers: auth(accountA.token) });
  const readyRow = (ready.body as { missions: Mission[] }).missions.find((m) => m.id === missionId)!;
  assert(readyRow.progress === goal, `complete progress ${readyRow.progress}`);
  assert(readyRow.completed === true && readyRow.claimed === false, "claimable");

  const walletBefore = await json("/api/wallet", { headers: auth(accountA.token) });
  assert(walletBefore.status === 200, "wallet before");
  const paidBefore = Number((walletBefore.body as { coin_balance: number }).coin_balance ?? 0);
  const promoBefore = Number((walletBefore.body as { promotional_balance: number }).promotional_balance ?? 0);

  const engBefore = await getPool()!.query<{ total_xp: number; battle_energy: number }>(
    `SELECT total_xp, battle_energy FROM user_engagement WHERE user_id = $1`,
    [accountA.id],
  );
  const xpBefore = Number(engBefore.rows[0]?.total_xp ?? 0);
  const energyBefore = Number(engBefore.rows[0]?.battle_energy ?? 0);

  const hubBefore = await json("/api/engagement/hub", { headers: auth(accountA.token) });
  assert(hubBefore.status === 200, "hub before");
  assert(engagementHubResponseSchema.safeParse(hubBefore.body).success, "hub schema");
  const openBefore = (hubBefore.body as { hub: { missions_open: number } }).hub.missions_open;
  assert(openBefore >= 1, "hub missions_open includes claimable");

  const claim1 = await json(`/api/engagement/missions/${encodeURIComponent(missionId)}/claim`, {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ rewardAmount: 1_000_000, xp: 1_000_000, promo: 1_000_000, energy: 1_000_000 }),
  });
  assert(claim1.status === 200, `claim → ${claim1.status}`);
  assert(engagementMissionClaimResponseSchema.safeParse(claim1.body).success, "claim schema");
  assert((claim1.body as { alreadyClaimed?: boolean }).alreadyClaimed !== true, "first claim settles");

  const claim2 = await json(`/api/engagement/missions/${encodeURIComponent(missionId)}/claim`, {
    method: "POST",
    headers: auth(accountA.token),
    body: "{}",
  });
  assert(claim2.status === 200, `dup claim → ${claim2.status}`);
  assert((claim2.body as { alreadyClaimed?: boolean }).alreadyClaimed === true, "duplicate alreadyClaimed");

  const [claim3, claim4] = await Promise.all([
    json(`/api/engagement/missions/${encodeURIComponent(missionId)}/claim`, {
      method: "POST",
      headers: auth(accountA.token),
      body: "{}",
    }),
    json(`/api/engagement/missions/${encodeURIComponent(missionId)}/claim`, {
      method: "POST",
      headers: auth(accountA.token),
      body: "{}",
    }),
  ]);
  assert(claim3.status === 200 && claim4.status === 200, "concurrent claim status");
  assert(
    (claim3.body as { alreadyClaimed?: boolean }).alreadyClaimed === true &&
      (claim4.body as { alreadyClaimed?: boolean }).alreadyClaimed === true,
    "concurrent alreadyClaimed",
  );

  const afterList = await json("/api/engagement/missions", { headers: auth(accountA.token) });
  const afterRow = (afterList.body as { missions: Mission[] }).missions.find((m) => m.id === missionId)!;
  assert(afterRow.claimed === true && afterRow.completed === true, "claimed state");

  const claimRows = await getPool()!.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM user_mission_progress
     WHERE user_id = $1 AND mission_id = $2 AND period_key = $3 AND claimed = TRUE`,
    [accountA.id, missionId, period],
  );
  assert((claimRows.rows[0]?.n ?? 0) === 1, "one claimed Neon row");

  const ledger = await getPool()!.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM wallet_ledger
     WHERE user_id = $1 AND reason = 'mission_claim' AND ref_id = $2`,
    [accountA.id, missionId],
  );
  assert((ledger.rows[0]?.n ?? 0) === 1, "one mission_claim ledger row");

  const walletAfter = await json("/api/wallet", { headers: auth(accountA.token) });
  const paidAfter = Number((walletAfter.body as { coin_balance: number }).coin_balance ?? 0);
  const promoAfter = Number((walletAfter.body as { promotional_balance: number }).promotional_balance ?? 0);
  assert(paidAfter === paidBefore, "paid coins unchanged");
  assert(promoAfter === promoBefore + readyRow.reward_promo_coins, `promo +${readyRow.reward_promo_coins}`);

  const engAfter = await getPool()!.query<{ total_xp: number; battle_energy: number }>(
    `SELECT total_xp, battle_energy FROM user_engagement WHERE user_id = $1`,
    [accountA.id],
  );
  assert(Number(engAfter.rows[0]?.total_xp ?? 0) === xpBefore + readyRow.reward_xp, "XP credited");
  assert(
    Number(engAfter.rows[0]?.battle_energy ?? 0) === energyBefore + readyRow.reward_energy,
    "Energy credited",
  );

  const hubAfter = await json("/api/engagement/hub", { headers: auth(accountA.token) });
  assert((hubAfter.body as { hub: { missions_open: number } }).hub.missions_open === openBefore - 1, "hub open -1");
  assert(
    (hubAfter.body as { hub: { promotional_balance: number } }).hub.promotional_balance === promoAfter,
    "hub promo sync",
  );
  assert((hubAfter.body as { hub: { total_xp: number } }).hub.total_xp === xpBefore + readyRow.reward_xp, "hub xp");

  const fan = await json("/api/engagement/fan-level", { headers: auth(accountA.token) });
  assert(fan.status === 200, "fan level");
  assert(engagementFanLevelResponseSchema.safeParse(fan.body).success, "fan schema");
  assert(
    (fan.body as { fan_level: { total_xp: number } }).fan_level.total_xp === xpBefore + readyRow.reward_xp,
    "fan xp sync",
  );

  const rewards = await json("/api/engagement/wallet", { headers: auth(accountA.token) });
  assert(rewards.status === 200, "reward wallet");
  const rewardWallet = (rewards.body as {
    wallet: { promotionalCoins: number; battleEnergy: number; totalXp: number };
  }).wallet;
  assert(rewardWallet.promotionalCoins === promoAfter, "reward wallet promo");
  assert(rewardWallet.battleEnergy === energyBefore + readyRow.reward_energy, "reward wallet energy");
  assert(rewardWallet.totalXp === xpBefore + readyRow.reward_xp, "reward wallet xp");

  const payout = await json("/api/creator/balance", { headers: auth(accountA.token) });
  assert(payout.status === 200, "payout");
  assert((payout.body as { gbp: { available_pence: number } }).gbp.available_pence === 0, "no gbp leakage");

  const crossClaim = await json(`/api/engagement/missions/${encodeURIComponent(missionId)}/claim`, {
    method: "POST",
    headers: auth(accountB.token),
    body: "{}",
  });
  assert(crossClaim.status === 400, `B claim incomplete → ${crossClaim.status}`);

  const listB = await json("/api/engagement/missions", { headers: auth(accountB.token) });
  const bRow = (listB.body as { missions: Mission[] }).missions.find((m) => m.id === missionId)!;
  assert(bRow.progress === 0 && bRow.claimed === false, "B isolated progress");

  const bNeon = await getPool()!.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM user_mission_progress WHERE user_id = $1 AND mission_id = $2 AND claimed = TRUE`,
    [accountB.id, missionId],
  );
  assert((bNeon.rows[0]?.n ?? 0) === 0, "B no claimed row");

  const logout = await json("/api/auth/logout", { method: "POST", headers: auth(accountA.token) });
  assert(logout.status === 200, "logout");
  assert(
    (await json("/api/engagement/missions", { headers: auth(accountA.token) })).status === 401,
    "post-logout 401",
  );

  console.log("PAGE-048 MISSIONS RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        missionId,
        period,
        goal,
        rewards: {
          xp: readyRow.reward_xp,
          promo: readyRow.reward_promo_coins,
          energy: readyRow.reward_energy,
        },
        claimBeforeCompleteRejected: true,
        forgedProgressRejected: true,
        duplicateClaimIdempotent: true,
        concurrentClaimSafe: true,
        neonAtomic: true,
        hubSynced: true,
        fanLevelSynced: true,
        rewardWalletSynced: true,
        paidSeparated: true,
        payoutSeparated: true,
        accountIsolated: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-048 MISSIONS RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
