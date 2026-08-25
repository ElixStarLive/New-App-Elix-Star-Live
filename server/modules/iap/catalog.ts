import type { Request, Response } from "express";
import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";

export type CoinPackageRow = {
  productId: string;
  provider: "apple" | "google";
  coins: number;
  label: string;
};

function requestedProvider(raw: unknown): "apple" | "google" | null {
  return raw === "apple" || raw === "google" ? raw : null;
}

export async function loadCoinPackages(provider: "apple" | "google" | null): Promise<CoinPackageRow[]> {
  const { rows } = provider
    ? await getPool().query<{ product_id: string; provider: "apple" | "google"; coins: number; label: string }>(
        `SELECT product_id, provider, coins, COALESCE(label, product_id) AS label
         FROM coin_packages
         WHERE active = TRUE AND provider = $1
         ORDER BY coins ASC`,
        [provider],
      )
    : await getPool().query<{ product_id: string; provider: "apple" | "google"; coins: number; label: string }>(
        `SELECT product_id, provider, coins, COALESCE(label, product_id) AS label
         FROM coin_packages
         WHERE active = TRUE
         ORDER BY coins ASC, provider ASC`,
      );
  if (rows.length === 0) {
    throw new AppError("unavailable", "Coin catalog unavailable", 503);
  }
  return rows.map((row) => ({
    productId: row.product_id,
    provider: row.provider,
    coins: row.coins,
    label: row.label,
  }));
}

export async function handleGetCoinPackages(req: Request, res: Response): Promise<void> {
  const packages = await loadCoinPackages(requestedProvider(req.query.provider));
  res.json({ packages });
}
