import { beforeEach, describe, expect, it, vi } from "vitest";

const envState = vi.hoisted(() => ({ valkeyUrl: null as string | null }));
const valkey = vi.hoisted(() => ({
  get: vi.fn(),
  del: vi.fn(),
  set: vi.fn(),
}));

vi.mock("../../infra/env.js", () => ({
  env: () => ({ valkeyUrl: envState.valkeyUrl, isProduction: false }),
}));

vi.mock("../../infra/valkey.js", () => ({
  requireValkey: () => ({ get: valkey.get }),
  valkeyDel: (key: string) => valkey.del(key),
  valkeySet: (key: string, value: string, ttlMs: number) => valkey.set(key, value, ttlMs),
}));

import {
  PUBLIC_GIFTS_CATALOG_KEY,
  invalidatePublicGiftsCatalogCache,
  parsePublicGiftsCatalogCache,
  readPublicGiftsCatalogCache,
  writePublicGiftsCatalogCache,
} from "./catalogCache.js";

describe("PAGE-073 public gifts catalog cache", () => {
  beforeEach(() => {
    envState.valkeyUrl = null;
    valkey.get.mockReset();
    valkey.del.mockReset();
    valkey.set.mockReset();
  });

  it("uses the exact NEW catalog key and rejects malformed blobs", () => {
    expect(PUBLIC_GIFTS_CATALOG_KEY).toBe("gifts:catalog:v1");
    expect(
      parsePublicGiftsCatalogCache(
        JSON.stringify([{ id: "rose", name: "Rose", coinCost: 1, animationUrl: null }]),
      ),
    ).toEqual([{ id: "rose", name: "Rose", coinCost: 1, animationUrl: null }]);
    expect(parsePublicGiftsCatalogCache(JSON.stringify([{ id: "rose", coinCost: 1 }]))).toBeNull();
    expect(parsePublicGiftsCatalogCache("not-json")).toBeNull();
  });

  it("skips Valkey when it is not configured and never uses a process map", () => {
    envState.valkeyUrl = null;
    return Promise.all([
      expect(readPublicGiftsCatalogCache()).resolves.toBeNull(),
      expect(writePublicGiftsCatalogCache([])).resolves.toBeUndefined(),
      expect(invalidatePublicGiftsCatalogCache()).resolves.toBe("skipped"),
    ]).then(() => {
      expect(valkey.get).not.toHaveBeenCalled();
      expect(valkey.del).not.toHaveBeenCalled();
      expect(valkey.set).not.toHaveBeenCalled();
    });
  });

  it("invalidates the exact key after a configured Valkey delete", async () => {
    envState.valkeyUrl = "redis://test";
    valkey.del.mockResolvedValue(1);
    await expect(invalidatePublicGiftsCatalogCache()).resolves.toBe("invalidated");
    expect(valkey.del).toHaveBeenCalledWith(PUBLIC_GIFTS_CATALOG_KEY);
  });

  it("fails closed when configured Valkey invalidation throws", async () => {
    envState.valkeyUrl = "redis://test";
    valkey.del.mockRejectedValue(new Error("down"));
    await expect(invalidatePublicGiftsCatalogCache()).rejects.toMatchObject({
      status: 503,
      code: "unavailable",
    });
  });
});
