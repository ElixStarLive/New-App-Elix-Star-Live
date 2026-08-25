import { z } from "zod";

export const SHOP_MAX_BASKET_LINES = 10;
export const SHOP_MIN_QTY = 1;
export const SHOP_MAX_QTY = 99;
export const SHOP_STRIPE_GBP_MIN_PENCE = 30;
export const SHOP_CATEGORIES = ["clothing", "electronics", "accessories", "other"] as const;

export const shopCategorySchema = z.enum(SHOP_CATEGORIES);

export const shopBasketLineSchema = z.object({
  id: z.string().uuid(),
  quantity: z.number().int().min(SHOP_MIN_QTY).max(SHOP_MAX_QTY),
});

export const shopCheckoutBodySchema = z
  .object({
    itemId: z.string().uuid().optional(),
    quantity: z.number().int().min(SHOP_MIN_QTY).max(SHOP_MAX_QTY).optional(),
    items: z.array(shopBasketLineSchema).max(SHOP_MAX_BASKET_LINES).optional(),
    idempotencyKey: z.string().min(8).max(200).optional(),
  })
  .refine((body) => Boolean(body.itemId || (body.items && body.items.length > 0)), {
    message: "itemId or items required",
  });

export const shopItemWriteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  pricePence: z.number().int().positive().optional(),
  imageUrl: z.string().url().nullable().optional(),
  category: shopCategorySchema.optional(),
});

export type ShopCheckoutBody = z.infer<typeof shopCheckoutBodySchema>;
export type ShopItemWrite = z.infer<typeof shopItemWriteSchema>;
