/**
 * PAGE-051 runtime proof — Achievements GET, Neon unlock via gift metric,
 * auto reward settlement, forged unlock rejection, wallet/payout separation.
 * OLD has no Claim button — rewards auto-settle on unlock.
 * Run: npx tsx scripts/_page051_achievements_runtime_proof.ts
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
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

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { getPool } = await import("../server/infra/postgres.ts");
const {
  engagementAchievementsResponseSchema,
  engagementFanLevelResponseSchema,
  engagementRewardWalletResponseSchema,
} = await import("../shared/contracts/engagement.ts");
const { bumpAchievement } = await import("../server/modules/engagement/achievements.ts");

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
  const username = `p51${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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

type Ach = {
  id: string;
  name: string;
  progress: number;
  goal_count: number;
  unlocked: boolean;
  claimed: boolean;
  reward_xp: number;
  reward_promo_coins: number;
  rarity: string;
};

try {
  const page = readFileSync(resolve("src/pages/engagement/EngagementAchievements.tsx"), "utf8");
  const api = readFileSync(resolve("src/features/engagement/engagementAchievementsApi.ts"), "utf8");
  const session = readFileSync(resolve("src/features/engagement/engagementAchievementsSession.ts"), "utf8");
  const router = readFileSync(resolve("server/modules/engagement/router.ts"), "utf8");
  const achSrc = readFileSync(resolve("server/modules/engagement/achievements.ts"), "utf8");
  const giftsSrc = readFileSync(resolve("server/modules/gifts/router.ts"), "utf8");
  const hubPage = readFileSync(resolve("src/pages/engagement/EngagementHub.tsx"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const payoutSrc = readFileSync(resolve("server/modules/payouts/service.ts"), "utf8");
  const walletSrc = readFileSync(resolve("server/modules/wallet/router.ts"), "utf8");

  assert(app.includes('path="/engagement/achievements"'), "route");
  assert(app.includes("RequireAuth"), "RequireAuth");
  assert(page.includes("Achievements") && page.includes("ENGAGEMENT_HOME"), "page");
  assert(!page.includes("Claim"), "no invent Claim");
  assert(hubPage.includes("/engagement/achievements"), "hub child");
  assert(api.includes("/api/engagement/achievements"), "api");
  assert(router.includes('router.get("/achievements"') && !router.includes('router.post("/achievements"'), "GET only");
  assert(achSrc.includes("user_achievements") && achSrc.includes("claimed = TRUE"), "Neon unlock/claim");
  assert(giftsSrc.includes("bumpAchievement") && giftsSrc.includes("gifts_sent"), "gift writer");
  assert(session.includes("++generation"), "stale gen");
  assert(!page.includes("localStorage") && !page.includes("WebSocket"), "no local/ws");
  assert(!payoutSrc.includes("bumpAchievement"), "payout sep");
  assert(!walletSrc.includes("user_achievements"), "wallet sep");

  assert((await json("/api/health")).status === 200, "health");
  assert((await json("/api/engagement/achievements")).status === 401, "unauth");

  const accountA = await register("a");
  const accountB = await register("b");
  const creator = await register("c");

  const listed = await json(`/api/engagement/achievements?userId=${accountB.id}`, {
    headers: auth(accountA.token),
  });
  assert(listed.status === 200 || listed.status === 404, `achievements → ${listed.status}`);
  if (listed.status === 404) {
    throw new Error(
      "ENGAGEMENT_HUB_DISABLED on target server — start proof server with ENGAGEMENT_HUB_ENABLED=true",
    );
  }
  assert(engagementAchievementsResponseSchema.safeParse(listed.body).success, "schema");
  const catalog = (listed.body as { achievements: Ach[] }).achievements;
  assert(catalog.length > 0, "definitions present");
  assert(catalog.every((row) => row.progress === 0 && row.unlocked === false), "locked start");
  const ids = catalog.map((row) => row.id);
  assert(ids.includes("first_gift"), "first_gift defined");
  assert(!ids.includes("likes_50") && !ids.includes("gifts_10"), "legacy disabled");

  const forgedUnlock = await json("/api/engagement/achievements/first_gift/unlock", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ unlocked: true, progress: 100, reward_xp: 999999 }),
  });
  assert(forgedUnlock.status !== 200, `forged unlock → ${forgedUnlock.status}`);
  const forgedPost = await json("/api/engagement/achievements", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ progress: 999, unlocked: true }),
  });
  assert(forgedPost.status !== 200, `forged POST → ${forgedPost.status}`);

  const firstGift = catalog.find((row) => row.id === "first_gift")!;
  assert(firstGift.goal_count === 1 && firstGift.reward_xp === 50 && firstGift.reward_promo_coins === 100, "first_gift rewards");

  const stream = await getPool()!.query<{ id: string }>(
    `INSERT INTO live_streams (host_id, room_id, title) VALUES ($1, $2, 'p51-proof') RETURNING id::text AS id`,
    [creator.id, `p51-${creator.id}`],
  );
  const streamId = stream.rows[0].id;
  await getPool()!.query(`UPDATE wallet_balances SET promo_coins = promo_coins + 5 WHERE user_id = $1`, [accountA.id]);

  const walletBefore = await json("/api/wallet", { headers: auth(accountA.token) });
  const paidBefore = Number((walletBefore.body as { coin_balance: number }).coin_balance ?? 0);
  const promoBefore = Number((walletBefore.body as { promotional_balance: number }).promotional_balance ?? 0);
  const rose = await getPool()!.query<{ coin_cost: number }>(`SELECT coin_cost FROM gifts WHERE id = 'rose'`);
  const roseCost = Number(rose.rows[0]?.coin_cost ?? 1);
  assert(roseCost > 0, "rose cost");
  const fanBefore = await json("/api/engagement/fan-level", { headers: auth(accountA.token) });
  assert(engagementFanLevelResponseSchema.safeParse(fanBefore.body).success, "fan schema");
  const xpBefore = Number((fanBefore.body as { fan_level: { total_xp: number } }).fan_level.total_xp ?? 0);

  const starterGift = await json("/api/gifts/send", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({
      giftId: "rose",
      recipientId: creator.id,
      streamId,
      idempotencyKey: randomUUID(),
      bucket: "starter",
    }),
  });
  assert(starterGift.status === 200, `starter gift → ${starterGift.status}`);
  const afterStarter = await json("/api/engagement/achievements", { headers: auth(accountA.token) });
  assert(
    (afterStarter.body as { achievements: Ach[] }).achievements.find((row) => row.id === "first_gift")?.progress === 0,
    "starter gift does not unlock",
  );

  const promoKey = randomUUID();
  const promoGift = await json("/api/gifts/send", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({
      giftId: "rose",
      recipientId: creator.id,
      streamId,
      idempotencyKey: promoKey,
      bucket: "promo",
    }),
  });
  assert(promoGift.status === 200, `promo gift → ${promoGift.status}`);

  const unlocked = await json("/api/engagement/achievements", { headers: auth(accountA.token) });
  const giftRow = (unlocked.body as { achievements: Ach[] }).achievements.find((row) => row.id === "first_gift")!;
  assert(giftRow.progress === 1 && giftRow.unlocked === true && giftRow.claimed === true, "unlocked+claimed");

  const promoRetry = await json("/api/gifts/send", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({
      giftId: "rose",
      recipientId: creator.id,
      streamId,
      idempotencyKey: promoKey,
      bucket: "promo",
    }),
  });
  assert([200, 409].includes(promoRetry.status), `promo retry → ${promoRetry.status}`);

  await bumpAchievement(accountA.id, "gifts_sent", 1);
  await bumpAchievement(accountA.id, "gifts_sent", 1);
  const afterDup = await json("/api/engagement/achievements", { headers: auth(accountA.token) });
  const giftAfterDup = (afterDup.body as { achievements: Ach[] }).achievements.find((row) => row.id === "first_gift")!;
  assert(giftAfterDup.progress === 1 && giftAfterDup.claimed === true, "duplicate bump capped");

  const neon = await getPool()!.query<{ progress: number; unlocked: boolean; claimed: boolean }>(
    `SELECT progress, unlocked, claimed FROM user_achievements
     WHERE user_id = $1 AND achievement_id = 'first_gift'`,
    [accountA.id],
  );
  assert((neon.rows[0]?.progress ?? 0) === 1, "Neon progress");
  assert(neon.rows[0]?.unlocked === true && neon.rows[0]?.claimed === true, "Neon unlock/claim");

  const ledger = await getPool()!.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM wallet_ledger
     WHERE user_id = $1 AND reason = 'achievement_unlock' AND ref_id = 'first_gift'`,
    [accountA.id],
  );
  assert((ledger.rows[0]?.n ?? 0) === 1, "one achievement_unlock ledger");

  const walletAfter = await json("/api/wallet", { headers: auth(accountA.token) });
  const paidAfter = Number((walletAfter.body as { coin_balance: number }).coin_balance ?? 0);
  const promoAfter = Number((walletAfter.body as { promotional_balance: number }).promotional_balance ?? 0);
  assert(paidAfter === paidBefore, "paid coins unchanged");
  // Promo gift may also place the sender on the MVP board and auto-settle mvp_top10.
  const mvpTop = (unlocked.body as { achievements: Ach[] }).achievements.find((row) => row.id === "mvp_top10");
  const extraPromo = mvpTop?.unlocked ? mvpTop.reward_promo_coins : 0;
  const extraXp = mvpTop?.unlocked ? mvpTop.reward_xp : 0;
  const expectedPromo = promoBefore - roseCost + firstGift.reward_promo_coins + extraPromo;
  assert(
    promoAfter === expectedPromo,
    `promo ${promoBefore} - ${roseCost} + ${firstGift.reward_promo_coins}+${extraPromo} = ${expectedPromo}, got ${promoAfter}`,
  );

  const fanAfter = await json("/api/engagement/fan-level", { headers: auth(accountA.token) });
  assert(
    Number((fanAfter.body as { fan_level: { total_xp: number } }).fan_level.total_xp ?? 0) ===
      xpBefore + firstGift.reward_xp + extraXp,
    "XP credited for unlock settlement(s)",
  );

  const rewards = await json("/api/engagement/wallet", { headers: auth(accountA.token) });
  assert(rewards.status === 200, "reward wallet");
  assert(engagementRewardWalletResponseSchema.safeParse(rewards.body).success, "reward schema");
  assert(
    (rewards.body as { wallet: { promotionalCoins: number; totalXp: number } }).wallet.promotionalCoins === promoAfter,
    "reward wallet promo",
  );
  assert(
    (rewards.body as { wallet: { totalXp: number } }).wallet.totalXp === xpBefore + firstGift.reward_xp + extraXp,
    "reward wallet xp",
  );

  const payout = await json("/api/creator/balance", { headers: auth(accountA.token) });
  assert(payout.status === 200, "payout");
  assert((payout.body as { gbp: { available_pence: number } }).gbp.available_pence === 0, "no GBP");

  const isolated = await json("/api/engagement/achievements", { headers: auth(accountB.token) });
  const bGift = (isolated.body as { achievements: Ach[] }).achievements.find((row) => row.id === "first_gift")!;
  assert(bGift.progress === 0 && bGift.unlocked === false && bGift.claimed === false, "B isolated");

  const logout = await json("/api/auth/logout", { method: "POST", headers: auth(accountA.token) });
  assert(logout.status === 200, "logout");
  assert(
    (await json("/api/engagement/achievements", { headers: auth(accountA.token) })).status === 401,
    "post-logout 401",
  );

  console.log("PAGE-051 ACHIEVEMENTS RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        definitions: true,
        forgedRejected: true,
        starterExcluded: true,
        giftUnlockOnce: true,
        autoRewardSettled: true,
        duplicateBumpSafe: true,
        neonPersisted: true,
        xpSynced: true,
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
  console.error("PAGE-051 ACHIEVEMENTS RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
