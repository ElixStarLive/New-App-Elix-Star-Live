/**
 * For You lifecycle (PAGE-007) — NEW module matching frozen OLD behaviour.
 * Enroll on publish → promote / remove / re-entry → periodic sweep.
 */
import { getPool } from "../../infra/postgres.js";
import { logger } from "../../infra/logger.js";

type ForYouStage =
  | "initial"
  | "promoted"
  | "removed"
  | "reentry_eligible"
  | "reentered"
  | "exhausted";

type ForYouConfig = {
  promotionQualifiedViews: number;
  removalWindowHours: number;
  reentryAdditionalQualifiedViews: number;
  maxRecommendationCycles: number;
  freshnessWindowHours: number;
  weightQualifiedViews: number;
  weightShares: number;
  weightSaves: number;
  weightComments: number;
  weightLikes: number;
  weightFreshness: number;
  weightCreatorQuality: number;
  weightGuidelines: number;
};

const DEFAULT_CFG: ForYouConfig = {
  promotionQualifiedViews: 5000,
  removalWindowHours: 168,
  reentryAdditionalQualifiedViews: 1000,
  maxRecommendationCycles: 5,
  freshnessWindowHours: 72,
  weightQualifiedViews: 1,
  weightShares: 2,
  weightSaves: 1.8,
  weightComments: 1.4,
  weightLikes: 1,
  weightFreshness: 1.1,
  weightCreatorQuality: 1,
  weightGuidelines: -10,
};

async function loadForYouConfig(): Promise<ForYouConfig> {
  try {
    const { rows } = await getPool().query(
      `SELECT promotion_qualified_views, removal_window_hours, reentry_additional_qualified_views,
              max_recommendation_cycles, freshness_window_hours,
              weight_qualified_views, weight_shares, weight_saves, weight_comments, weight_likes,
              weight_freshness, weight_creator_quality, weight_guidelines
         FROM elix_foryou_config WHERE id = 'default' LIMIT 1`,
    );
    const row = rows[0];
    if (!row) return DEFAULT_CFG;
    return {
      promotionQualifiedViews: Number(row.promotion_qualified_views) || DEFAULT_CFG.promotionQualifiedViews,
      removalWindowHours: Number(row.removal_window_hours) || DEFAULT_CFG.removalWindowHours,
      reentryAdditionalQualifiedViews:
        Number(row.reentry_additional_qualified_views) || DEFAULT_CFG.reentryAdditionalQualifiedViews,
      maxRecommendationCycles: Number(row.max_recommendation_cycles) || DEFAULT_CFG.maxRecommendationCycles,
      freshnessWindowHours: Number(row.freshness_window_hours) || DEFAULT_CFG.freshnessWindowHours,
      weightQualifiedViews: Number(row.weight_qualified_views) || DEFAULT_CFG.weightQualifiedViews,
      weightShares: Number(row.weight_shares) || DEFAULT_CFG.weightShares,
      weightSaves: Number(row.weight_saves) || DEFAULT_CFG.weightSaves,
      weightComments: Number(row.weight_comments) || DEFAULT_CFG.weightComments,
      weightLikes: Number(row.weight_likes) || DEFAULT_CFG.weightLikes,
      weightFreshness: Number(row.weight_freshness) || DEFAULT_CFG.weightFreshness,
      weightCreatorQuality: Number(row.weight_creator_quality) || DEFAULT_CFG.weightCreatorQuality,
      weightGuidelines: Number(row.weight_guidelines) || DEFAULT_CFG.weightGuidelines,
    };
  } catch {
    return DEFAULT_CFG;
  }
}

function computeScore(input: {
  qualifiedUniqueViews: number;
  shares: number;
  saves: number;
  comments: number;
  likes: number;
  ageHours: number;
  freshnessWindowHours: number;
  creatorQualityScore: number;
  guidelinesOk: boolean;
  cfg: ForYouConfig;
}): number {
  const freshness =
    input.ageHours <= input.freshnessWindowHours
      ? 1
      : Math.max(0.1, 1 - (input.ageHours - input.freshnessWindowHours) / (input.freshnessWindowHours * 2));
  const guidelines = input.guidelinesOk ? 0 : input.cfg.weightGuidelines;
  return (
    input.qualifiedUniqueViews * input.cfg.weightQualifiedViews +
    input.shares * input.cfg.weightShares +
    input.saves * input.cfg.weightSaves +
    input.comments * input.cfg.weightComments +
    input.likes * input.cfg.weightLikes +
    freshness * input.cfg.weightFreshness +
    input.creatorQualityScore * input.cfg.weightCreatorQuality +
    guidelines
  );
}

export async function enrollVideoInForYou(input: {
  videoId: string;
  creatorUserId: string;
  privacy?: string | null;
}): Promise<void> {
  const videoId = String(input.videoId || "").trim();
  const creatorUserId = String(input.creatorUserId || "").trim();
  if (!videoId || !creatorUserId) return;
  if (input.privacy === "private") return;
  try {
    await getPool().query(
      `INSERT INTO elix_video_foryou_state (video_id, creator_user_id, stage, cycle_count)
       VALUES ($1, $2, 'initial', 1)
       ON CONFLICT (video_id) DO NOTHING`,
      [videoId, creatorUserId],
    );
  } catch (err) {
    logger.warn({ err, videoId }, "enrollVideoInForYou failed");
  }
}

export async function onQualifiedUniqueViewForFeed(input: {
  videoId: string;
  creatorUserId: string;
}): Promise<void> {
  const videoId = String(input.videoId || "").trim();
  if (!videoId) return;
  try {
    const cfg = await loadForYouConfig();
    const q = await getPool().query(
      `SELECT COUNT(*)::int AS c FROM video_views WHERE video_id = $1`,
      [videoId],
    );
    const qualified = Math.floor(Number(q.rows[0]?.c) || 0);

    await getPool().query(
      `INSERT INTO elix_video_foryou_state (video_id, creator_user_id, stage, qualified_unique_views)
       VALUES ($1, $2, 'initial', $3)
       ON CONFLICT (video_id) DO UPDATE SET
         qualified_unique_views = $3,
         updated_at = NOW()`,
      [videoId, input.creatorUserId || "unknown", qualified],
    );

    const st = await getPool().query(`SELECT * FROM elix_video_foryou_state WHERE video_id = $1`, [videoId]);
    const row = st.rows[0];
    if (!row) return;

    let stage = String(row.stage) as ForYouStage;
    const cycle = Math.floor(Number(row.cycle_count) || 1);
    const atRemoval = Math.floor(Number(row.qualified_at_removal) || 0);
    let qualifiedSinceRemoval = Math.max(0, qualified - atRemoval);
    let promotedAt = row.promoted_at as string | null;
    let removedAt = row.removed_at as string | null;
    let reentryAt = row.reentry_at as string | null;

    if (stage === "initial" || stage === "reentered") {
      if (qualified >= cfg.promotionQualifiedViews) {
        stage = "promoted";
        promotedAt = promotedAt || new Date().toISOString();
      }
    }

    if (stage === "removed" || stage === "reentry_eligible") {
      qualifiedSinceRemoval = Math.max(0, qualified - atRemoval);
      if (qualifiedSinceRemoval >= cfg.reentryAdditionalQualifiedViews) {
        stage = cycle < cfg.maxRecommendationCycles ? "reentry_eligible" : "exhausted";
      }
    }

    if (stage === "initial" && !promotedAt) {
      const entered = row.initial_entered_at ? new Date(row.initial_entered_at).getTime() : Date.now();
      const ageHours = (Date.now() - entered) / 3_600_000;
      if (ageHours >= cfg.removalWindowHours && qualified < cfg.promotionQualifiedViews) {
        await getPool().query(
          `UPDATE elix_video_foryou_state SET
             stage = 'removed', removed_at = NOW(), qualified_at_removal = $2,
             qualified_since_removal = 0, updated_at = NOW()
           WHERE video_id = $1`,
          [videoId, qualified],
        );
        return;
      }
    }

    const score = await rescoreVideo(videoId, cfg);
    if (stage === "reentry_eligible" && score > 0) {
      stage = "reentered";
      reentryAt = new Date().toISOString();
      await getPool().query(
        `UPDATE elix_video_foryou_state SET
           stage = 'reentered', cycle_count = cycle_count + 1, reentry_at = NOW(),
           ranking_score = $2, last_scored_at = NOW(), qualified_since_removal = $3, updated_at = NOW()
         WHERE video_id = $1`,
        [videoId, score, qualifiedSinceRemoval],
      );
      return;
    }

    await getPool().query(
      `UPDATE elix_video_foryou_state SET
         stage = $2, qualified_unique_views = $3, qualified_since_removal = $4,
         ranking_score = $5, last_scored_at = NOW(),
         promoted_at = COALESCE(promoted_at, $6::timestamptz),
         removed_at = $7::timestamptz,
         reentry_at = COALESCE(reentry_at, $8::timestamptz),
         updated_at = NOW()
       WHERE video_id = $1`,
      [videoId, stage, qualified, qualifiedSinceRemoval, score, promotedAt, removedAt, reentryAt],
    );
  } catch (err) {
    logger.warn({ err, videoId }, "onQualifiedUniqueViewForFeed failed");
  }
}

async function rescoreVideo(videoId: string, cfg?: ForYouConfig): Promise<number> {
  try {
    const resolved = cfg ?? (await loadForYouConfig());
    const r = await getPool().query(
      `SELECT
         s.qualified_unique_views, s.guidelines_ok, s.creator_quality_score, s.initial_entered_at,
         COALESCE(v.likes,0)::int AS likes,
         COALESCE(v.comments,0)::int AS comments,
         COALESCE(v.shares,0)::int AS shares,
         COALESCE(v.saves,0)::int AS saves
       FROM elix_video_foryou_state s
       JOIN videos v ON v.id::text = s.video_id
       WHERE s.video_id = $1`,
      [videoId],
    );
    const row = r.rows[0];
    if (!row) return 0;
    const ageHours =
      (Date.now() - new Date(row.initial_entered_at || Date.now()).getTime()) / 3_600_000;
    return computeScore({
      qualifiedUniqueViews: Number(row.qualified_unique_views) || 0,
      shares: Number(row.shares) || 0,
      saves: Number(row.saves) || 0,
      comments: Number(row.comments) || 0,
      likes: Number(row.likes) || 0,
      ageHours,
      freshnessWindowHours: resolved.freshnessWindowHours,
      creatorQualityScore: Number(row.creator_quality_score) || 1,
      guidelinesOk: row.guidelines_ok !== false,
      cfg: resolved,
    });
  } catch (err) {
    logger.warn({ err, videoId }, "rescoreVideo failed");
    return 0;
  }
}

export async function sweepForYouLifecycle(
  limit = 200,
): Promise<{ removed: number; rescored: number }> {
  let removed = 0;
  let rescored = 0;
  try {
    const cfg = await loadForYouConfig();
    const expired = await getPool().query(
      `UPDATE elix_video_foryou_state s SET
         stage = 'removed', removed_at = NOW(),
         qualified_at_removal = s.qualified_unique_views,
         qualified_since_removal = 0, updated_at = NOW()
       WHERE s.stage = 'initial'
         AND s.promoted_at IS NULL
         AND s.initial_entered_at <= NOW() - ($1::text || ' hours')::interval
         AND s.qualified_unique_views < $2
       RETURNING video_id`,
      [String(cfg.removalWindowHours), cfg.promotionQualifiedViews],
    );
    removed = expired.rowCount ?? 0;

    const active = await getPool().query(
      `SELECT video_id FROM elix_video_foryou_state
        WHERE stage IN ('initial','promoted','reentered','reentry_eligible')
        ORDER BY updated_at ASC
        LIMIT $1`,
      [limit],
    );
    for (const row of active.rows) {
      const score = await rescoreVideo(String(row.video_id), cfg);
      await getPool().query(
        `UPDATE elix_video_foryou_state SET ranking_score = $2, last_scored_at = NOW(), updated_at = NOW()
         WHERE video_id = $1`,
        [row.video_id, score],
      );
      rescored += 1;
    }
  } catch (err) {
    logger.warn({ err }, "sweepForYouLifecycle failed");
  }
  return { removed, rescored };
}
