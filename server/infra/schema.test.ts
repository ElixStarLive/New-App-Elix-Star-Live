import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations/20260819100000_baseline.sql"),
  "utf8",
);

describe("baseline schema", () => {
  it("uses a composite primary key for store-specific coin SKUs", () => {
    expect(sql).toContain("PRIMARY KEY (provider, product_id)");
  });

  it("makes wallet ledger idempotent and non-negative", () => {
    expect(sql).toContain("idempotency_key TEXT NOT NULL UNIQUE");
    expect(sql).toContain("CHECK (paid_coins >= 0)");
    expect(sql).toContain("CHECK (balance_after >= 0)");
  });

  it("keeps the GBP financial ledger append-only by uniqueness", () => {
    expect(sql).toMatch(/CREATE TABLE financial_ledger[\s\S]*idempotency_key TEXT NOT NULL UNIQUE/);
  });

  it("does not replay historical gift-price patch filenames", () => {
    expect(sql.includes("restore_rose_battle_points")).toBe(false);
  });
});

describe("product-complete schema", () => {
  it("adds paid coin lots and 60/40 monetisation without replaying old patches", () => {
    const product = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations/20260820100000_product_complete.sql"),
      "utf8",
    );
    expect(product).toContain("CREATE TABLE IF NOT EXISTS paid_coin_lots");
    expect(product).toContain("gift_creator_pct INTEGER NOT NULL DEFAULT 60");
    expect(product.includes("restore_rose_battle_points")).toBe(false);
  });
});
