/**
 * PAGE-052 runtime proof — Engagement Reward Wallet GET, mission/achievement sync,
 * PAGE-039/045 separation, forged mutation rejection, account isolation.
 * Run: npx tsx scripts/_page052_reward_wallet_runtime_proof.ts
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
process.env.ENGAGEMENT_NEON_APPROVED = process.env.ENGAGEMENT_NEON_APPROVED || "true";
process.env.PROMOTIONAL_COINS_ENABLED = process.env.PROMOTIONAL_COINS_ENABLED || "true";
process.env.BATTLE_ENERGY_ENABLED = process.env.BATTLE_ENERGY_ENABLED || "true";
process.env.MISSION_REWARDS_ENABLED = process.env.MISSION_REWARDS_ENABLED || "true";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { getPool } = await import("../server/infra/postgres.ts");
const {
  engagementRewardWalletResponseSchema,
  engagementHubResponseSchema,
  engagementFanLevelResponseSchema,
} = await import("../shared/contracts/engagement.ts");
const { bumpAchievement } = await import("../server/modules/engagement/achievements.ts");
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
  const username = `p52${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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

type Wallet = {
  purchasedCoins: number;
  starterCoins: number;
  promotionalCoins: number;
  totalGiftSpendable: number;
  battleEnergy: number;
  totalXp: number;
  fanLevel: number;
  fanTier: string;
};

try {
  const page = readFileSync(resolve("src/pages/engagement/EngagementRewards.tsx"), "utf8");
  const api = readFileSync(resolve("src/features/engagement/engagementRewardWalletApi.ts"), "utf8");
  const session = readFileSync(resolve("src/features/engagement/engagementRewardWalletSession.ts"), "utf8");
  const router = readFileSync(resolve("server/modules/engagement/router.ts"), "utf8");
  const rewardSrc = readFileSync(resolve("server/modules/engagement/rewardWallet.ts"), "utf8");
  const hubPage = readFileSync(resolve("src/pages/engagement/EngagementHub.tsx"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const payoutSrc = readFileSync(resolve("server/modules/payouts/service.ts"), "utf8");
  const walletRouter = readFileSync(resolve("server/modules/wallet/router.ts"), "utf8");

  assert(app.includes('path="/engagement/rewards"'), "route");
  assert(app.includes("RequireAuth"), "RequireAuth");
  assert(page.includes("Reward Wallet") && page.includes("ENGAGEMENT_HOME"), "page");
  assert(page.includes("Purchased Coins") && page.includes("Battle Energy") && page.includes("Test coins"), "OLD rows");
  assert(hubPage.includes("/engagement/rewards"), "hub child");
  assert(api.includes("/api/engagement/wallet"), "api");
  assert(router.includes('router.get("/wallet"') && !router.includes('router.post("/wallet"'), "GET only");
  assert(rewardSrc.includes("wallet_balances") && rewardSrc.includes("getProgressionSnapshot"), "owner");
  assert(session.includes("++generation"), "stale gen");
  assert(!page.includes("localStorage") && !page.includes("WebSocket"), "no local/ws");
  assert(!payoutSrc.includes("getRewardWalletForUser"), "payout sep");
  assert(!walletRouter.includes("battle_energy") && !walletRouter.includes("total_xp"), "page039 no xp/energy");

  assert((await json("/api/health")).status === 200, "health");
  assert((await json("/api/engagement/wallet")).status === 401, "unauth");

  const accountA = await register("a");
  const accountB = await register("b");

  const listed = await json(`/api/engagement/wallet?userId=${accountB.id}`, {
    headers: auth(accountA.token),
  });
  assert(listed.status === 200 || listed.status === 404, `wallet → ${listed.status}`);
  if (listed.status === 404) {
    throw new Error(
      "ENGAGEMENT_HUB_DISABLED on target server — start proof server with ENGAGEMENT_HUB_ENABLED=true",
    );
  }
  assert(engagementRewardWalletResponseSchema.safeParse(listed.body).success, "schema");
  assert((listed.body as { test_coins?: unknown }).test_coins === undefined, "no test coins");
  const zero = (listed.body as { wallet: Wallet }).wallet;
  assert(zero.purchasedCoins === 0 && zero.promotionalCoins === 0 && zero.battleEnergy === 0, "zero start");
  assert(zero.starterCoins >= 0 && zero.totalGiftSpendable === zero.starterCoins, "starter spendable");

  const forgedWallet = await json("/api/engagement/wallet", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ promotionalCoins: 999999, battleEnergy: 999999, totalXp: 999999 }),
  });
  assert(forgedWallet.status !== 200, `forged wallet POST → ${forgedWallet.status}`);
  const forgedPromo = await json("/api/engagement/promo", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ promotional_balance: 999999 }),
  });
  assert([404, 405].includes(forgedPromo.status), `forged promo → ${forgedPromo.status}`);
  const forgedEnergy = await json("/api/engagement/energy", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ energy: 999999 }),
  });
  assert([404, 405].includes(forgedEnergy.status), `forged energy → ${forgedEnergy.status}`);
  const forgedXp = await json("/api/engagement/xp", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ xp: 999999 }),
  });
  assert([404, 405].includes(forgedXp.status), `forged xp → ${forgedXp.status}`);
  const forgedSet = await json("/api/rewards/set-balance", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ purchasedCoins: 999, promotionalCoins: 999, totalXp: 999 }),
  });
  assert(forgedSet.status !== 200, `forged set-balance → ${forgedSet.status}`);

  await getPool()!.query(`UPDATE wallet_balances SET paid_coins = paid_coins + 7 WHERE user_id = $1`, [accountA.id]);
  const afterPaid = await json("/api/engagement/wallet", { headers: auth(accountA.token) });
  const paidWallet = (afterPaid.body as { wallet: Wallet }).wallet;
  assert(paidWallet.purchasedCoins === 7 && paidWallet.battleEnergy === 0 && paidWallet.totalXp === 0, "IAP/paid only");
  assert(paidWallet.totalGiftSpendable === paidWallet.starterCoins + 7, "spendable +paid");

  const page039 = await json("/api/wallet", { headers: auth(accountA.token) });
  assert(Number((page039.body as { coin_balance: number }).coin_balance) === 7, "PAGE-039 paid");
  assert((page039.body as { battle_energy?: unknown }).battle_energy === undefined, "PAGE-039 no energy");
  assert((page039.body as { total_xp?: unknown }).total_xp === undefined, "PAGE-039 no xp");

  const period = missionPeriodKey("daily");
  await getPool()!.query(
    `INSERT INTO user_mission_progress (user_id, mission_id, period_key, progress, claimed)
     VALUES ($1, 'daily_like', $2, 5, FALSE)
     ON CONFLICT (user_id, mission_id, period_key)
     DO UPDATE SET progress = 5, claimed = FALSE`,
    [accountA.id, period],
  );
  await getPool()!.query(
    `UPDATE engagement_missions
     SET reward_xp = 6, reward_energy = 2, reward_promo_coins = GREATEST(reward_promo_coins, 10)
     WHERE id = 'daily_like'`,
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
  assert(claim2.status === 200, "dup claim");
  assert((claim2.body as { alreadyClaimed?: boolean }).alreadyClaimed === true, "alreadyClaimed");

  const afterMission = await json("/api/engagement/wallet", { headers: auth(accountA.token) });
  const m = (afterMission.body as { wallet: Wallet }).wallet;
  assert(m.purchasedCoins === 7, "paid unchanged after mission");
  assert(m.promotionalCoins === 10, "promo +10");
  assert(m.battleEnergy === 2, "energy +2");
  assert(m.totalXp === 6, "xp +6");
  assert(m.totalGiftSpendable === m.starterCoins + 7 + 10, "spendable after mission");

  await bumpAchievement(accountA.id, "gifts_sent", 1);
  const afterAch = await json("/api/engagement/wallet", { headers: auth(accountA.token) });
  const a = (afterAch.body as { wallet: Wallet }).wallet;
  assert(a.purchasedCoins === 7, "paid unchanged after achievement");
  assert(a.promotionalCoins === 110, "promo +100 achievement");
  assert(a.battleEnergy === 2, "energy unchanged by first_gift");
  assert(a.totalXp === 56, "xp +50 achievement");

  const hub = await json("/api/engagement/hub", { headers: auth(accountA.token) });
  assert(engagementHubResponseSchema.safeParse(hub.body).success, "hub schema");
  assert(
    (hub.body as { hub: { promotional_balance: number; battle_energy: number; total_xp: number } }).hub
      .promotional_balance === 110,
    "hub promo",
  );
  assert((hub.body as { hub: { battle_energy: number } }).hub.battle_energy === 2, "hub energy");
  assert((hub.body as { hub: { total_xp: number } }).hub.total_xp === 56, "hub xp");

  const fan = await json("/api/engagement/fan-level", { headers: auth(accountA.token) });
  assert(engagementFanLevelResponseSchema.safeParse(fan.body).success, "fan schema");
  assert((fan.body as { fan_level: { total_xp: number } }).fan_level.total_xp === 56, "fan xp match");

  const page039After = await json("/api/wallet", { headers: auth(accountA.token) });
  assert(Number((page039After.body as { coin_balance: number }).coin_balance) === 7, "PAGE-039 paid still 7");
  assert(
    Number((page039After.body as { promotional_balance: number }).promotional_balance) === 110,
    "PAGE-039 promo mirrors engagement promo coin bucket",
  );

  const payout = await json("/api/creator/balance", { headers: auth(accountA.token) });
  assert(payout.status === 200, "payout");
  assert((payout.body as { gbp: { available_pence: number } }).gbp.available_pence === 0, "no GBP");

  const ledgerMission = await getPool()!.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM wallet_ledger
     WHERE user_id = $1 AND reason = 'mission_claim' AND ref_id = 'daily_like'`,
    [accountA.id],
  );
  assert((ledgerMission.rows[0]?.n ?? 0) === 1, "one mission_claim ledger");
  const ledgerAch = await getPool()!.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM wallet_ledger
     WHERE user_id = $1 AND reason = 'achievement_unlock' AND ref_id = 'first_gift'`,
    [accountA.id],
  );
  assert((ledgerAch.rows[0]?.n ?? 0) === 1, "one achievement_unlock ledger");

  const isolated = await json("/api/engagement/wallet", { headers: auth(accountB.token) });
  const b = (isolated.body as { wallet: Wallet }).wallet;
  assert(b.purchasedCoins === 0 && b.promotionalCoins === 0 && b.battleEnergy === 0 && b.totalXp === 0, "B isolated");

  const logout = await json("/api/auth/logout", { method: "POST", headers: auth(accountA.token) });
  assert(logout.status === 200, "logout");
  assert(
    (await json("/api/engagement/wallet", { headers: auth(accountA.token) })).status === 401,
    "post-logout 401",
  );

  console.log("PAGE-052 REWARD WALLET RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        engagementWalletGet: true,
        forgedRejected: true,
        paidIapSeparatedFromEnergyXp: true,
        missionRewardSynced: true,
        achievementRewardSynced: true,
        hubConsistent: true,
        fanLevelConsistent: true,
        page039PaidSeparated: true,
        payoutSeparated: true,
        duplicateClaimSafe: true,
        accountIsolated: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-052 REWARD WALLET RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
