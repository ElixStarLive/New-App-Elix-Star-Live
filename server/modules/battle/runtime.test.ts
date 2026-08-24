import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.fn((): { valkeyUrl: string | null } => ({ valkeyUrl: null }));

vi.mock("../../infra/env.js", () => ({
  env: () => envMock(),
}));
vi.mock("../../infra/valkey.js", () => ({
  requireValkey: () => {
    throw new Error("VALKEY_URL is not configured");
  },
  valkeyPub: () => ({
    publish: vi.fn(),
  }),
}));
vi.mock("../../infra/postgres.js", () => ({
  getPool: () => ({ query: vi.fn() }),
}));

import { emptyBattle } from "./state.js";
import { loadBattle, publishRoom, saveBattle } from "./runtime.js";

describe("FLOW-008/009 battle Valkey owner", () => {
  beforeEach(() => {
    envMock.mockReturnValue({ valkeyUrl: null });
  });

  it("fails closed instead of using process memory", async () => {
    await expect(loadBattle("room-1")).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    });
    await expect(saveBattle(emptyBattle("room-1", "1x1", "host-1"))).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    });
    await expect(publishRoom("room-1", "gift_sent", {})).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    });
  });
});
