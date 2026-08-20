import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { creditVerifiedIap } from "./credit.js";

const router = Router();

router.get("/products", requireAuth, async (req: AuthedRequest, res) => {
  const provider = req.query.provider === "apple" || req.query.provider === "google"
    ? req.query.provider
    : req.headers["user-agent"]?.includes("Android")
      ? "google"
      : "apple";
  const { rows } = await getPool().query<{ product_id: string; coins: number; label: string }>(
    `SELECT product_id, coins, label FROM coin_packages WHERE provider = $1 AND active = TRUE ORDER BY coins`,
    [provider],
  );
  res.json({
    products: rows.map((row) => ({
      productId: row.product_id,
      coins: row.coins,
      label: row.label,
    })),
  });
});

router.post("/verify", requireAuth, async (req: AuthedRequest, res) => {
  const coins = await creditVerifiedIap(req.userId as string, req.body);
  res.json({ ok: true, coins });
});

export default router;
