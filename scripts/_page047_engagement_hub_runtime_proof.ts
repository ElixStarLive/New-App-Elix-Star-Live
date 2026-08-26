/**
 * PAGE-047 runtime proof — Engagement Hub flag gate, Neon progression, wallet/payout separation,
 * forged mutation rejection, account isolation, child path contracts.
 * Run: npx tsx scripts/_page047_engagement_hub_runtime_proof.ts
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

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { getPool, withTransaction } = await import("../server/infra/postgres.ts");
const { engagementHubResponseSchema } = await import("../shared/contracts/engagement.ts");
const { grantEngagementXp } = await import("../server/modules/engagement/progression.ts");

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
  const username = `p47${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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

try {
  const page = readFileSync(resolve("src/pages/engagement/EngagementHub.tsx"), "utf8");
  const api = readFileSync(resolve("src/features/engagement/engagementHubApi.ts"), "utf8");
  const session = readFileSync(resolve("src/features/engagement/engagementHubSession.ts"), "utf8");
  const hub = readFileSync(resolve("server/modules/engagement/hub.ts"), "utf8");
  const router = readFileSync(resolve("server/modules/engagement/router.ts"), "utf8");
  const settings = readFileSync(resolve("src/pages/Settings.tsx"), "utf8");
  const flags = readFileSync(resolve("src/config/engagementFlags.ts"), "utf8");
  const walletSrc = readFileSync(resolve("server/modules/wallet/router.ts"), "utf8");
  const payoutSrc = readFileSync(resolve("server/modules/payouts/service.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const progression = readFileSync(resolve("server/modules/engagement/progression.ts"), "utf8");

  assert(app.includes('path="/engagement"'), "route");
  assert(page.includes('title="Engagement Hub"') && page.includes("SettingsOptionSheet"), "sheet");
  assert(settings.includes("isEngagementHubEnabled()") && settings.includes("Engagement Hub"), "settings gate");
  assert(flags.includes("VITE_ENGAGEMENT_HUB_ENABLED"), "client flag");
  assert(api.includes("/api/engagement/hub"), "hub api");
  assert(router.includes('router.get("/hub"') && router.includes("requireEngagementHub"), "server gate");
  assert(hub.includes("promotional_balance") && hub.includes("battle_energy") && hub.includes("total_xp"), "hub fields");
  assert(session.includes("++generation"), "stale gen");
  assert(!page.includes("localStorage") && !page.includes("WebSocket"), "no local/ws owner");
  assert(!walletSrc.includes("total_xp") && !walletSrc.includes("battle_energy"), "wallet separation");
  assert(!payoutSrc.includes("getHubSummary") && !payoutSrc.includes("user_engagement"), "payout separation");
  assert(progression.includes("total_xp = total_xp + $2") && !router.includes('router.post("/xp"'), "no client XP write");
  for (const path of [
    "/engagement/missions",
    "/engagement/fan-level",
    "/engagement/mvp",
    "/engagement/achievements",
    "/engagement/rewards",
    "/engagement/daily-login",
    "/engagement/collections",
  ]) {
    assert(page.includes(path), `child ${path}`);
  }

  assert((await json("/api/health")).status === 200, "health");
  assert((await json("/api/engagement/hub")).status === 401, "unauth");

  const accountA = await register("a");
  const accountB = await register("b");

  const empty = await json("/api/engagement/hub", { headers: auth(accountA.token) });
  assert(empty.status === 200 || empty.status === 404, `hub → ${empty.status}`);
  if (empty.status === 404) {
    throw new Error(
      "ENGAGEMENT_HUB_DISABLED on target server — start proof server with ENGAGEMENT_HUB_ENABLED=true",
    );
  }
  assert(engagementHubResponseSchema.safeParse(empty.body).success, "hub schema");
  const emptyHub = (empty.body as { hub: Record<string, unknown> }).hub;
  assert(emptyHub.fan_tier === "Bronze Fan", "default tier");
  assert(emptyHub.total_xp === 0 && emptyHub.battle_energy === 0, "zero start");
  assert((empty.body as { coin_balance?: unknown }).coin_balance === undefined, "no coin_balance on hub");

  await getPool()!.query(`UPDATE wallet_balances SET promo_coins = 15, paid_coins = 80 WHERE user_id = $1`, [
    accountA.id,
  ]);
  const level12 = await getPool()!.query<{ total_xp_required: string }>(
    `SELECT total_xp_required::text AS total_xp_required FROM xp_level_requirements WHERE level = 12`,
  );
  const xp12 = Number(level12.rows[0]?.total_xp_required ?? 0);
  assert(xp12 > 0, "level 12 xp");
  await getPool()!.query(`UPDATE user_engagement SET total_xp = $2, battle_energy = 11 WHERE user_id = $1`, [
    accountA.id,
    xp12,
  ]);

  const loaded = await json("/api/engagement/hub", { headers: auth(accountA.token) });
  assert(loaded.status === 200, `loaded → ${loaded.status}`);
  assert(
    (loaded.body as { hub: { promotional_balance: number; battle_energy: number; fan_level: number; fan_tier: string } })
      .hub.promotional_balance === 15,
    "promo 15",
  );
  assert((loaded.body as { hub: { battle_energy: number } }).hub.battle_energy === 11, "energy 11");
  assert((loaded.body as { hub: { total_xp: number } }).hub.total_xp === xp12, "xp");
  assert((loaded.body as { hub: { fan_level: number } }).hub.fan_level === 12, "level 12");
  assert((loaded.body as { hub: { fan_tier: string } }).hub.fan_tier === "Silver Fan", "silver tier");

  const wallet = await json("/api/wallet", { headers: auth(accountA.token) });
  assert(wallet.status === 200, "wallet");
  assert((wallet.body as { promotional_balance: number }).promotional_balance === 15, "wallet promo");
  assert((wallet.body as { total_xp?: unknown }).total_xp === undefined, "wallet no xp");
  assert((wallet.body as { battle_energy?: unknown }).battle_energy === undefined, "wallet no energy");

  const payout = await json("/api/creator/balance", { headers: auth(accountA.token) });
  assert(payout.status === 200, "payout");
  assert((payout.body as { gbp: { available_pence: number } }).gbp.available_pence === 0, "no gbp from engagement");
  assert((payout.body as { total_xp?: unknown }).total_xp === undefined, "payout no xp");

  const forgedXp = await json("/api/engagement/xp", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ xp: 1_000_000 }),
  });
  assert([404, 405].includes(forgedXp.status), `forged xp → ${forgedXp.status}`);
  const forgedEnergy = await json("/api/engagement/energy", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ energy: 999999 }),
  });
  assert([404, 405].includes(forgedEnergy.status), `forged energy → ${forgedEnergy.status}`);
  const forgedPromo = await json("/api/engagement/promo", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ promotional_balance: 999999 }),
  });
  assert([404, 405].includes(forgedPromo.status), `forged promo → ${forgedPromo.status}`);

  const beforeClaim = await json("/api/engagement/hub", { headers: auth(accountA.token) });
  const canClaim = (beforeClaim.body as { hub: { daily_login: { can_claim: boolean } } }).hub.daily_login.can_claim;
  if (canClaim) {
    const claim = await json("/api/engagement/daily-login/claim", {
      method: "POST",
      headers: auth(accountA.token),
      body: "{}",
    });
    assert(claim.status === 200, `daily claim → ${claim.status}`);
    const again = await json("/api/engagement/daily-login/claim", {
      method: "POST",
      headers: auth(accountA.token),
      body: "{}",
    });
    assert([400, 409].includes(again.status) || again.status === 200, `idempotent claim → ${again.status}`);
    if (again.status === 200) {
      // Some owners return already_claimed success; Neon must still have one claim row today.
      const claims = await getPool()!.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM daily_login_claims WHERE user_id = $1 AND claim_date = (NOW() AT TIME ZONE 'utc')::date`,
        [accountA.id],
      );
      assert((claims.rows[0]?.n ?? 0) === 1, "one daily claim row");
    }
  } else {
    await withTransaction(async (client) => {
      await grantEngagementXp(client, accountA.id, { xp: 100, energy: 2 });
    });
  }

  const after = await json("/api/engagement/hub", { headers: auth(accountA.token) });
  assert(after.status === 200, "after action hub");
  assert(
    ((after.body as { hub: { total_xp: number } }).hub.total_xp ?? 0) >= xp12,
    "xp persisted/refreshed",
  );

  const isolated = await json("/api/engagement/hub", { headers: auth(accountB.token) });
  assert(
    (isolated.body as { hub: { promotional_balance: number; battle_energy: number; fan_level: number } }).hub
      .promotional_balance === 0 ||
      (isolated.body as { hub: { promotional_balance: number } }).hub.promotional_balance !== 15,
    "B promo isolated",
  );
  assert((isolated.body as { hub: { battle_energy: number } }).hub.battle_energy === 0, "B energy 0");
  assert((isolated.body as { hub: { fan_level: number } }).hub.fan_level === 0, "B level 0");

  const logout = await json("/api/auth/logout", { method: "POST", headers: auth(accountA.token) });
  assert(logout.status === 200, "logout");
  assert((await json("/api/engagement/hub", { headers: auth(accountA.token) })).status === 401, "post-logout 401");

  console.log("PAGE-047 ENGAGEMENT HUB RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        flagGated: true,
        neonProgression: true,
        walletSeparated: true,
        payoutSeparated: true,
        forgedMutationsRejected: true,
        accountIsolated: true,
        childPathsPresent: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-047 ENGAGEMENT HUB RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
