/**
 * PAGE-050 runtime proof — MVP gift-authored leaderboard, Neon mvp_scores,
 * period filters, forged mutation rejection, paid/test separation, account isolation.
 * OLD MVP is a gift-support board (today/week/all) — not watch/comment/share quests.
 * Run: npx tsx scripts/_page050_mvp_runtime_proof.ts
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

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { getPool } = await import("../server/infra/postgres.ts");
const { engagementMvpResponseSchema, engagementHubResponseSchema } = await import(
  "../shared/contracts/engagement.ts"
);
const { addMvpPoints } = await import("../server/modules/engagement/mvp.ts");

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
  const username = `p50${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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

type Row = { rank: number; user_id: string; points: number };

try {
  const page = readFileSync(resolve("src/pages/engagement/EngagementMvp.tsx"), "utf8");
  const api = readFileSync(resolve("src/features/engagement/engagementMvpApi.ts"), "utf8");
  const session = readFileSync(resolve("src/features/engagement/engagementMvpSession.ts"), "utf8");
  const router = readFileSync(resolve("server/modules/engagement/router.ts"), "utf8");
  const mvpSrc = readFileSync(resolve("server/modules/engagement/mvp.ts"), "utf8");
  const giftsSrc = readFileSync(resolve("server/modules/gifts/router.ts"), "utf8");
  const hubPage = readFileSync(resolve("src/pages/engagement/EngagementHub.tsx"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const payoutSrc = readFileSync(resolve("server/modules/payouts/service.ts"), "utf8");
  const walletSrc = readFileSync(resolve("server/modules/wallet/router.ts"), "utf8");

  assert(app.includes('path="/engagement/mvp"'), "route");
  assert(app.includes("RequireAuth"), "RequireAuth");
  assert(page.includes("MVP Leaderboard") && page.includes("ENGAGEMENT_HOME"), "page");
  assert(page.includes("gift support") && page.includes("Battle Energy"), "OLD copy");
  assert(hubPage.includes("/engagement/mvp"), "hub child");
  assert(api.includes("/api/engagement/mvp?period="), "api");
  assert(router.includes('router.get("/mvp"') && !router.includes('router.post("/mvp"'), "GET only");
  assert(mvpSrc.includes("mvp_scores") && mvpSrc.includes("gift_transaction_id"), "Neon owner");
  assert(giftsSrc.includes("addMvpPoints") && giftsSrc.includes("paid_gift"), "gift writer");
  assert(session.includes("++generation"), "stale gen");
  assert(!page.includes("localStorage") && !page.includes("WebSocket"), "no local/ws");
  assert(!payoutSrc.includes("addMvpPoints"), "payout sep");
  assert(!walletSrc.includes("mvp_scores"), "wallet sep");

  assert((await json("/api/health")).status === 200, "health");
  assert((await json("/api/engagement/mvp")).status === 401, "unauth");

  const accountA = await register("a");
  const accountB = await register("b");
  const creator = await register("c");

  const empty = await json("/api/engagement/mvp?period=today", { headers: auth(accountA.token) });
  assert(empty.status === 200 || empty.status === 404, `mvp → ${empty.status}`);
  if (empty.status === 404) {
    throw new Error(
      "ENGAGEMENT_HUB_DISABLED on target server — start proof server with ENGAGEMENT_HUB_ENABLED=true",
    );
  }
  assert(engagementMvpResponseSchema.safeParse(empty.body).success, "mvp schema");
  assert((empty.body as { viewer_id: string }).viewer_id === accountA.id, "viewer_id A");
  assert(Array.isArray((empty.body as { leaderboard: Row[] }).leaderboard), "leaderboard array");

  const forgedPost = await json("/api/engagement/mvp", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ progress: 9999, completed: true, energy: 100000, points: 9999 }),
  });
  assert(forgedPost.status !== 200, `forged POST → ${forgedPost.status}`);
  const forgedEnergy = await json("/api/engagement/energy", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ energy: 100000 }),
  });
  assert([404, 405].includes(forgedEnergy.status), `forged energy → ${forgedEnergy.status}`);

  const spoof = await json(`/api/engagement/mvp?period=today&userId=${accountB.id}`, {
    headers: auth(accountA.token),
  });
  assert((spoof.body as { viewer_id: string }).viewer_id === accountA.id, "userId query ignored");

  await getPool()!.query(
    `INSERT INTO mvp_scores (user_id, room_id, points, source, day_key)
     VALUES ($1, 'proof-room', 9, 'paid_gift', CURRENT_DATE),
            ($2, 'proof-room', 3, 'paid_gift', CURRENT_DATE - 3),
            ($2, 'proof-room', 1, 'paid_gift', CURRENT_DATE - 20)`,
    [accountA.id, accountB.id],
  );

  const today = await json("/api/engagement/mvp?period=today", { headers: auth(accountA.token) });
  const todayRows = (today.body as { leaderboard: Row[] }).leaderboard;
  const aToday = todayRows.find((row) => row.user_id === accountA.id);
  assert(aToday?.points === 9, `today A points ${aToday?.points}`);

  const week = await json("/api/engagement/mvp?period=week", { headers: auth(accountA.token) });
  const weekRows = (week.body as { leaderboard: Row[] }).leaderboard;
  assert(weekRows.find((row) => row.user_id === accountA.id)?.points === 9, "week A");
  assert(weekRows.find((row) => row.user_id === accountB.id)?.points === 3, "week B");

  const all = await json("/api/engagement/mvp?period=all", { headers: auth(accountA.token) });
  assert((all.body as { period: string }).period === "all", "all period");
  assert((all.body as { leaderboard: Row[] }).leaderboard.find((row) => row.user_id === accountB.id)?.points === 4, "all B");

  const stream = await getPool()!.query<{ id: string }>(
    `INSERT INTO live_streams (host_id, room_id, title) VALUES ($1, $2, 'p50-proof') RETURNING id::text AS id`,
    [creator.id, `p50-${creator.id}`],
  );
  const streamId = stream.rows[0].id;

  await getPool()!.query(
    `UPDATE wallet_balances SET promo_coins = promo_coins + 5, paid_coins = paid_coins + 5, starter_coins = starter_coins + 5 WHERE user_id = $1`,
    [accountA.id],
  );
  await getPool()!.query(
    `INSERT INTO paid_coin_lots (
       user_id, provider, provider_txn_id, product_id, coins_original, coins_remaining, gross_pence, settlement_status
     ) VALUES ($1, 'google', $2, 'coins1000', 5, 5, 500, 'settled')`,
    [accountA.id, `p50-lot-${accountA.id}`],
  );

  const walletBefore = await json("/api/wallet", { headers: auth(accountA.token) });
  const paidBefore = Number((walletBefore.body as { coin_balance: number }).coin_balance ?? 0);
  const hubBefore = await json("/api/engagement/hub", { headers: auth(accountA.token) });
  assert(engagementHubResponseSchema.safeParse(hubBefore.body).success, "hub schema");
  const energyBefore = Number((hubBefore.body as { hub: { battle_energy: number } }).hub.battle_energy ?? 0);
  const fanBefore = await json("/api/engagement/fan-level", { headers: auth(accountA.token) });
  const xpBefore = Number((fanBefore.body as { fan_level: { total_xp: number } }).fan_level.total_xp ?? 0);

  const promoGift = await json("/api/gifts/send", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({
      giftId: "rose",
      recipientId: creator.id,
      streamId,
      idempotencyKey: randomUUID(),
      bucket: "promo",
    }),
  });
  assert(promoGift.status === 200, `promo gift → ${promoGift.status}`);
  const afterPromo = await json("/api/engagement/mvp?period=today", { headers: auth(accountA.token) });
  assert(
    (afterPromo.body as { leaderboard: Row[] }).leaderboard.find((row) => row.user_id === accountA.id)?.points === 10,
    "promo gift +1 MVP",
  );

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
  const afterStarter = await json("/api/engagement/mvp?period=today", { headers: auth(accountA.token) });
  assert(
    (afterStarter.body as { leaderboard: Row[] }).leaderboard.find((row) => row.user_id === accountA.id)?.points === 10,
    "starter gift excluded from MVP",
  );

  const paidKey = randomUUID();
  const paidGift = await json("/api/gifts/send", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({
      giftId: "rose",
      recipientId: creator.id,
      streamId,
      idempotencyKey: paidKey,
      bucket: "paid",
    }),
  });
  assert(paidGift.status === 200, `paid gift → ${paidGift.status}`);
  const paidRetry = await json("/api/gifts/send", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({
      giftId: "rose",
      recipientId: creator.id,
      streamId,
      idempotencyKey: paidKey,
      bucket: "paid",
    }),
  });
  assert([200, 409].includes(paidRetry.status), `paid retry → ${paidRetry.status}`);
  const afterPaid = await json("/api/engagement/mvp?period=today", { headers: auth(accountA.token) });
  assert(
    (afterPaid.body as { leaderboard: Row[] }).leaderboard.find((row) => row.user_id === accountA.id)?.points === 11,
    "paid gift +1 once (idempotent)",
  );

  const txnId = String((paidGift.body as { transactionId?: string }).transactionId ?? "");
  assert(Boolean(txnId), "transactionId");
  await addMvpPoints(accountA.id, 50, {
    roomId: "proof-room",
    hostUserId: creator.id,
    source: "paid_gift",
    giftTransactionId: txnId,
  });
  const afterDupTxn = await json("/api/engagement/mvp?period=today", { headers: auth(accountA.token) });
  assert(
    (afterDupTxn.body as { leaderboard: Row[] }).leaderboard.find((row) => row.user_id === accountA.id)?.points === 11,
    "duplicate gift_transaction_id ignored",
  );

  const neon = await getPool()!.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM mvp_scores WHERE user_id = $1 AND gift_transaction_id = $2`,
    [accountA.id, txnId],
  );
  assert((neon.rows[0]?.n ?? 0) === 1, "one Neon mvp row per gift txn");

  const testGift = await json("/api/gifts/send", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({
      giftId: "rose",
      recipientId: creator.id,
      streamId,
      idempotencyKey: randomUUID(),
      bucket: "test",
    }),
  });
  assert([200, 400, 503].includes(testGift.status), `test gift → ${testGift.status}`);
  const afterTest = await json("/api/engagement/mvp?period=today", { headers: auth(accountA.token) });
  assert(
    (afterTest.body as { leaderboard: Row[] }).leaderboard.find((row) => row.user_id === accountA.id)?.points === 11,
    "test coins excluded from MVP",
  );

  await addMvpPoints(accountA.id, 7, { source: "test_gift", roomId: "x", hostUserId: creator.id });
  const afterTestSource = await json("/api/engagement/mvp?period=today", { headers: auth(accountA.token) });
  assert(
    (afterTestSource.body as { leaderboard: Row[] }).leaderboard.find((row) => row.user_id === accountA.id)?.points ===
      11,
    "test source skipped",
  );

  const hubAfter = await json("/api/engagement/hub", { headers: auth(accountA.token) });
  assert(
    Number((hubAfter.body as { hub: { battle_energy: number } }).hub.battle_energy ?? -1) === energyBefore,
    "Energy unchanged by MVP gifts path here",
  );

  const fanAfter = await json("/api/engagement/fan-level", { headers: auth(accountA.token) });
  const xpAfter = Number((fanAfter.body as { fan_level: { total_xp: number } }).fan_level.total_xp ?? 0);
  assert(xpAfter >= xpBefore, "XP not decreased");

  const walletAfter = await json("/api/wallet", { headers: auth(accountA.token) });
  const paidAfter = Number((walletAfter.body as { coin_balance: number }).coin_balance ?? 0);
  assert(paidAfter === paidBefore - 1, "paid debit only for paid gift");
  assert((walletAfter.body as { mvp_points?: unknown }).mvp_points === undefined, "wallet no mvp");

  const payout = await json("/api/creator/balance", { headers: auth(accountA.token) });
  assert(payout.status === 200, "payout");
  assert((payout.body as { mvp_points?: unknown }).mvp_points === undefined, "payout no mvp field");

  const boardB = await json("/api/engagement/mvp?period=today", { headers: auth(accountB.token) });
  assert((boardB.body as { viewer_id: string }).viewer_id === accountB.id, "B viewer");
  assert(
    (boardB.body as { leaderboard: Row[] }).leaderboard.find((row) => row.user_id === accountA.id)?.points === 11,
    "public board visible to B",
  );

  const logout = await json("/api/auth/logout", { method: "POST", headers: auth(accountA.token) });
  assert(logout.status === 200, "logout");
  assert(
    (await json("/api/engagement/mvp?period=today", { headers: auth(accountA.token) })).status === 401,
    "post-logout 401",
  );

  console.log("PAGE-050 MVP RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        giftAuthoredLeaderboard: true,
        periods: { today: true, week: true, all: true },
        promoCounts: true,
        starterExcluded: true,
        paidIdempotent: true,
        testExcluded: true,
        forgedRejected: true,
        neonGiftTxnUnique: true,
        energySeparated: true,
        paidWalletSeparated: true,
        payoutSeparated: true,
        viewerScoped: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-050 MVP RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
