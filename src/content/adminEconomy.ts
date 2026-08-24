/** Frozen PAGE-073 Admin Economy labels. Catalog price edit only — no wallet adjust. */

export const ADMIN_ECONOMY_TITLE = "Economy Controls";
export const ADMIN_ECONOMY_LOADING = "Loading...";
export const ADMIN_ECONOMY_ERROR = "Failed to load economy data";
export const ADMIN_ECONOMY_HOME = "/admin/economy";
export const ADMIN_ECONOMY_PACKAGES_TITLE = "Coin Packages";
export const ADMIN_ECONOMY_PACKAGES_EMPTY = "No coin packages found in coin_packages.";
export const ADMIN_ECONOMY_GIFTS_TITLE = "Gifts Catalog";
export const ADMIN_ECONOMY_BOOSTERS_TITLE = "Boosters Catalog";
export const ADMIN_ECONOMY_STATUS_ACTIVE = "Active";
export const ADMIN_ECONOMY_STATUS_INACTIVE = "Inactive";
export const ADMIN_ECONOMY_EDIT_PRICE = "Edit Price";
export const ADMIN_ECONOMY_PRICE_PROMPT_TITLE = "Edit Price";
export const ADMIN_ECONOMY_INVALID_PRICE = "Invalid price";
export const ADMIN_ECONOMY_PRICE_UPDATED = "Price updated";
export const ADMIN_ECONOMY_PRICE_FAILURE = "Failed to update price";
export const ADMIN_ECONOMY_RARITY_UNAVAILABLE = "—";
export const ADMIN_ECONOMY_PRICE_EMPTY = "—";

export function adminEconomyPricePrompt(name: string): string {
  return `New price for ${name}:`;
}

export function parseEconomyGiftPriceInput(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}
