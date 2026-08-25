import { getPool, withTransaction } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { applyWalletDelta, parseCoinCount } from "../wallet/ledger.js";
import { grantEngagementXp } from "./progression.js";
import { isSchemaUnavailable, mapEngagementDbError } from "./settings.js";
import type {
  EngagementChest,
  EngagementChestCatalog,
  EngagementChestOpenResponse,
  EngagementCreatorCard,
  EngagementCreatorCardProgress,
  EngagementCreatorCardsResponse,
  EngagementCreatorCardTier,
  EngagementStickerSet,
  EngagementStickersResponse,
  EngagementTreasureResponse,
} from "../../../shared/contracts/engagement.js";
import type { PoolClient } from "pg";

const CHEST_RARITIES = new Set(["common", "rare", "epic", "legendary", "mythic"]);
const STICKER_RARITIES = new Set(["common", "rare", "epic", "legendary"]);
const CHEST_STATUSES = new Set(["found", "opened", "expired"]);

function requiredCount(value: unknown, label: string): number {
  const n = parseCoinCount(value);
  if (n == null) throw new AppError("unavailable", `${label} is unreadable`, 503);
  return n;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError("unavailable", `${label} is unreadable`, 503);
  }
  return value;
}

function isoOrNull(value: Date | string | null): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError("unavailable", "Collection timestamp is unreadable", 503);
  }
  return date.toISOString();
}

function isoRequired(value: Date | string | null, label: string): string {
  const iso = isoOrNull(value);
  if (!iso) throw new AppError("unavailable", `${label} is unreadable`, 503);
  return iso;
}

async function loadChestCatalog(): Promise<EngagementChestCatalog[]> {
  const { rows } = await getPool().query<{
    id: string;
    rarity: string;
    title: string;
    description: string;
    reward_xp: unknown;
    reward_promo_coins: unknown;
    reward_energy: unknown;
    reward_label: string;
  }>(
    `SELECT id, rarity, title, description, reward_xp::text AS reward_xp,
            reward_promo_coins::text AS reward_promo_coins, reward_energy::text AS reward_energy,
            reward_label
     FROM treasure_chest_defs
     WHERE enabled = TRUE
     ORDER BY id`,
  );
  const seen = new Set<string>();
  const catalog = rows.map((row) => {
    const id = requiredText(row.id, "chestId");
    if (seen.has(id)) throw new AppError("unavailable", "Chest catalog is invalid", 503);
    seen.add(id);
    const rarity = requiredText(row.rarity, "Chest rarity");
    if (!CHEST_RARITIES.has(rarity)) throw new AppError("unavailable", "Chest catalog is invalid", 503);
    const xp = requiredCount(row.reward_xp, "Chest XP");
    const promo = requiredCount(row.reward_promo_coins, "Chest promo");
    const energy = requiredCount(row.reward_energy, "Chest energy");
    if (xp < 0 || promo < 0 || energy < 0) throw new AppError("unavailable", "Chest catalog is invalid", 503);
    return {
      id,
      rarity,
      title: requiredText(row.title, "Chest title"),
      description: typeof row.description === "string" ? row.description : "",
      reward_xp: xp,
      reward_promo_coins: promo,
      reward_energy: energy,
      reward_label: requiredText(row.reward_label, "Chest reward label"),
    };
  });
  if (catalog.length === 0) throw new AppError("unavailable", "Chest catalog is invalid", 503);
  return catalog;
}

export async function listChestsForUser(userId: string): Promise<EngagementTreasureResponse> {
  try {
    const catalog = await loadChestCatalog();
    const { rows } = await getPool().query<{
      id: string;
      chest_def_id: string;
      source: string;
      location_hint: string;
      status: string;
      created_at: Date;
      opened_at: Date | null;
      rarity: string;
      title: string;
      reward_label: string;
      reward_xp: unknown;
      reward_promo_coins: unknown;
      reward_energy: unknown;
    }>(
      `SELECT c.id::text AS id, c.chest_def_id, c.source, c.location_hint, c.status,
              c.created_at, c.opened_at, d.rarity, d.title, d.reward_label,
              d.reward_xp::text AS reward_xp, d.reward_promo_coins::text AS reward_promo_coins,
              d.reward_energy::text AS reward_energy
       FROM user_treasure_chests c
       JOIN treasure_chest_defs d ON d.id = c.chest_def_id
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC
       LIMIT 50`,
      [userId],
    );
    const chests: EngagementChest[] = rows.map((row) => {
      const status = requiredText(row.status, "Chest status");
      if (!CHEST_STATUSES.has(status)) throw new AppError("unavailable", "Chest status is unreadable", 503);
      return {
        id: requiredText(row.id, "chestId"),
        chest_def_id: requiredText(row.chest_def_id, "chestDefId"),
        title: requiredText(row.title, "Chest title"),
        rarity: requiredText(row.rarity, "Chest rarity"),
        status: status as EngagementChest["status"],
        source: typeof row.source === "string" ? row.source : "",
        location_hint: typeof row.location_hint === "string" ? row.location_hint : "",
        reward_label: typeof row.reward_label === "string" ? row.reward_label : "",
        reward_xp: requiredCount(row.reward_xp, "Chest XP"),
        reward_promo_coins: requiredCount(row.reward_promo_coins, "Chest promo"),
        reward_energy: requiredCount(row.reward_energy, "Chest energy"),
        created_at: isoRequired(row.created_at, "Chest created time"),
        opened_at: isoOrNull(row.opened_at),
      };
    });
    return { catalog, chests };
  } catch (error) {
    mapEngagementDbError(error);
  }
}

type SpawnResult = { ok: true; chest_id: string } | { ok: false; error: string };

async function spawnTreasureChestOnClient(
  client: PoolClient,
  userId: string,
  chestDefId: string,
  locationHint: string,
): Promise<SpawnResult> {
  
  const owner = await client.query<{ id: string }>(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
  if (!owner.rows[0]) return { ok: false as const, error: "SPAWN_FAILED" };
  const def = await client.query<{ id: string }>(
    `SELECT id FROM treasure_chest_defs WHERE id = $1 AND enabled = TRUE`,
    [chestDefId],
  );
  if (!def.rows[0]) return { ok: false as const, error: "UNKNOWN_CHEST" };
  const recent = await client.query<{ id: string }>(
    `SELECT id FROM user_treasure_chests
      WHERE user_id = $1 AND chest_def_id = $2 AND created_at > NOW() - INTERVAL '6 hours'
      LIMIT 1`,
    [userId, chestDefId],
  );
  if (recent.rows[0]) return { ok: false as const, error: "COOLDOWN" };
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO user_treasure_chests (user_id, chest_def_id, source, location_hint, status)
     VALUES ($1, $2, 'activity', $3, 'found')
     RETURNING id::text AS id`,
    [userId, chestDefId, locationHint],
  );
  if (!inserted.rows[0]) return { ok: false as const, error: "SPAWN_FAILED" };
  return { ok: true as const, chest_id: inserted.rows[0].id };
}

/** Fail closed on DB/schema errors. COOLDOWN / UNKNOWN_CHEST / SPAWN_FAILED return ok:false. */
export async function spawnTreasureChest(
  userId: string,
  chestDefId: string,
  locationHint = "hub",
  client?: PoolClient,
): Promise<SpawnResult> {
  if (!userId || !chestDefId) return { ok: false, error: "UNKNOWN_CHEST" };
  try {
    if (client) return await spawnTreasureChestOnClient(client, userId, chestDefId, locationHint);
    return await withTransaction(async (tx) => spawnTreasureChestOnClient(tx, userId, chestDefId, locationHint));
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (isSchemaUnavailable(error)) {
      throw new AppError("SCHEMA_UNAVAILABLE", "SCHEMA_UNAVAILABLE", 503);
    }
    throw new AppError("unavailable", "SPAWN_FAILED", 503);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function openTreasureChestForUser(
  userId: string,
  chestId: string,
): Promise<EngagementChestOpenResponse> {
  if (!UUID_RE.test(chestId.trim())) throw new AppError("not_found", "Chest not found", 404);
  try {
  return await withTransaction(async (client) => {
    const locked = await client.query<{
      id: string;
      status: string;
      reward_xp: unknown;
      reward_promo_coins: unknown;
      reward_energy: unknown;
      reward_label: string;
      title: string;
      rarity: string;
    }>(
      `SELECT c.id::text AS id, c.status, d.reward_xp::text AS reward_xp,
              d.reward_promo_coins::text AS reward_promo_coins, d.reward_energy::text AS reward_energy,
              d.reward_label, d.title, d.rarity
       FROM user_treasure_chests c
       JOIN treasure_chest_defs d ON d.id = c.chest_def_id
       WHERE c.id = $1 AND c.user_id = $2
       FOR UPDATE OF c`,
      [chestId, userId],
    );
    const chest = locked.rows[0];
    if (!chest) throw new AppError("not_found", "Chest not found", 404);
    const reward = {
      reward_xp: requiredCount(chest.reward_xp, "Chest XP"),
      reward_promo_coins: requiredCount(chest.reward_promo_coins, "Chest promo"),
      reward_energy: requiredCount(chest.reward_energy, "Chest energy"),
      reward_label: requiredText(chest.reward_label, "Chest reward label"),
      title: requiredText(chest.title, "Chest title"),
      rarity: requiredText(chest.rarity, "Chest rarity"),
    };
    if (chest.status === "opened") {
      return { ok: true as const, alreadyOpened: true, reward };
    }
    if (chest.status !== "found") {
      throw new AppError("validation_error", "Chest is not openable", 400);
    }
    const marked = await client.query<{ id: string }>(
      `UPDATE user_treasure_chests
       SET status = 'opened', opened_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'found'
       RETURNING id`,
      [chestId, userId],
    );
    if (!marked.rows[0]) {
      return { ok: true as const, alreadyOpened: true, reward };
    }
    if (reward.reward_promo_coins > 0) {
      await applyWalletDelta(client, {
        userId,
        bucket: "promo",
        delta: reward.reward_promo_coins,
        reason: "treasure_chest",
        idempotencyKey: `treasure_chest:${userId}:${chestId}`,
        refType: "treasure_chest",
        refId: chestId,
      });
    }
    if (reward.reward_xp > 0 || reward.reward_energy > 0) {
      await grantEngagementXp(client, userId, { xp: reward.reward_xp, energy: reward.reward_energy });
    }
    return { ok: true as const, reward };
  });
  } catch (error) {
    mapEngagementDbError(error);
  }
}

export async function listStickersForUser(userId: string): Promise<EngagementStickersResponse> {
  try {
    const sets = await getPool().query<{
      id: string;
      title: string;
      theme: string;
      complete_reward_label: string;
    }>(
      `SELECT id, title, theme, complete_reward_label
       FROM sticker_sets
       WHERE enabled = TRUE
       ORDER BY id`,
    );
    const defs = await getPool().query<{
      id: string;
      set_id: string;
      name: string;
      emoji: string;
      rarity: string;
    }>(
      `SELECT id, set_id, name, emoji, rarity
       FROM sticker_defs
       WHERE enabled = TRUE
       ORDER BY set_id, sort_order, id`,
    );
    const owned = await getPool().query<{ sticker_id: string; count: unknown }>(
      `SELECT sticker_id, count::text AS count FROM user_stickers WHERE user_id = $1`,
      [userId],
    );
    const counts = new Map<string, number>();
    const seenOwned = new Set<string>();
    for (const row of owned.rows) {
      const id = requiredText(row.sticker_id, "stickerId");
      if (seenOwned.has(id)) throw new AppError("unavailable", "Sticker inventory is invalid", 503);
      seenOwned.add(id);
      const count = requiredCount(row.count, "Sticker count");
      if (count <= 0) throw new AppError("unavailable", "Sticker inventory is invalid", 503);
      counts.set(id, count);
    }
    const seenDefs = new Set<string>();
    const bySet = new Map<string, EngagementStickerSet["stickers"]>();
    for (const row of defs.rows) {
      const id = requiredText(row.id, "stickerId");
      if (seenDefs.has(id)) throw new AppError("unavailable", "Sticker catalog is invalid", 503);
      seenDefs.add(id);
      const rarity = requiredText(row.rarity, "Sticker rarity");
      if (!STICKER_RARITIES.has(rarity)) throw new AppError("unavailable", "Sticker catalog is invalid", 503);
      const setId = requiredText(row.set_id, "stickerSetId");
      const have = counts.get(id) ?? 0;
      const list = bySet.get(setId) ?? [];
      list.push({
        id,
        set_id: setId,
        name: requiredText(row.name, "Sticker name"),
        emoji: requiredText(row.emoji, "Sticker emoji"),
        rarity,
        owned: have,
        unlocked: have > 0,
      });
      bySet.set(setId, list);
    }
    const seenSets = new Set<string>();
    const result: EngagementStickerSet[] = sets.rows.map((row) => {
      const id = requiredText(row.id, "stickerSetId");
      if (seenSets.has(id)) throw new AppError("unavailable", "Sticker catalog is invalid", 503);
      seenSets.add(id);
      const stickers = bySet.get(id) ?? [];
      const total = stickers.length;
      if (total <= 0) throw new AppError("unavailable", "Sticker catalog is invalid", 503);
      const progress = stickers.filter((item) => item.unlocked).length;
      return {
        id,
        title: requiredText(row.title, "Sticker set title"),
        theme: typeof row.theme === "string" ? row.theme : "",
        complete_reward_label: typeof row.complete_reward_label === "string" ? row.complete_reward_label : "",
        progress,
        total,
        complete: progress >= total,
        stickers,
      };
    });
    if (result.length === 0) throw new AppError("unavailable", "Sticker catalog is invalid", 503);
    return { sets: result };
  } catch (error) {
    mapEngagementDbError(error);
  }
}

export async function grantStickerForUser(
  userId: string,
  stickerId: string,
): Promise<{ ok: true; set_completed: boolean }> {
  if (!stickerId.trim()) throw new AppError("not_found", "Sticker not found", 404);
  return withTransaction(async (client) => {
    const def = await client.query<{ id: string; set_id: string }>(
      `SELECT id, set_id FROM sticker_defs WHERE id = $1 AND enabled = TRUE`,
      [stickerId],
    );
    if (!def.rows[0]) throw new AppError("not_found", "Sticker not found", 404);
    const setId = def.rows[0].set_id;
    await client.query(`SELECT id FROM sticker_sets WHERE id = $1 FOR UPDATE`, [setId]);
    await client.query(
      `INSERT INTO user_stickers (user_id, sticker_id, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (user_id, sticker_id) DO UPDATE SET count = user_stickers.count + 1`,
      [userId, stickerId],
    );
    const owned = await client.query<{ n: unknown }>(
      `SELECT COUNT(*)::text AS n
       FROM sticker_defs d
       JOIN user_stickers u ON u.sticker_id = d.id AND u.user_id = $1
       WHERE d.set_id = $2 AND d.enabled = TRUE AND u.count > 0`,
      [userId, setId],
    );
    const total = await client.query<{ n: unknown }>(
      `SELECT COUNT(*)::text AS n FROM sticker_defs WHERE set_id = $1 AND enabled = TRUE`,
      [setId],
    );
    const ownedCount = requiredCount(owned.rows[0]?.n, "Sticker set owned");
    const totalCount = requiredCount(total.rows[0]?.n, "Sticker set total");
    if (totalCount <= 0) throw new AppError("unavailable", "Sticker catalog is invalid", 503);
    if (ownedCount < totalCount) return { ok: true as const, set_completed: false };
    const completed = await client.query<{ set_id: string }>(
      `INSERT INTO user_sticker_set_completions (user_id, set_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, set_id) DO NOTHING
       RETURNING set_id`,
      [userId, setId],
    );
    if (!completed.rows[0]) return { ok: true as const, set_completed: false };
    await applyWalletDelta(client, {
      userId,
      bucket: "promo",
      delta: 250,
      reason: "sticker_set_complete",
      idempotencyKey: `sticker_set_complete:${userId}:${setId}`,
      refType: "sticker_set",
      refId: setId,
    });
    await grantEngagementXp(client, userId, { xp: 100, energy: 0 });
    return { ok: true as const, set_completed: true };
  });
}

async function loadCreatorTiers(): Promise<EngagementCreatorCardTier[]> {
  const { rows } = await getPool().query<{
    tier: string;
    title: string;
    stars: unknown;
    watch_minutes_required: unknown;
    gifts_required: unknown;
  }>(
    `SELECT tier, title, stars::text AS stars, watch_minutes_required::text AS watch_minutes_required,
            gifts_required::text AS gifts_required
     FROM creator_card_defs
     ORDER BY watch_minutes_required, gifts_required, tier`,
  );
  const seen = new Set<string>();
  const tiers = rows.map((row) => {
    const tier = requiredText(row.tier, "cardTier");
    if (seen.has(tier)) throw new AppError("unavailable", "Creator card catalog is invalid", 503);
    seen.add(tier);
    return {
      tier,
      title: requiredText(row.title, "Creator card title"),
      stars: requiredCount(row.stars, "Creator card stars"),
      watch_minutes_required: requiredCount(row.watch_minutes_required, "Creator card watch minutes"),
      gifts_required: requiredCount(row.gifts_required, "Creator card gifts"),
    };
  });
  if (tiers.length === 0) throw new AppError("unavailable", "Creator card catalog is invalid", 503);
  return tiers;
}

export async function listCreatorCardsForUser(
  userId: string,
  creatorId?: string,
): Promise<EngagementCreatorCardsResponse> {
  if (creatorId && !UUID_RE.test(creatorId)) {
    throw new AppError("validation_error", "creatorId is invalid", 400);
  }
  try {
    const tiers = await loadCreatorTiers();
    const unlockedRows = creatorId
      ? await getPool().query<{ creator_id: string; tier: string; unlocked_at: Date }>(
          `SELECT creator_id::text AS creator_id, tier, unlocked_at
           FROM user_creator_cards
           WHERE user_id = $1 AND creator_id = $2
           ORDER BY unlocked_at DESC`,
          [userId, creatorId],
        )
      : await getPool().query<{ creator_id: string; tier: string; unlocked_at: Date }>(
          `SELECT creator_id::text AS creator_id, tier, unlocked_at
           FROM user_creator_cards
           WHERE user_id = $1
           ORDER BY unlocked_at DESC
           LIMIT 100`,
          [userId],
        );
    const progressRows = creatorId
      ? await getPool().query<{ creator_id: string; watch_minutes: unknown; gifts_count: unknown }>(
          `SELECT creator_id::text AS creator_id, watch_minutes::text AS watch_minutes,
                  gifts_count::text AS gifts_count
           FROM user_creator_collection_progress
           WHERE user_id = $1 AND creator_id = $2`,
          [userId, creatorId],
        )
      : await getPool().query<{ creator_id: string; watch_minutes: unknown; gifts_count: unknown }>(
          `SELECT creator_id::text AS creator_id, watch_minutes::text AS watch_minutes,
                  gifts_count::text AS gifts_count
           FROM user_creator_collection_progress
           WHERE user_id = $1
           ORDER BY updated_at DESC
           LIMIT 100`,
          [userId],
        );
    const unlocked: EngagementCreatorCard[] = unlockedRows.rows.map((row) => ({
      creator_id: requiredText(row.creator_id, "creatorId"),
      tier: requiredText(row.tier, "cardTier"),
      unlocked_at: isoRequired(row.unlocked_at, "Creator card unlock time"),
    }));
    const progress: EngagementCreatorCardProgress[] = progressRows.rows.map((row) => ({
      creator_id: requiredText(row.creator_id, "creatorId"),
      watch_minutes: requiredCount(row.watch_minutes, "Creator card watch minutes"),
      gifts_count: requiredCount(row.gifts_count, "Creator card gifts"),
    }));
    return { tiers, unlocked, progress };
  } catch (error) {
    mapEngagementDbError(error);
  }
}

async function unlockCreatorCard(userId: string, creatorId: string, tier: string): Promise<void> {
  if (!userId || !creatorId || userId === creatorId) return;
  await getPool().query(
    `INSERT INTO user_creator_cards (user_id, creator_id, tier)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, creator_id, tier) DO NOTHING`,
    [userId, creatorId, tier],
  );
}

async function evaluateCreatorTiers(
  userId: string,
  creatorId: string,
  watchMinutes: number,
  giftsCount: number,
): Promise<void> {
  const tiers = await loadCreatorTiers();
  for (const tier of tiers) {
    if (watchMinutes >= tier.watch_minutes_required && giftsCount >= tier.gifts_required) {
      await unlockCreatorCard(userId, creatorId, tier.tier);
    }
  }
}

export async function recordCreatorGiftProgress(userId: string, creatorId: string, gifts = 1): Promise<void> {
  const add = Math.max(0, Math.floor(gifts));
  if (!userId || !creatorId || userId === creatorId || add <= 0) return;
  try {
    const row = await getPool().query<{ watch_minutes: unknown; gifts_count: unknown }>(
      `INSERT INTO user_creator_collection_progress
         (user_id, creator_id, watch_minutes, gifts_count, updated_at)
       VALUES ($1, $2, 0, $3, NOW())
       ON CONFLICT (user_id, creator_id) DO UPDATE SET
         gifts_count = user_creator_collection_progress.gifts_count + $3,
         updated_at = NOW()
       RETURNING watch_minutes::text AS watch_minutes, gifts_count::text AS gifts_count`,
      [userId, creatorId, add],
    );
    await evaluateCreatorTiers(
      userId,
      creatorId,
      requiredCount(row.rows[0]?.watch_minutes ?? 0, "Creator card watch minutes"),
      requiredCount(row.rows[0]?.gifts_count ?? 0, "Creator card gifts"),
    );
  } catch (error) {
    mapEngagementDbError(error);
  }
}

/**
 * Watch-minute creator-card progress. Callers must exist on LIVE room paths.
 * Until LIVE watch writers are wired, this remains unused outside tests —
 * do not invent silent success from missing call sites.
 */
export async function recordCreatorWatchProgress(userId: string, creatorId: string, minutes: number): Promise<void> {
  const add = Math.max(0, Math.floor(minutes));
  if (!userId || !creatorId || userId === creatorId || add <= 0) return;
  try {
    const row = await getPool().query<{ watch_minutes: unknown; gifts_count: unknown }>(
      `INSERT INTO user_creator_collection_progress
         (user_id, creator_id, watch_minutes, gifts_count, updated_at)
       VALUES ($1, $2, $3, 0, NOW())
       ON CONFLICT (user_id, creator_id) DO UPDATE SET
         watch_minutes = user_creator_collection_progress.watch_minutes + $3,
         updated_at = NOW()
       RETURNING watch_minutes::text AS watch_minutes, gifts_count::text AS gifts_count`,
      [userId, creatorId, add],
    );
    await evaluateCreatorTiers(
      userId,
      creatorId,
      requiredCount(row.rows[0]?.watch_minutes ?? 0, "Creator card watch minutes"),
      requiredCount(row.rows[0]?.gifts_count ?? 0, "Creator card gifts"),
    );
  } catch (error) {
    mapEngagementDbError(error);
  }
}
