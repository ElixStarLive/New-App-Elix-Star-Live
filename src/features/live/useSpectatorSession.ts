import type { LiveTokenResponse } from "@shared/contracts";
import { apiLiveToken } from "@/features/feed/feedApi";
import { isRecord } from "@/lib/isRecord";
import { LiveKitSession } from "@/lib/livekitSession";
import { getSessionToken } from "@/lib/sessionToken";
import { wsClient } from "@/lib/wsClient";
import { Track, type RemoteTrack } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";

export const SPECTATOR_WS_OWNER = "live-spectator";

export type SpectatorPhase = "connecting" | "live" | "ended" | "failed";

export function classifySpectatorJoinError(message: string): SpectatorPhase {
  const m = message.toLowerCase();
  if (m.includes("429") || m.includes("resource exhausted") || m.includes("connection limit") || m.includes("quota")) {
    return "failed";
  }
  if (m.includes("404") || m.includes("ended") || m.includes("not found") || m.includes("not live")) {
    return "ended";
  }
  return "failed";
}

export function spectatorJoinErrorCopy(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("429") || m.includes("resource exhausted") || m.includes("connection limit") || m.includes("quota")) {
    return "Live video is temporarily unavailable (connection limit). Try again later.";
  }
  if (m.includes("403") || m.includes("blocked") || m.includes("forbidden")) {
    return "You cannot watch this live";
  }
  if (m.includes("503") || m.includes("not configured") || m.includes("unavailable")) {
    return "Live video is not available right now";
  }
  if (m.includes("404") || m.includes("ended") || m.includes("not found") || m.includes("not live")) {
    return "This live has ended or is not available right now.";
  }
  return message.trim() || "Could not connect to live";
}

export async function runSpectatorJoin(args: {
  roomId: string;
  token: string | null;
  generation: number;
  isCurrent: (generation: number) => boolean;
  requestToken?: typeof apiLiveToken;
  connectWs?: typeof wsClient.connect;
  createSession?: () => LiveKitSession;
  attachVideo?: (identity: string, track: RemoteTrack) => void;
  detachVideo?: (identity: string) => void;
}): Promise<
  | { ok: true; creds: LiveTokenResponse; session: LiveKitSession }
  | { ok: false; phase: SpectatorPhase; error: string }
> {
  if (!args.token) return { ok: false, phase: "failed", error: "Sign in required" };
  if (!args.roomId.trim()) return { ok: false, phase: "failed", error: "Missing room" };
  const requestToken = args.requestToken ?? apiLiveToken;
  const connectWs = args.connectWs ?? ((...params: Parameters<typeof wsClient.connect>) => wsClient.connect(...params));
  const requested = await requestToken(args.roomId, "spectator");
  if (!args.isCurrent(args.generation)) {
    return { ok: false, phase: "failed", error: "stale" };
  }
  if (!requested.token) {
    const error = spectatorJoinErrorCopy(requested.error || "Could not join live");
    return { ok: false, phase: classifySpectatorJoinError(requested.error || error), error };
  }
  if (requested.token.canPublish) {
    return { ok: false, phase: "failed", error: "Spectator credentials must not include publish permission" };
  }
  if (requested.token.roomId !== args.roomId) {
    return { ok: false, phase: "failed", error: "Server returned a different room" };
  }
  const session = args.createSession
    ? args.createSession()
    : new LiveKitSession({
        onTrackSubscribed: ({ track, participant }) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            if (el instanceof HTMLAudioElement) {
              el.autoplay = true;
              void el.play().catch(() => undefined);
            }
          }
          if (track.kind === Track.Kind.Video) {
            args.attachVideo?.(participant.identity, track);
          }
        },
        onTrackUnsubscribed: ({ track, participant }) => {
          if (track.kind === Track.Kind.Video) args.detachVideo?.(participant.identity);
        },
        onParticipantDisconnected: (participant) => {
          args.detachVideo?.(participant.identity);
        },
      });
  try {
    await session.connect(requested.token.url, requested.token.token);
    if (!args.isCurrent(args.generation)) {
      await session.disconnect();
      return { ok: false, phase: "failed", error: "stale" };
    }
    connectWs(requested.token.roomId, args.token, { persistent: true, ownerId: SPECTATOR_WS_OWNER });
    return { ok: true, creds: requested.token, session };
  } catch (err) {
    await session.disconnect().catch(() => undefined);
    const raw = err instanceof Error ? err.message : "Could not connect to live";
    const error = spectatorJoinErrorCopy(raw);
    return { ok: false, phase: classifySpectatorJoinError(raw), error };
  }
}

export function useSpectatorSession(enabled: boolean, roomId: string) {
  const [phase, setPhase] = useState<SpectatorPhase>(enabled ? "connecting" : "failed");
  const [error, setError] = useState<string | null>(enabled ? null : "Missing room");
  const [creds, setCreds] = useState<LiveTokenResponse | null>(null);
  const sessionRef = useRef<LiveKitSession | null>(null);
  const remoteEls = useRef<Map<string, HTMLVideoElement>>(new Map());
  const tracks = useRef<Map<string, RemoteTrack>>(new Map());
  const generationRef = useRef(0);

  const attachRemote = useCallback((identity: string) => (el: HTMLVideoElement | null) => {
    if (!el) {
      remoteEls.current.delete(identity);
      return;
    }
    remoteEls.current.set(identity, el);
    const track = tracks.current.get(identity);
    if (track) track.attach(el);
  }, []);

  useEffect(() => {
    if (!enabled || !roomId.trim()) {
      setPhase("failed");
      setError(enabled ? "Missing room" : null);
      return;
    }
    const generation = ++generationRef.current;
    let cancelled = false;
    const ownedTracks = tracks.current;
    setPhase("connecting");
    setError(null);
    setCreds(null);

    void (async () => {
      const result = await runSpectatorJoin({
        roomId,
        token: getSessionToken(),
        generation,
        isCurrent: (ticket) => ticket === generationRef.current && !cancelled,
        attachVideo: (identity, track) => {
          tracks.current.set(identity, track);
          const el = remoteEls.current.get(identity);
          if (el) track.attach(el);
        },
        detachVideo: (identity) => {
          tracks.current.delete(identity);
        },
        createSession: () =>
          new LiveKitSession({
            onDisconnected: () => {
              if (cancelled || generation !== generationRef.current) return;
              void apiLiveToken(roomId, "spectator").then((check) => {
                if (cancelled || generation !== generationRef.current) return;
                if (!check.token) {
                  setPhase(classifySpectatorJoinError(check.error || "ended"));
                  setError(spectatorJoinErrorCopy(check.error || "ended"));
                  return;
                }
                setPhase("failed");
                setError("Disconnected from live");
              });
            },
            onTrackSubscribed: ({ track, participant }) => {
              if (track.kind === Track.Kind.Audio) {
                const el = track.attach();
                if (el instanceof HTMLAudioElement) {
                  el.autoplay = true;
                  void el.play().catch(() => undefined);
                }
              }
              if (track.kind === Track.Kind.Video) {
                tracks.current.set(participant.identity, track);
                const el = remoteEls.current.get(participant.identity);
                if (el) track.attach(el);
              }
            },
            onTrackUnsubscribed: ({ participant }) => {
              tracks.current.delete(participant.identity);
            },
            onParticipantDisconnected: (participant) => {
              tracks.current.delete(participant.identity);
            },
          }),
      });
      if (cancelled || generation !== generationRef.current) {
        if (result.ok) await result.session.disconnect();
        return;
      }
      if (!result.ok) {
        setPhase(result.phase === "ended" ? "ended" : "failed");
        setError(result.error);
        return;
      }
      sessionRef.current = result.session;
      setCreds(result.creds);
      setPhase("live");
    })();

    return () => {
      cancelled = true;
      generationRef.current += 1;
      void sessionRef.current?.disconnect();
      sessionRef.current = null;
      ownedTracks.clear();
      wsClient.disconnect(SPECTATOR_WS_OWNER);
    };
  }, [enabled, roomId]);

  const leave = useCallback(async () => {
    generationRef.current += 1;
    void sessionRef.current?.disconnect();
    sessionRef.current = null;
    tracks.current.clear();
    wsClient.disconnect(SPECTATOR_WS_OWNER);
  }, []);

  const markEnded = useCallback(() => {
    setPhase("ended");
    setError("This live has ended or is not available right now.");
    void leave();
  }, [leave]);

  useEffect(() => {
    if (!enabled) return;
    const onEnd = (data: unknown) => {
      const endedRoom = isRecord(data) && typeof data.roomId === "string" ? data.roomId : "";
      if (endedRoom && endedRoom !== roomId) return;
      markEnded();
    };
    wsClient.on("stream_ended", onEnd);
    return () => wsClient.off("stream_ended", onEnd);
  }, [enabled, markEnded, roomId]);

  return {
    phase,
    error,
    creds,
    sessionRef,
    attachRemote,
    leave,
    markEnded,
  };
}
