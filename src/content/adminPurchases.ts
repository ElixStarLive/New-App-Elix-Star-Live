/** Frozen PAGE-075 Admin Purchases labels. Read-only IAP + Shop visibility. */

export const ADMIN_PURCHASES_TITLE = "Purchases";
export const ADMIN_PURCHASES_SUBTITLE = "IAP coin purchases and Stripe shop checkouts are separate ledgers.";
export const ADMIN_PURCHASES_BACK = "← Admin";
export const ADMIN_PURCHASES_LOADING = "Loading…";
export const ADMIN_PURCHASES_ERROR = "Failed to load purchases";
export const ADMIN_PURCHASES_EMPTY = "No purchases found.";
export const ADMIN_PURCHASES_TAB_IAP = "Coin IAP";
export const ADMIN_PURCHASES_TAB_SHOP = "Shop (Stripe)";
export const ADMIN_PURCHASES_COL_WHEN = "When";
export const ADMIN_PURCHASES_COL_USER = "User / session";
export const ADMIN_PURCHASES_COL_DETAIL = "Detail";
export const ADMIN_PURCHASES_COL_AMOUNT = "Amount";
export const ADMIN_PURCHASES_HOME = "/admin/purchases";
export const ADMIN_PURCHASES_ID_DISPLAY_MAX = 28;

export type AdminPurchaseTab = "iap" | "shop";

export function formatAdminPurchasePence(pence: number): string {
  if (!Number.isInteger(pence) || pence < 0) return "—";
  const pounds = Math.trunc(pence / 100);
  const remainder = pence % 100;
  return `£${pounds}.${String(remainder).padStart(2, "0")}`;
}

export function formatAdminPurchaseId(raw: string): string {
  return raw.slice(0, ADMIN_PURCHASES_ID_DISPLAY_MAX);
}

export function formatAdminPurchaseWhen(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}
