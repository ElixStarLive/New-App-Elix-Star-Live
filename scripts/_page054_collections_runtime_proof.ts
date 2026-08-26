/**
 * PAGE-054 runtime proof — Collections treasure/stickers/cards, server-owned chest open,
 * spawn denial, Neon persistence, PAGE-052 sync, account isolation.
 * Run: npx tsx scripts/_page054_collections_runtime_proof.ts
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
process.env.TREASURE_HUNT_ENABLED = process.env.TREASURE_HUNT_ENABLED || "true";
process.env.PROMOTIONAL_COINS_ENABLED = process.env.PROMOTIONAL_COINS_ENABLED || "true";
process.env.BATTLE_ENERGY_ENABLED = process.env.BATTLE_ENERGY_ENABLED || "true";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { getPool } = await import("../server/infra/postgres.ts");
const {
  engagementTreasureResponseSchema,
  engagementStickersResponseSchema,
  engagementCreatorCardsResponseSchema,
  engagementChestOpenResponseSchema,
  engagementRewardWalletResponseSchema,
  engagementFanLevelResponseSchema,
} = await import("../shared/contracts/engagement.ts");
const { spawnTreasureChest, grantStickerForUser } = await import(
  "../server/modules/engagement/collections.ts"
);

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
  const username = `p54${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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
  const page = readFileSync(resolve("src/pages/engagement/EngagementCollections.tsx"), "utf8");
  const api = readFileSync(resolve("src/features/engagement/engagementCollectionsApi.ts"), "utf8");
  const session = readFileSync(resolve("src/features/engagement/engagementCollectionsSession.ts"), "utf8");
  const router = readFileSync(resolve("server/modules/engagement/router.ts"), "utf8");
  const collections = readFileSync(resolve("server/modules/engagement/collections.ts"), "utf8");
  const hubPage = readFileSync(resolve("src/pages/engagement/EngagementHub.tsx"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const payoutSrc = readFileSync(resolve("server/modules/payouts/service.ts"), "utf8");

  assert(app.includes('path="/engagement/collections"'), "route");
  assert(app.includes("RequireAuth"), "RequireAuth");
  assert(page.includes("Collections") && page.includes("Treasure Hunt") && page.includes("Stickers"), "page");
  assert(hubPage.includes("/engagement/collections"), "hub child");
  assert(api.includes("/api/engagement/treasure") && api.includes("/open"), "treasure api");
  assert(api.includes("/api/engagement/stickers") && api.includes("/api/engagement/creator-cards"), "inventory apis");
  assert(router.includes("SPAWN_SERVER_ONLY"), "spawn denied");
  assert(collections.includes("FOR UPDATE OF c") && collections.includes("alreadyOpened"), "open atomic");
  assert(session.includes("++generation"), "stale gen");
  assert(!page.includes("Math.random") && !page.includes("localStorage"), "no client authority");
  assert(!payoutSrc.includes("openTreasureChestForUser"), "payout sep");

  assert((await json("/api/health")).status === 200, "health");
  assert((await json("/api/engagement/treasure")).status === 401, "unauth treasure");

  const accountA = await register("a");
  const accountB = await register("b");
  const race = await register("r");

  const empty = await json(`/api/engagement/treasure?userId=${accountB.id}`, {
    headers: auth(accountA.token),
  });
  assert(empty.status === 200 || empty.status === 404, `treasure → ${empty.status}`);
  if (empty.status === 404) {
    throw new Error(
      "ENGAGEMENT_HUB_DISABLED on target server — start proof server with ENGAGEMENT_HUB_ENABLED=true",
    );
  }
  assert(engagementTreasureResponseSchema.safeParse(empty.body).success, "treasure schema");
  assert(Array.isArray((empty.body as { chests: unknown[] }).chests), "chests array");
  assert(((empty.body as { chests: unknown[] }).chests).length === 0, "no fake chests");

  const stickers = await json("/api/engagement/stickers", { headers: auth(accountA.token) });
  assert(stickers.status === 200, "stickers");
  assert(engagementStickersResponseSchema.safeParse(stickers.body).success, "stickers schema");
  assert(((stickers.body as { sets: unknown[] }).sets).length > 0, "sticker sets");

  const cards = await json("/api/engagement/creator-cards", { headers: auth(accountA.token) });
  assert(cards.status === 200, "cards");
  assert(engagementCreatorCardsResponseSchema.safeParse(cards.body).success, "cards schema");
  assert(((cards.body as { unlocked: unknown[] }).unlocked).length === 0, "no fake cards");

  const spawnDenied = await json("/api/engagement/treasure/spawn", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ chestDefId: "chest_common_watch", rarity: "mythic", reward_xp: 9999 }),
  });
  assert(spawnDenied.status === 403, `spawn denied → ${spawnDenied.status}`);
  assert((spawnDenied.body as { error?: string }).error === "SPAWN_SERVER_ONLY", "SPAWN_SERVER_ONLY");

  await getPool()!.query(`UPDATE wallet_balances SET paid_coins = 9, promo_coins = 2 WHERE user_id = $1`, [
    accountA.id,
  ]);

  const firstSpawn = await spawnTreasureChest(accountA.id, "chest_common_watch", "proof");
  const secondSpawn = await spawnTreasureChest(accountA.id, "chest_common_watch", "proof");
  assert(firstSpawn.ok === true, "first spawn");
  assert(secondSpawn.ok === false && (secondSpawn as { error?: string }).error === "COOLDOWN", "cooldown");
  const chestId = firstSpawn.ok ? firstSpawn.chest_id : "";
  assert(Boolean(chestId), "chest id");

  const listed = await json("/api/engagement/treasure", { headers: auth(accountA.token) });
  assert(
    ((listed.body as { chests: Array<{ id: string; status: string }> }).chests)[0]?.id === chestId &&
      ((listed.body as { chests: Array<{ status: string }> }).chests)[0]?.status === "found",
    "found chest listed",
  );

  const stolen = await json(`/api/engagement/treasure/${chestId}/open`, {
    method: "POST",
    headers: auth(accountB.token),
    body: "{}",
  });
  assert(stolen.status === 404, `cross-account open → ${stolen.status}`);

  const forgedOpen = await json(`/api/engagement/treasure/${chestId}/open`, {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({
      reward_xp: 9999,
      reward_promo_coins: 9999,
      rarity: "mythic",
      desiredReward: "paid",
    }),
  });
  assert(forgedOpen.status === 200, `open → ${forgedOpen.status}`);
  assert(engagementChestOpenResponseSchema.safeParse(forgedOpen.body).success, "open schema");
  assert(
    (forgedOpen.body as { reward: { reward_xp: number; reward_promo_coins: number; rarity: string } }).reward
      .reward_xp === 50,
    "server XP reward",
  );
  assert(
    (forgedOpen.body as { reward: { reward_promo_coins: number; rarity: string } }).reward.reward_promo_coins ===
      25,
    "server promo reward",
  );
  assert((forgedOpen.body as { reward: { rarity: string } }).reward.rarity === "common", "server rarity");
  assert((forgedOpen.body as { alreadyOpened?: boolean }).alreadyOpened !== true, "first open settles");

  const retry = await json(`/api/engagement/treasure/${chestId}/open`, {
    method: "POST",
    headers: auth(accountA.token),
    body: "{}",
  });
  assert(retry.status === 200, "retry open");
  assert((retry.body as { alreadyOpened?: boolean }).alreadyOpened === true, "alreadyOpened");

  const [c1, c2] = await Promise.all([
    json(`/api/engagement/treasure/${chestId}/open`, {
      method: "POST",
      headers: auth(accountA.token),
      body: "{}",
    }),
    json(`/api/engagement/treasure/${chestId}/open`, {
      method: "POST",
      headers: auth(accountA.token),
      body: "{}",
    }),
  ]);
  assert(c1.status === 200 && c2.status === 200, "concurrent open status");
  assert(
    (c1.body as { alreadyOpened?: boolean }).alreadyOpened === true &&
      (c2.body as { alreadyOpened?: boolean }).alreadyOpened === true,
    "concurrent alreadyOpened",
  );

  const wallet = await json("/api/engagement/wallet", { headers: auth(accountA.token) });
  assert(engagementRewardWalletResponseSchema.safeParse(wallet.body).success, "wallet schema");
  assert(
    (wallet.body as { wallet: { purchasedCoins: number; promotionalCoins: number; battleEnergy: number; totalXp: number } })
      .wallet.purchasedCoins === 9,
    "paid unchanged",
  );
  assert(
    (wallet.body as { wallet: { promotionalCoins: number } }).wallet.promotionalCoins === 27,
    "promo +25",
  );
  assert((wallet.body as { wallet: { battleEnergy: number } }).wallet.battleEnergy === 10, "energy +10");
  assert((wallet.body as { wallet: { totalXp: number } }).wallet.totalXp === 50, "xp +50");

  const fan = await json("/api/engagement/fan-level", { headers: auth(accountA.token) });
  assert(engagementFanLevelResponseSchema.safeParse(fan.body).success, "fan schema");
  assert((fan.body as { fan_level: { total_xp: number } }).fan_level.total_xp === 50, "fan xp");

  const ledger = await getPool()!.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM wallet_ledger
     WHERE user_id = $1 AND reason = 'treasure_chest' AND ref_id = $2`,
    [accountA.id, chestId],
  );
  assert((ledger.rows[0]?.n ?? 0) === 1, "one treasure_chest ledger");

  const neon = await getPool()!.query<{ status: string; opened_at: string | null }>(
    `SELECT status, opened_at::text AS opened_at FROM user_treasure_chests WHERE id = $1 AND user_id = $2`,
    [chestId, accountA.id],
  );
  assert(neon.rows[0]?.status === "opened" && Boolean(neon.rows[0]?.opened_at), "Neon opened");

  const payout = await json("/api/creator/balance", { headers: auth(accountA.token) });
  assert((payout.body as { gbp: { available_pence: number } }).gbp.available_pence === 0, "no GBP");

  const raceChest = await spawnTreasureChest(race.id, "chest_rare_missions", "proof-race");
  assert(raceChest.ok === true, "race spawn");
  const raceId = raceChest.ok ? raceChest.chest_id : "";
  const [r1, r2] = await Promise.all([
    json(`/api/engagement/treasure/${raceId}/open`, { method: "POST", headers: auth(race.token), body: "{}" }),
    json(`/api/engagement/treasure/${raceId}/open`, { method: "POST", headers: auth(race.token), body: "{}" }),
  ]);
  assert(r1.status === 200 && r2.status === 200, "race open status");
  const raceWins = [r1.body, r2.body].filter((body) => (body as { alreadyOpened?: boolean }).alreadyOpened !== true);
  assert(raceWins.length === 1, "exactly one race settlement");

  const stickerGrant = await grantStickerForUser(accountA.id, "animals_fox");
  assert(stickerGrant.ok === true, "sticker grant ok");
  const forgedSticker = await json("/api/engagement/stickers", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ stickerId: "animals_fox", owned: 99 }),
  });
  assert(forgedSticker.status === 404 || forgedSticker.status === 405 || forgedSticker.status === 401, `forged sticker → ${forgedSticker.status}`);
  const forgedCard = await json("/api/engagement/creator-cards", {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ creatorId: accountB.id, tier: "mythic" }),
  });
  assert(forgedCard.status === 404 || forgedCard.status === 405 || forgedCard.status === 401, `forged card → ${forgedCard.status}`);

  const stickersAfter = await json("/api/engagement/stickers", { headers: auth(accountA.token) });
  const fox = ((stickersAfter.body as { sets: Array<{ stickers: Array<{ id: string; owned: number }> }> }).sets)
    .flatMap((set) => set.stickers)
    .find((s) => s.id === "animals_fox");
  assert(fox != null && fox.owned >= 1, "sticker owned after grant");

  const isolated = await json("/api/engagement/treasure", { headers: auth(accountB.token) });
  assert(
    !((isolated.body as { chests: Array<{ id: string }> }).chests).some((c) => c.id === chestId),
    "B cannot see A chest",
  );

  const logout = await json("/api/auth/logout", { method: "POST", headers: auth(accountA.token) });
  assert(logout.status === 200, "logout");
  assert(
    (await json("/api/engagement/treasure", { headers: auth(accountA.token) })).status === 401,
    "post-logout 401",
  );

  console.log("PAGE-054 COLLECTIONS RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        inventoryApis: true,
        spawnServerOnly: true,
        cooldownSpawn: true,
        chestOpenOnce: true,
        forgedRewardIgnored: true,
        crossAccountOpenDenied: true,
        concurrentOpenSafe: true,
        walletSynced: true,
        fanLevelSynced: true,
        neonOpened: true,
        stickerForgedRejected: true,
        cardForgedRejected: true,
        accountIsolated: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-054 COLLECTIONS RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
