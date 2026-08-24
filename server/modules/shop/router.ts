import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { createShopItem, deleteShopItem, listShopItems, updateShopItem } from "./catalog.js";
import { createShopCheckout, getShopCheckoutSession } from "./checkout.js";

export const shopRouter = Router();

shopRouter.get("/items", (req, res, next) => {
  void listShopItems(req as AuthedRequest, res).catch(next);
});
shopRouter.post("/items", requireAuth, (req, res, next) => {
  void createShopItem(req as AuthedRequest, res).catch(next);
});
shopRouter.patch("/items/:itemId", requireAuth, (req, res, next) => {
  void updateShopItem(req as AuthedRequest, res).catch(next);
});
shopRouter.delete("/items/:itemId", requireAuth, (req, res, next) => {
  void deleteShopItem(req as AuthedRequest, res).catch(next);
});
shopRouter.post("/checkout", requireAuth, (req, res, next) => {
  void createShopCheckout(req as AuthedRequest, res).catch(next);
});
shopRouter.get("/checkout-session/:sessionId", requireAuth, (req, res, next) => {
  void getShopCheckoutSession(req as AuthedRequest, res).catch(next);
});
