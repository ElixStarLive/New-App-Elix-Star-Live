import { z } from "zod";

/** Store SKUs — production App Store / Play products. Not coin packages. */
export const PROMOTE_PRODUCTS = {
  "com.elixstarlive.promote_views": {
    goal: "views",
    label: "More video views",
    amountPence: 500,
  },
  "com.elixstarlive.promote_likes": {
    goal: "likes",
    label: "More likes & comments",
    amountPence: 1000,
  },
  "com.elixstarlive.promote_profile": {
    goal: "profile",
    label: "More profile views",
    amountPence: 2000,
  },
  "com.elixstarlive.promote_followers": {
    goal: "followers",
    label: "More followers",
    amountPence: 3000,
  },
} as const;

export type PromoteProductId = keyof typeof PROMOTE_PRODUCTS;
export type PromoteGoal = (typeof PROMOTE_PRODUCTS)[PromoteProductId]["goal"];
export type PromoteContentType = "video" | "profile" | "live";

export function isPromoteProductId(id: string): id is PromoteProductId {
  return Object.prototype.hasOwnProperty.call(PROMOTE_PRODUCTS, id);
}

export function promoteProduct(id: string) {
  if (!isPromoteProductId(id)) return null;
  return { productId: id, ...PROMOTE_PRODUCTS[id] };
}

export const promoteCompleteBodySchema = z.object({
  provider: z.enum(["apple", "google"]),
  productId: z.string().min(1),
  receipt: z.string().min(1),
  transactionId: z.string().min(1).optional(),
  contentType: z.enum(["video", "profile", "live"]).default("video"),
  contentId: z.string().optional(),
});

export const promoteCompleteResponseSchema = z.object({
  success: z.literal(true),
  ok: z.literal(true),
  deduplicated: z.boolean(),
});

export type PromoteCompleteBody = z.infer<typeof promoteCompleteBodySchema>;
