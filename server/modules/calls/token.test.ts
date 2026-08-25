import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../middleware/errors.js";

const queryMock = vi.fn();
const mintMock = vi.fn(async (_opts: unknown) => ({ token: "call-jwt", url: "wss://livekit.example" }));
const configuredMock = vi.fn(() => true);

vi.mock("../../infra/postgres.js", () => ({
  getPool: () => ({ query: queryMock }),
}));
vi.mock("../../infra/livekit.js", () => ({
  createLivekitToken: (opts: unknown) => mintMock(opts),
  isLivekitConfigured: () => configuredMock(),
}));

import { issueCallToken } from "./token.js";

const callerId = "11111111-1111-4111-8111-111111111111";
const calleeId = "22222222-2222-4222-8222-222222222222";
const strangerId = "33333333-3333-4333-8333-333333333333";
const callId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const roomName = `call_${callId}`;

describe("PAGE-034 call LiveKit token", () => {
  beforeEach(() => {
    queryMock.mockReset();
    mintMock.mockClear();
    configuredMock.mockReturnValue(true);
  });

  it("mints a publish token for a participant on the stored call_* room", async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: callId,
          caller_id: callerId,
          callee_id: calleeId,
          room_name: roomName,
          status: "active",
        },
      ],
    });
    const creds = await issueCallToken(calleeId, callId);
    expect(creds.roomName).toBe(roomName);
    expect(creds.callId).toBe(callId);
    expect(mintMock).toHaveBeenCalledWith({
      identity: calleeId,
      room: roomName,
      canPublish: true,
      ttl: "1h",
    });
  });

  it("blocks a stranger and an ended call", async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: callId,
          caller_id: callerId,
          callee_id: calleeId,
          room_name: roomName,
          status: "active",
        },
      ],
    });
    await expect(issueCallToken(strangerId, callId)).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    } satisfies Partial<AppError>);
    queryMock.mockResolvedValue({
      rows: [
        {
          id: callId,
          caller_id: callerId,
          callee_id: calleeId,
          room_name: roomName,
          status: "ended",
        },
      ],
    });
    await expect(issueCallToken(callerId, callId)).rejects.toMatchObject({ status: 403 });
    expect(mintMock).not.toHaveBeenCalled();
  });

  it("does not mint when LiveKit is down", async () => {
    configuredMock.mockReturnValue(false);
    queryMock.mockResolvedValue({
      rows: [
        {
          id: callId,
          caller_id: callerId,
          callee_id: calleeId,
          room_name: roomName,
          status: "ringing",
        },
      ],
    });
    await expect(issueCallToken(callerId, callId)).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    });
  });
});
