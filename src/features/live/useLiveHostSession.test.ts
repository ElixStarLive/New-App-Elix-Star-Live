import { afterEach, describe, expect, it, vi } from "vitest";
import { runLiveHostStart } from "./useLiveHostSession";

const start = vi.fn();
const end = vi.fn();
const connectWs = vi.fn();
const connect = vi.fn();
const publishCamera = vi.fn();
const attachLocalVideo = vi.fn();
const disconnect = vi.fn();
const setCameraEnabled = vi.fn();
const setMicrophoneEnabled = vi.fn();
const switchCamera = vi.fn();

const session = {
  streamId: "22222222-2222-4222-8222-222222222222",
  roomId: "11111111-1111-4111-8111-111111111111",
  livekitToken: "host-jwt",
  livekitUrl: "wss://livekit.example",
};

describe("runLiveHostStart", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts once, connects LiveKit, then publishes", async () => {
    start.mockResolvedValue({ session, error: null });
    connect.mockResolvedValue(undefined);
    publishCamera.mockResolvedValue(undefined);
    const result = await runLiveHostStart({
      title: "LIVE",
      token: "session-token",
      start,
      end,
      connectWs,
      createSession: () => ({
        connect,
        publishCamera,
        attachLocalVideo,
        disconnect,
        setCameraEnabled,
        setMicrophoneEnabled,
        switchCamera,
      }),
    });
    expect(result).toMatchObject({ ok: true, session });
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith("LIVE");
    expect(connect).toHaveBeenCalledWith("wss://livekit.example", "host-jwt");
    expect(publishCamera).toHaveBeenCalledWith({ audio: true, video: true });
    expect(connectWs).toHaveBeenCalledWith(session.roomId, "session-token", {
      persistent: true,
      ownerId: "live-host",
    });
    expect(end).not.toHaveBeenCalled();
  });

  it("rolls back the server live when LiveKit publish fails", async () => {
    start.mockResolvedValue({ session, error: null });
    connect.mockResolvedValue(undefined);
    publishCamera.mockRejectedValue(new Error("NotAllowedError: Permission denied"));
    disconnect.mockResolvedValue(undefined);
    end.mockResolvedValue({ ok: true });
    const result = await runLiveHostStart({
      title: "LIVE",
      token: "session-token",
      start,
      end,
      connectWs,
      createSession: () => ({
        connect,
        publishCamera,
        attachLocalVideo,
        disconnect,
        setCameraEnabled,
        setMicrophoneEnabled,
        switchCamera,
      }),
    });
    expect(result).toEqual({ ok: false, error: "NotAllowedError: Permission denied" });
    expect(end).toHaveBeenCalledWith(session.streamId);
    expect(connectWs).not.toHaveBeenCalled();
  });

  it("does not mark live when start is refused", async () => {
    start.mockResolvedValue({ session: null, error: "Live streaming is not configured" });
    const result = await runLiveHostStart({
      title: "LIVE",
      token: "session-token",
      start,
      end,
      connectWs,
      createSession: () => ({
        connect,
        publishCamera,
        attachLocalVideo,
        disconnect,
        setCameraEnabled,
        setMicrophoneEnabled,
        switchCamera,
      }),
    });
    expect(result).toEqual({ ok: false, error: "Live streaming is not configured" });
    expect(connect).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });
});
