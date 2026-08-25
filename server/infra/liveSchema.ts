const relationCache = new Map<string, boolean>();

/** Probe public.table existence (cached per process). */
export async function publicTableExists(tableName: string): Promise<boolean> {
  const key = tableName.trim().toLowerCase();
  if (!/^[a-z_][a-z0-9_]*$/.test(key)) return false;
  const hit = relationCache.get(key);
  if (hit != null) return hit;
  const { getPool } = await import("./postgres.js");
  const { rows } = await getPool().query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [key],
  );
  const exists = Boolean(rows[0]?.exists);
  relationCache.set(key, exists);
  return exists;
}
