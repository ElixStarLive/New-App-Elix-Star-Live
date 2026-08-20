export type Keyset = { createdAt: string; id: string };

export const FEED_PAGE_SIZE = 20;

export function encodeKeyset(createdAt: Date | string, id: string): string {
  const t = createdAt instanceof Date ? createdAt.toISOString() : createdAt;
  return Buffer.from(JSON.stringify({ t, id }), "utf8").toString("base64url");
}

export function decodeKeyset(raw: unknown): Keyset | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      t?: unknown;
      id?: unknown;
    };
    if (typeof parsed.t !== "string" || typeof parsed.id !== "string") return null;
    if (Number.isNaN(Date.parse(parsed.t))) return null;
    return { createdAt: parsed.t, id: parsed.id };
  } catch {
    return null;
  }
}

export function keysetWhere(
  alias: string,
  cursor: Keyset | null,
  startIndex: number,
): { sql: string; params: unknown[] } {
  if (!cursor) return { sql: "", params: [] };
  return {
    sql: `AND (${alias}.created_at, ${alias}.id) < ($${startIndex}::timestamptz, $${startIndex + 1}::uuid)`,
    params: [cursor.createdAt, cursor.id],
  };
}
