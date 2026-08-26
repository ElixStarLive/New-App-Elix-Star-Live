import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifySpectatorJoinError,
  runSpectatorJoin,
  spectatorJoinErrorCopy,
  syncSpectatorCohostPublish,
} from "./useSpectatorSession";

const requestToken = vi.fn();
const connectWs = vi.fn();
const connect = vi.fn();
const disconnect = vi.fn();

const creds = {
  token: "spec-jwt",
  url: "wss://livekit.example",
  roomId: "11111111-1111-4111-8111-111111111111",
  streamId: "22222222-2222-4222-8222-222222222222",
  hostId: "11111111-1111-4111-8111-111111111111",
  displayName: "Maya",
  username: "maya",
  avatarUrl: null,
  canPublish: false,
};

describe("runSpectatorJoin", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("connects once as a subscriber and never ends the host", async () => {
    requestToken.mockResolvedValue({ token: creds, error: null });
    connect.mockResolvedValue(undefined);
    const result = await runSpectatorJoin({
      roomId: creds.roomId,
      token: "session-token",
      generation: 1,
      isCurrent: () => true,
      requestToken,
      connectWs,
      createSession: () =>
        ({
          connect,
          disconnect,
        }) as never,
    });
    expect(result.ok).toBe(true);
    expect(requestToken).toHaveBeenCalledTimes(1);
    expect(requestToken).toHaveBeenCalledWith(creds.roomId, "spectator");
    expect(connect).toHaveBeenCalledWith("wss://livekit.example", "spec-jwt");
    expect(connectWs).toHaveBeenCalledWith(creds.roomId, "session-token", {
      persistent: true,
      ownerId: "live-spectator",
    });
  });

  it("drops a stale token/connect so a late room A cannot overlay room B", async () => {
    requestToken.mockResolvedValue({ token: creds, error: null });
    const result = await runSpectatorJoin({
      roomId: creds.roomId,
      token: "session-token",
      generation: 1,
      isCurrent: () => false,
      requestToken,
      connectWs,
      createSession: () => ({ connect, disconnect }) as never,
    });
    expect(result).toEqual({ ok: false, phase: "failed", error: "stale" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects credentials that grant publish to an ordinary spectator", async () => {
    requestToken.mockResolvedValue({ token: { ...creds, canPublish: true }, error: null });
    const result = await runSpectatorJoin({
      roomId: creds.roomId,
      token: "session-token",
      generation: 1,
      isCurrent: () => true,
      requestToken,
      connectWs,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/publish/i);
  });

  it("surfaces LiveKit 429 as a service failure, not stream ended", async () => {
    requestToken.mockResolvedValue({ token: creds, error: null });
    connect.mockRejectedValue(new Error("Could not connect: HTTP 429"));
    disconnect.mockResolvedValue(undefined);
    const result = await runSpectatorJoin({
      roomId: creds.roomId,
      token: "session-token",
      generation: 1,
      isCurrent: () => true,
      requestToken,
      connectWs,
      createSession: () => ({ connect, disconnect }) as never,
    });
    expect(result).toEqual({
      ok: false,
      phase: "failed",
      error: spectatorJoinErrorCopy("HTTP 429"),
    });
    expect(classifySpectatorJoinError("websocket 429 resource exhausted")).toBe("failed");
    expect(classifySpectatorJoinError("Live has ended")).toBe("ended");
  });
});

describe("syncSpectatorCohostPublish", () => {
  const requestToken = vi.fn();
  const connect = vi.fn();
  const publishCamera = vi.fn();
  const setCameraEnabled = vi.fn();
  const setMicrophoneEnabled = vi.fn();

  afterEach(() => vi.clearAllMocks());

  it("promotes to co-host publish when the server grants permission", async () => {
    requestToken.mockResolvedValueOnce({
      token: { ...creds, canPublish: true, token: "pub-jwt", url: "wss://livekit.example" },
      error: null,
    });
    connect.mockResolvedValue(undefined);
    publishCamera.mockResolvedValue(undefined);
    const session = { connect, publishCamera, setCameraEnabled, setMicrophoneEnabled } as never;
    const result = await syncSpectatorCohostPublish({
      roomId: creds.roomId,
      sessionToken: "session-token",
      session,
      shouldPublish: true,
      requestToken,
    });
    expect(result).toEqual({ ok: true, publishing: true });
    expect(requestToken).toHaveBeenCalledWith(creds.roomId, "cohost");
    expect(publishCamera).toHaveBeenCalledWith({ audio: true, video: true });
  });

  it("demotes back to subscribe-only spectator credentials", async () => {
    setCameraEnabled.mockResolvedValue(undefined);
    setMicrophoneEnabled.mockResolvedValue(undefined);
    requestToken.mockResolvedValueOnce({ token: creds, error: null });
    connect.mockResolvedValue(undefined);
    const session = { connect, publishCamera, setCameraEnabled, setMicrophoneEnabled } as never;
    const result = await syncSpectatorCohostPublish({
      roomId: creds.roomId,
      sessionToken: "session-token",
      session,
      shouldPublish: false,
      requestToken,
    });
    expect(result).toEqual({ ok: true, publishing: false });
    expect(requestToken).toHaveBeenCalledWith(creds.roomId, "spectator");
  });
});
