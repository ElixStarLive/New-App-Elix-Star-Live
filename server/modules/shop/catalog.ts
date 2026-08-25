import type { Response } from "express";
import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { shopCategorySchema } from "../../../shared/contracts/shop.js";

export type ShopItemRow = {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price_pence: number;
  image_url: string | null;
  category: string;
};

function param(req: { params: Record<string, string | string[] | undefined> }, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function mapShopItem(row: ShopItemRow) {
  return {
    id: row.id,
    sellerId: row.seller_id,
    user_id: row.seller_id,
    name: row.title,
    title: row.title,
    description: row.description,
    pricePence: row.price_pence,
    price: row.price_pence / 100,
    priceLabel: `£${(row.price_pence / 100).toFixed(2)}`,
    imageUrl: row.image_url,
    image_url: row.image_url,
    category: row.category,
  };
}

function parseWriteBody(body: unknown, requirePrice: boolean): {
  title: string;
  description: string;
  pricePence: number | null;
  imageUrl: string | null | undefined;
  category: string;
} {
  if (!body || typeof body !== "object") throw new AppError("validation_error", "Invalid item", 400);
  const raw = body as Record<string, unknown>;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title || title.length > 200) throw new AppError("validation_error", "Please fill in title and price", 400);
  const description = typeof raw.description === "string" ? raw.description.trim().slice(0, 5000) : "";
  let pricePence: number | null = null;
  if (typeof raw.pricePence === "number" && Number.isFinite(raw.pricePence)) {
    pricePence = Math.round(raw.pricePence);
  } else if (typeof raw.price === "number" && Number.isFinite(raw.price)) {
    pricePence = Math.round(raw.price * 100);
  } else if (typeof raw.price === "string" && raw.price.trim()) {
    pricePence = Math.round(Number(raw.price) * 100);
  }
  if (requirePrice && (pricePence === null || !Number.isFinite(pricePence) || pricePence < 1)) {
    throw new AppError("validation_error", "Invalid price", 400);
  }
  if (pricePence !== null && (pricePence < 1 || !Number.isFinite(pricePence))) {
    throw new AppError("validation_error", "Invalid price", 400);
  }
  const imageUrl =
    raw.image_url === null || raw.imageUrl === null
      ? null
      : typeof raw.imageUrl === "string"
        ? raw.imageUrl
        : typeof raw.image_url === "string"
          ? raw.image_url
          : undefined;
  const categoryRaw = typeof raw.category === "string" ? raw.category : "other";
  const category = shopCategorySchema.safeParse(categoryRaw).success ? categoryRaw : "other";
  return { title, description, pricePence, imageUrl, category };
}

export async function listShopItems(req: AuthedRequest, res: Response): Promise<void> {
  const seller =
    typeof req.query.userId === "string"
      ? req.query.userId
      : typeof req.query.user_id === "string"
        ? req.query.user_id
        : "";
  const category = typeof req.query.category === "string" ? req.query.category : "";
  const values: unknown[] = [];

  

  let where = "WHERE deleted_at IS NULL AND is_active = TRUE";
  if (seller) {
    values.push(seller);
    where += ` AND seller_id = $${values.length}`;
  }
  if (category && category !== "all" && shopCategorySchema.safeParse(category).success) {
    values.push(category);
    where += ` AND category = $${values.length}`;
  }
  const { rows } = await getPool().query<ShopItemRow>(
    `SELECT id, seller_id, title, description, price_pence, image_url, category
     FROM shop_items
     ${where}
     ORDER BY created_at DESC
     LIMIT 100`,
    values,
  );
  res.json({ items: rows.map(mapShopItem) });
}

export async function createShopItem(req: AuthedRequest, res: Response): Promise<void> {
  
  const parsed = parseWriteBody(req.body, true);
  const { rows } = await getPool().query<ShopItemRow>(
    `INSERT INTO shop_items (seller_id, title, description, price_pence, image_url, category, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)
     RETURNING id, seller_id, title, description, price_pence, image_url, category`,
    [req.userId, parsed.title, parsed.description, parsed.pricePence, parsed.imageUrl ?? null, parsed.category],
  );
  res.status(201).json(mapShopItem(rows[0]!));
}

export async function updateShopItem(req: AuthedRequest, res: Response): Promise<void> {
  
  const itemId = param(req, "itemId");
  const parsed = parseWriteBody(req.body, true);
  const { rows } = await getPool().query<ShopItemRow>(
    `UPDATE shop_items
     SET title = $3,
         description = $4,
         price_pence = $5,
         image_url = COALESCE($6, image_url),
         category = $7
     WHERE id = $1 AND seller_id = $2 AND deleted_at IS NULL AND is_active = TRUE
     RETURNING id, seller_id, title, description, price_pence, image_url, category`,
    [itemId, req.userId, parsed.title, parsed.description, parsed.pricePence, parsed.imageUrl ?? null, parsed.category],
  );
  if (!rows[0]) throw new AppError("not_found", "Item not found", 404);
  res.json(mapShopItem(rows[0]));
}

export async function deleteShopItem(req: AuthedRequest, res: Response): Promise<void> {
  
  const itemId = param(req, "itemId");
  const result = await getPool().query(
    `UPDATE shop_items SET deleted_at = NOW(), is_active = FALSE
     WHERE id = $1 AND seller_id = $2 AND deleted_at IS NULL`,
    [itemId, req.userId],
  );
  if (!result.rowCount) throw new AppError("not_found", "Item not found", 404);
  res.json({ ok: true });
}
