import { getPool } from "../../infra/postgres.js";
import { isLiveNeonSchema } from "../../infra/liveSchema.js";

export async function uniqueProfileViewCount(ownerId: string): Promise<number> {
  if (await isLiveNeonSchema()) {
    const { rows } = await getPool().query<{ n: string }>(
      `SELECT COALESCE(p.unique_profile_views, 0)::text AS n
         FROM profiles p
        WHERE p.user_id = $1`,
      [ownerId],
    );
    if (rows[0]) return Number(rows[0].n ?? 0);
    const counted = await getPool().query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM profile_unique_views WHERE profile_owner_user_id = $1`,
      [ownerId],
    );
    return Number(counted.rows[0]?.n ?? 0);
  }
  const { rows } = await getPool().query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM profile_unique_views WHERE profile_owner_user_id = $1`,
    [ownerId],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function registerUniqueProfileView(
  ownerId: string,
  viewerId: string,
): Promise<{ uniqueViews: number; recorded: boolean }> {
  if (ownerId === viewerId) {
    return { uniqueViews: await uniqueProfileViewCount(ownerId), recorded: false };
  }
  const inserted = await getPool().query(
    `INSERT INTO profile_unique_views (profile_owner_user_id, viewer_user_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [ownerId, viewerId],
  );
  const recorded = (inserted.rowCount ?? 0) > 0;
  if (recorded && (await isLiveNeonSchema())) {
    await getPool().query(
      `UPDATE profiles
          SET unique_profile_views = COALESCE(unique_profile_views, 0) + 1
        WHERE user_id = $1`,
      [ownerId],
    );
  }
  return {
    uniqueViews: await uniqueProfileViewCount(ownerId),
    recorded,
  };
}
