import { describe, expect, it } from "vitest";
import { applyWalletDelta } from "./ledger.js";

type QueryResult<T> = { rows: T[] };

function fakeClient(state: {
  paid: number;
  seen: Set<string>;
}) {
  return {
    async query(sql: string, params: unknown[] = []): Promise<QueryResult<Record<string, unknown>>> {
      if (sql.includes("SELECT id FROM wallet_ledger")) {
        return { rows: state.seen.has(String(params[0])) ? [{ id: "1" }] : [] };
      }
      if (sql.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              paid_coins: String(state.paid),
              promo_coins: "0",
              starter_coins: "0",
              test_coins: "0",
            },
          ],
        };
      }
      if (sql.includes("UPDATE wallet_balances")) {
        state.paid = Number(params[1]);
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO wallet_ledger")) {
        state.seen.add(String(params[5]));
        return { rows: [] };
      }
      throw new Error(`unexpected sql: ${sql}`);
    },
  };
}

describe("wallet ledger", () => {
  it("refuses a debit that would go negative", async () => {
    const client = fakeClient({ paid: 5, seen: new Set() });
    await expect(
      applyWalletDelta(client as never, {
        userId: "u1",
        bucket: "paid",
        delta: -10,
        reason: "gift",
        idempotencyKey: "k1",
      }),
    ).rejects.toMatchObject({ code: "insufficient_balance" });
  });

  it("is idempotent on the same key", async () => {
    const client = fakeClient({ paid: 100, seen: new Set(["k1"]) });
    await expect(
      applyWalletDelta(client as never, {
        userId: "u1",
        bucket: "paid",
        delta: -1,
        reason: "gift",
        idempotencyKey: "k1",
      }),
    ).rejects.toMatchObject({ code: "duplicate" });
  });

  it("credits and records the balance after", async () => {
    const client = fakeClient({ paid: 0, seen: new Set() });
    const result = await applyWalletDelta(client as never, {
      userId: "u1",
      bucket: "paid",
      delta: 500,
      reason: "iap",
      idempotencyKey: "k2",
    });
    expect(result.balanceAfter).toBe(500);
  });
});
