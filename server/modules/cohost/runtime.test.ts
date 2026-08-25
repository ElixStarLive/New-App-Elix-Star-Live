import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.fn((): { valkeyUrl: string | null } => ({ valkeyUrl: null }));

vi.mock("../../infra/env.js", () => ({
  env: () => envMock(),
}));
vi.mock("../../infra/valkey.js", () => ({
  requireValkey: () => {
    throw new Error("VALKEY_URL is not configured");
  },
  valkeyDel: vi.fn(),
  valkeyGet: vi.fn(),
  valkeyTrySetNx: vi.fn(),
}));

import { loadCohost, saveCohost } from "./runtime.js";

describe("FLOW-007 cohost Valkey owner", () => {
  beforeEach(() => {
    envMock.mockReturnValue({ valkeyUrl: null });
  });

  it("fails closed instead of using process memory", async () => {
    await expect(loadCohost("room-1", "host-1")).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    });
    await expect(saveCohost({ roomId: "room-1", hostId: "host-1", bigScreenUserId: null, seats: [], requests: [] })).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    });
  });
});
