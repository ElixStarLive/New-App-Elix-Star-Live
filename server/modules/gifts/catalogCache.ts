import { env } from "../../infra/env.js";
import { logger } from "../../infra/logger.js";
import { requireValkey, valkeyDel, valkeySet } from "../../infra/valkey.js";
import { AppError } from "../../middleware/errors.js";
import type { PublicGiftCatalogItem } from "./catalog.js";

/** Exact NEW public GET /api/gifts cache key. DB remains persistent catalog authority. */
export const PUBLIC_GIFTS_CATALOG_KEY = "elix:gifts:catalog:v1";
export const PUBLIC_GIFTS_CATALOG_TTL_MS = 120_000;

function isPublicGiftItem(value: unknown): value is PublicGiftCatalogItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    Number.isInteger(row.coinCost) &&
    (row.coinCost as number) > 0 &&
    (row.animationUrl === null || typeof row.animationUrl === "string")
  );
}

export function parsePublicGiftsCatalogCache(raw: string): PublicGiftCatalogItem[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every(isPublicGiftItem)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readPublicGiftsCatalogCache(): Promise<PublicGiftCatalogItem[] | null> {
  if (!env().valkeyUrl) return null;
  try {
    const raw = await requireValkey().get(PUBLIC_GIFTS_CATALOG_KEY);
    if (!raw) return null;
    return parsePublicGiftsCatalogCache(raw);
  } catch (error) {
    logger.warn({ err: error }, "public gifts catalog cache read failed");
    return null;
  }
}

export async function writePublicGiftsCatalogCache(gifts: PublicGiftCatalogItem[]): Promise<void> {
  if (!env().valkeyUrl) return;
  try {
    await valkeySet(PUBLIC_GIFTS_CATALOG_KEY, JSON.stringify(gifts), PUBLIC_GIFTS_CATALOG_TTL_MS);
  } catch (error) {
    logger.warn({ err: error }, "public gifts catalog cache write failed");
  }
}

export async function invalidatePublicGiftsCatalogCache(): Promise<"skipped" | "invalidated"> {
  if (!env().valkeyUrl) return "skipped";
  try {
    await valkeyDel(PUBLIC_GIFTS_CATALOG_KEY);
    return "invalidated";
  } catch (error) {
    logger.error({ err: error }, "public gifts catalog cache invalidation failed");
    throw new AppError("unavailable", "Gift catalog cache invalidation failed", 503);
  }
}
