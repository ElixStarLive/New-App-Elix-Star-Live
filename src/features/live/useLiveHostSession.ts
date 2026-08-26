import { liveStartResponseSchema, type LiveStartResponse } from "@shared/contracts";
import { apiLiveEnd, apiLiveStart } from "@/features/feed/feedApi";
import { LiveKitSession } from "@/lib/livekitSession";
import { getSessionToken } from "@/lib/sessionToken";
import { showToast } from "@/lib/toast";
import { wsClient } from "@/lib/wsClient";
import { useCallback, useEffect, useRef, useState } from "react";

export const HOST_WS_OWNER = "live-host";

export type HostLiveKit = {
  connect: (url: string, token: string) => Promise<void>;
  publishCamera: (opts?: { audio?: boolean; video?: boolean }) => Promise<void>;
  attachLocalVideo: (el: HTMLVideoElement) => void;
  disconnect: () => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  switchCamera: () => Promise<void>;
};

export async function runLiveHostStart(args: {
  title: string;
  token: string | null;
  start?: typeof apiLiveStart;
  end?: typeof apiLiveEnd;
  connectWs?: typeof wsClient.connect;
  createSession?: () => HostLiveKit;
  localVideo?: HTMLVideoElement | null;
}): Promise<{ ok: true; session: LiveStartResponse; livekit: HostLiveKit } | { ok: false; error: string }> {
  if (!args.token) return { ok: false, error: "Sign in required" };
  const start = args.start ?? apiLiveStart;
  const end = args.end ?? apiLiveEnd;
  const connectWs = args.connectWs ?? ((...params: Parameters<typeof wsClient.connect>) => wsClient.connect(...params));
  const started = await start(args.title);
  if (!started.session) return { ok: false, error: started.error || "Could not start live" };
  const parsed = liveStartResponseSchema.safeParse(started.session);
  if (!parsed.success) {
    await end(started.session.streamId);
    return { ok: false, error: "Invalid live start response" };
  }
  const livekit = args.createSession ? args.createSession() : new LiveKitSession();
  try {
    await withTimeout(
      (async () => {
        await livekit.connect(parsed.data.livekitUrl, parsed.data.livekitToken);
        await livekit.publishCamera({ audio: true, video: true });
      })(),
      25_000,
      "Camera/mic timed out. Allow browser access and try again.",
    );
    if (args.localVideo) livekit.attachLocalVideo(args.localVideo);
    connectWs(parsed.data.roomId, args.token, { persistent: true, ownerId: HOST_WS_OWNER });
    return { ok: true, session: parsed.data, livekit };
  } catch (err) {
    await end(parsed.data.streamId);
    await livekit.disconnect().catch(() => undefined);
    return { ok: false, error: err instanceof Error ? err.message : "Live video could not start" };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function useLiveHostSession(enabled: boolean, title: string) {
  const [connecting, setConnecting] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [streamId, setStreamId] = useState("");
  const [roomId, setRoomId] = useState("");
  const sessionRef = useRef<HostLiveKit | null>(null);
  const streamIdRef = useRef("");
  const startLock = useRef(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const titleRef = useRef(title);
  titleRef.current = title;

  const attachLocal = useCallback((el: HTMLVideoElement | null) => {
    localVideoRef.current = el;
    if (el) sessionRef.current?.attachLocalVideo(el);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setConnecting(false);
      return;
    }
    let cancelled = false;
    // Defer start so React Strict Mode remount cancels the first timer (avoids dual go-live).
    const timer = window.setTimeout(() => {
      if (cancelled || startLock.current) return;
      startLock.current = true;
      void (async () => {
        setConnecting(true);
        setError(null);
        const result = await runLiveHostStart({
          title: titleRef.current,
          token: getSessionToken(),
          localVideo: localVideoRef.current,
        });
        if (cancelled) {
          if (result.ok) {
            await result.livekit.disconnect();
            wsClient.disconnect(HOST_WS_OWNER);
          }
          startLock.current = false;
          return;
        }
        if (!result.ok) {
          setError(result.error);
          setConnecting(false);
          startLock.current = false;
          return;
        }
        streamIdRef.current = result.session.streamId;
        sessionRef.current = result.livekit;
        setStreamId(result.session.streamId);
        setRoomId(result.session.roomId);
        setConnecting(false);
        startLock.current = false;
      })();
    }, 50);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      void sessionRef.current?.disconnect();
      sessionRef.current = null;
      wsClient.disconnect(HOST_WS_OWNER);
    };
  }, [enabled]);

  const endBroadcast = useCallback(async () => {
    const id = streamIdRef.current;
    void sessionRef.current?.disconnect();
    sessionRef.current = null;
    wsClient.disconnect(HOST_WS_OWNER);
    if (id) {
      const ended = await apiLiveEnd(id);
      if (!ended.ok) showToast(ended.error);
    }
    streamIdRef.current = "";
  }, []);

  return {
    connecting,
    error,
    streamId,
    roomId,
    sessionRef,
    attachLocal,
    endBroadcast,
  };
}
