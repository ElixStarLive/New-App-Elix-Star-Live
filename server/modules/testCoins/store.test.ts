import { describe, expect, it, vi } from "vitest";

const envMock = vi.fn(() => ({ valkeyUrl: null as string | null }));
const hget = vi.fn();
const hincrby = vi.fn();

vi.mock("../../infra/env.js", () => ({
  env: () => envMock(),
}));

vi.mock("../../infra/logger.js", () => ({
  logger: { error: vi.fn() },
}));

vi.mock("../../infra/valkey.js", () => ({
  requireValkey: () => ({ hget, hincrby }),
}));

describe("test coin Valkey store", () => {
  it("fails closed when Valkey is not configured", async () => {
    envMock.mockReturnValue({ valkeyUrl: null });
    const { readTestCoinBalance, creditTestCoinBalance, debitTestCoinBalance } = await import("./store.js");
    expect(await readTestCoinBalance("u1")).toEqual({ status: "unavailable" });
    expect(await creditTestCoinBalance("u1", 10)).toEqual({ status: "unavailable" });
    expect(await debitTestCoinBalance("u1", 1)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("reads and credits a hash field when Valkey answers", async () => {
    envMock.mockReturnValue({ valkeyUrl: "redis://test" });
    hget.mockResolvedValue("12");
    hincrby.mockResolvedValue(22);
    const { readTestCoinBalance, creditTestCoinBalance } = await import("./store.js");
    expect(await readTestCoinBalance("u1")).toEqual({ status: "ok", balance: 12 });
    expect(await creditTestCoinBalance("u1", 10)).toEqual({ status: "ok", balance: 22 });
  });
});
