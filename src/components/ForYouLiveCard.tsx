import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Radio } from "lucide-react";
import { Track, type RemoteTrack, type Room } from "livekit-client";
import type { LiveStreamCard } from "@shared/contracts";
import { apiLiveStatus, apiLiveToken } from "@/features/feed/feedApi";
import {
  FOR_YOU_COHOST_STAGE_TOP,
  LIVE_COHOST_STAGE_HEIGHT,
} from "@/features/live/cohost/cohostStageGeometry";
import { LiveKitSession } from "@/lib/livekitSession";
import { formatCompactNumber } from "@/lib/formatCompactNumber";
import { INLINE_LIVE_PLACEHOLDER_AVATAR_PX } from "@/lib/profileFrame";
import { wsClient } from "@/lib/wsClient";
import { useAuthStore } from "@/store/useAuthStore";

type PreviewMode = "normal" | "battle" | "cohost";

type CohostTile = {
  userId: string;
  name: string;
  avatar: string;
  status: string;
};

/** Strip spectator `__v_` suffix so host/co-host publisher ids compare cleanly. */
function appUserIdFromIdentity(identity: string | null | undefined): string {
  const i = (identity || "").trim();
  const m = i.match(/^(.*)__v_[a-f0-9]{12}$/i);
  return (m?.[1] || i).trim();
}

function sameId(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = appUserIdFromIdentity(a).toLowerCase();
  const nb = appUserIdFromIdentity(b).toLowerCase();
  return !!na && !!nb && na === nb;
}

function hasAnyVideo(room: Room): boolean {
  for (const [, p] of room.remoteParticipants) {
    for (const [, pub] of p.videoTrackPublications) {
      if (pub.track && pub.isSubscribed) return true;
    }
  }
  return false;
}

const VIDEO_CLASS = "absolute inset-0 w-full h-full object-cover pointer-events-none";

/**
 * For You live slide: mirrors normal / co-host / battle layouts in real time
 * (LiveKit + room WS). Tap joins `/watch/:roomId` for full chat/scores.
 */
export function ForYouLiveCard({
  stream,
  isActive,
}: {
  stream: LiveStreamCard;
  isActive: boolean;
}) {
  const navigate = useNavigate();
  const streamKey = stream.roomId;
  const hostUserIdProp = stream.hostId;
  const creatorName = stream.displayName || stream.username || "Creator";
  const creatorAvatar = stream.avatarUrl || "";
  const viewerCount = stream.viewerCount;

  const hostVideoRef = useRef<HTMLVideoElement>(null);
  const opponentVideoRef = useRef<HTMLVideoElement>(null);
  const coHostVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const roomRef = useRef<Room | null>(null);
  const sessionRef = useRef<LiveKitSession | null>(null);
  const connectedKeyRef = useRef<string>("");
  const connectGenerationRef = useRef(0);
  const wsOwnerIdRef = useRef(
    `inline-live-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
  );
  const modeRef = useRef<PreviewMode>("normal");
  const initialHostId = String(hostUserIdProp || streamKey || "").trim() || streamKey;
  const hostIdRef = useRef<string>(initialHostId);
  const opponentIdRef = useRef<string>("");
  const routeVideoTrackRef = useRef<(track: RemoteTrack, identity: string) => void>(() => {});
  const reattachAllRef = useRef<(room: Room) => void>(() => {});
  const attachCleanupRef = useRef<(() => void) | null>(null);

  const [hasStream, setHasStream] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [mode, setMode] = useState<PreviewMode>("normal");
  const [hostUserId, setHostUserId] = useState(initialHostId);
  const [coHosts, setCoHosts] = useState<CohostTile[]>([]);
  const [battle, setBattle] = useState<{
    opponentName: string;
    hostScore: number;
    opponentScore: number;
    timeLeft: number;
    status: string;
  } | null>(null);

  modeRef.current = mode;
  hostIdRef.current = hostUserId || hostUserIdProp || streamKey;

  useEffect(() => {
    const hid = String(hostUserIdProp || streamKey || "").trim();
    if (!hid) return;
    setHostUserId((prev) => (sameId(prev, hid) ? prev : hid));
    hostIdRef.current = hid;
  }, [hostUserIdProp, streamKey]);

  const findCoHostEl = useCallback((identity: string): HTMLVideoElement | null => {
    const appId = appUserIdFromIdentity(identity);
    const direct = coHostVideoRefs.current.get(identity) || coHostVideoRefs.current.get(appId);
    if (direct) return direct;
    for (const [uid, el] of coHostVideoRefs.current) {
      if (sameId(uid, identity) || sameId(uid, appId)) return el;
    }
    return null;
  }, []);

  const attachToEl = useCallback((track: RemoteTrack, el: HTMLVideoElement | null) => {
    if (!el || track.kind !== Track.Kind.Video) return;
    attachCleanupRef.current?.();
    track.attach(el);
    el.muted = true;
    el.playsInline = true;
    void el.play().catch(() => undefined);
    setHasStream(true);
    const showIfFramed = () => {
      if (el.videoWidth > 0) el.style.visibility = "visible";
    };
    showIfFramed();
    el.addEventListener("playing", showIfFramed, { once: true });
    el.addEventListener("loadeddata", showIfFramed, { once: true });
    el.addEventListener("resize", showIfFramed);
    const revealTimer = window.setTimeout(() => {
      if (el.srcObject) el.style.visibility = "visible";
    }, 700);
    attachCleanupRef.current = () => {
      window.clearTimeout(revealTimer);
      el.removeEventListener("playing", showIfFramed);
      el.removeEventListener("loadeddata", showIfFramed);
      el.removeEventListener("resize", showIfFramed);
    };
  }, []);

  const ensureCohostTile = useCallback((identity: string, name?: string) => {
    const appId = appUserIdFromIdentity(identity);
    if (!appId) return appId;
    setCoHosts((prev) => {
      if (prev.some((h) => sameId(h.userId, appId))) return prev;
      return [
        ...prev,
        {
          userId: appId,
          name: (name || appId).trim() || "User",
          avatar: "",
          status: "live",
        },
      ];
    });
    return appId;
  }, []);

  const enterCohostMode = useCallback(() => {
    if (modeRef.current === "battle") return;
    if (modeRef.current === "cohost") return;
    setMode("cohost");
    modeRef.current = "cohost";
  }, []);

  const routeVideoTrack = useCallback(
    (track: RemoteTrack, identity: string) => {
      if (track.kind !== Track.Kind.Video || !identity) return;
      const m = modeRef.current;
      const hostId = hostIdRef.current || hostUserIdProp || streamKey;
      const appId = appUserIdFromIdentity(identity);
      const isHost =
        sameId(appId, hostId) ||
        sameId(identity, hostId) ||
        sameId(appId, streamKey) ||
        sameId(identity, streamKey);

      if (isHost) {
        attachToEl(track, hostVideoRef.current);
        return;
      }

      if (m === "battle") {
        if (sameId(identity, opponentIdRef.current) || !opponentIdRef.current) {
          if (!opponentIdRef.current) opponentIdRef.current = identity;
          attachToEl(track, opponentVideoRef.current);
          return;
        }
      }

      enterCohostMode();
      ensureCohostTile(identity);
      const tile = findCoHostEl(identity);
      if (tile) attachToEl(track, tile);
    },
    [attachToEl, findCoHostEl, streamKey, hostUserIdProp, enterCohostMode, ensureCohostTile],
  );

  const reattachAll = useCallback(
    (room: Room) => {
      for (const [, p] of room.remoteParticipants) {
        const identity = p.identity || "";
        for (const [, pub] of p.videoTrackPublications) {
          if (pub.track && pub.isSubscribed) {
            routeVideoTrack(pub.track as RemoteTrack, identity);
          }
        }
      }
    },
    [routeVideoTrack],
  );

  routeVideoTrackRef.current = routeVideoTrack;
  reattachAllRef.current = reattachAll;

  const syncCohostTilesFromRoom = useCallback(
    (room: Room) => {
      if (modeRef.current === "battle") return;
      const hostId = hostIdRef.current || hostUserIdProp || streamKey;
      const tiles: CohostTile[] = [];
      for (const [, p] of room.remoteParticipants) {
        const identity = p.identity || "";
        if (!identity) continue;
        if (sameId(identity, hostId) || sameId(identity, streamKey)) continue;
        let liveVideo = false;
        for (const [, pub] of p.videoTrackPublications) {
          if (pub.track && pub.isSubscribed) {
            liveVideo = true;
            break;
          }
        }
        if (!liveVideo) continue;
        const appId = appUserIdFromIdentity(identity);
        tiles.push({
          userId: appId,
          name: (p.name || appId).trim() || "User",
          avatar: "",
          status: "live",
        });
      }
      if (tiles.length === 0) {
        if (modeRef.current === "cohost") {
          setCoHosts([]);
          setMode("normal");
          modeRef.current = "normal";
        }
        return;
      }
      setCoHosts((prev) => {
        const byId = new Map(prev.map((h) => [appUserIdFromIdentity(h.userId).toLowerCase(), h]));
        return tiles.map((t) => {
          const prevTile = byId.get(appUserIdFromIdentity(t.userId).toLowerCase());
          return prevTile
            ? { ...t, name: prevTile.name || t.name, avatar: prevTile.avatar || t.avatar }
            : t;
        });
      });
      setMode("cohost");
      modeRef.current = "cohost";
    },
    [streamKey, hostUserIdProp],
  );
  const syncCohostTilesFromRoomRef = useRef(syncCohostTilesFromRoom);
  syncCohostTilesFromRoomRef.current = syncCohostTilesFromRoom;

  useEffect(() => {
    if (!isActive || !streamKey) {
      void sessionRef.current?.disconnect();
      sessionRef.current = null;
      roomRef.current = null;
      connectedKeyRef.current = "";
      wsClient.disconnect(wsOwnerIdRef.current);
      setHasStream(false);
      setConnecting(false);
      setMode("normal");
      setCoHosts([]);
      setBattle(null);
      return;
    }

    const connKey = `${streamKey}-active`;
    if (connectedKeyRef.current === connKey && sessionRef.current?.connected) return;
    connectedKeyRef.current = connKey;
    const attemptId = ++connectGenerationRef.current;

    let mounted = true;
    let gotVideo = false;
    let attemptSession: LiveKitSession | null = null;
    let disposed = false;

    const isCurrentAttempt = () =>
      mounted &&
      isActive &&
      connectGenerationRef.current === attemptId &&
      connectedKeyRef.current === connKey;

    const disposeAttempt = () => {
      if (disposed) return;
      disposed = true;
      if (connectGenerationRef.current === attemptId) {
        connectGenerationRef.current += 1;
      }
      attachCleanupRef.current?.();
      attachCleanupRef.current = null;
      for (const el of [hostVideoRef.current, opponentVideoRef.current]) {
        if (el) {
          try {
            el.srcObject = null;
          } catch {
            /* ignore */
          }
        }
      }
      void attemptSession?.disconnect();
      if (sessionRef.current === attemptSession) {
        sessionRef.current = null;
      }
      attemptSession = null;
      if (roomRef.current && !isCurrentAttempt()) {
        roomRef.current = null;
      }
      wsClient.disconnect(wsOwnerIdRef.current);
    };

    let connectDeadlineId: ReturnType<typeof setTimeout> | null = null;
    const armConnectDeadline = () => {
      if (connectDeadlineId) clearTimeout(connectDeadlineId);
      connectDeadlineId = setTimeout(() => {
        if (!isCurrentAttempt() || gotVideo) return;
        if (mounted && connectGenerationRef.current === attemptId) {
          setConnecting(false);
        }
      }, 10000);
    };
    armConnectDeadline();

    const onStreamEnded = (raw: unknown) => {
      if (!isCurrentAttempt()) return;
      const data = (raw ?? {}) as Record<string, unknown>;
      const endedKey = String(data.stream_key ?? data.room_id ?? data.roomId ?? "").trim();
      if (endedKey && endedKey !== streamKey) return;
      setIsOffline(true);
      setHasStream(false);
      disposeAttempt();
    };

    const onCohostLayout = (raw: unknown) => {
      if (!isCurrentAttempt()) return;
      const data = (raw ?? {}) as Record<string, unknown>;
      const list = Array.isArray(data.coHosts) ? data.coHosts : [];
      const tiles: CohostTile[] = list
        .map((h: Record<string, unknown>) => ({
          userId: String(h.userId ?? h.id ?? ""),
          name: String(h.name ?? "User"),
          avatar: String(h.avatar ?? ""),
          status: String(h.status ?? "invited"),
        }))
        .filter((h) => h.userId);
      const hid =
        typeof data.hostUserId === "string" && data.hostUserId
          ? data.hostUserId
          : hostUserIdProp || streamKey;
      setHostUserId(hid);
      hostIdRef.current = hid;
      const live = tiles.filter(
        (h) => !sameId(h.userId, hid) && (h.status === "live" || h.status === "accepted"),
      );
      setCoHosts(live);
      if (modeRef.current !== "battle") {
        const next: PreviewMode = live.length > 0 ? "cohost" : "normal";
        setMode(next);
        modeRef.current = next;
      }
      if (roomRef.current) reattachAllRef.current(roomRef.current);
    };

    const applyBattlePayload = (raw: unknown, fromTick: boolean) => {
      if (!isCurrentAttempt()) return;
      const data = (raw ?? {}) as Record<string, unknown>;
      const status = String(data.status || "");
      if (status === "ENDED") {
        setBattle(null);
        opponentIdRef.current = "";
        if (modeRef.current === "battle") {
          setMode("normal");
          modeRef.current = "normal";
        }
        return;
      }
      if (!(status === "ACTIVE" || status === "WAITING" || fromTick)) return;
      const oppId = String(data.opponentUserId || "");
      opponentIdRef.current = oppId;
      setMode("battle");
      modeRef.current = "battle";
      setBattle({
        opponentName: String(data.opponentName || "Opponent"),
        hostScore: Number(data.hostScore) || 0,
        opponentScore: Number(data.opponentScore) || 0,
        timeLeft: Number(data.timeLeft) || 0,
        status: status || "ACTIVE",
      });
      if (typeof data.hostUserId === "string" && data.hostUserId) {
        setHostUserId(data.hostUserId);
        hostIdRef.current = data.hostUserId;
      }
      if (roomRef.current) reattachAllRef.current(roomRef.current);
    };

    const onBattleStateSync = (raw: unknown) => applyBattlePayload(raw, false);
    const onBattleTick = (raw: unknown) => applyBattlePayload(raw, true);
    wsClient.on("stream_ended", onStreamEnded);
    wsClient.on("cohost_layout_sync", onCohostLayout);
    wsClient.on("battle_state_sync", onBattleStateSync);
    wsClient.on("battle_tick", onBattleTick);

    const clearWs = () => {
      wsClient.off("stream_ended", onStreamEnded);
      wsClient.off("cohost_layout_sync", onCohostLayout);
      wsClient.off("battle_state_sync", onBattleStateSync);
      wsClient.off("battle_tick", onBattleTick);
    };

    void (async () => {
      if (isCurrentAttempt()) {
        setConnecting(true);
        setIsOffline(false);
        setHasStream(false);
        setMode("normal");
        setCoHosts([]);
        setBattle(null);
        opponentIdRef.current = "";
        const hid = String(hostUserIdProp || streamKey || "").trim() || streamKey;
        hostIdRef.current = hid;
        setHostUserId(hid);
      }
      try {
        const tok = await apiLiveToken(streamKey, "spectator");
        if (!isCurrentAttempt()) return;
        if (tok.error || !tok.token) {
          if (mounted && connectGenerationRef.current === attemptId) {
            const { status: liveStatus, error: statusErr } = await apiLiveStatus(streamKey);
            if (!isCurrentAttempt()) return;
            if (!statusErr && liveStatus && !liveStatus.active) {
              setIsOffline(true);
            } else {
              setIsOffline(false);
            }
            setConnecting(false);
          }
          return;
        }

        const url = tok.token.url.trim();
        const lkToken = tok.token.token;
        if (!url || !lkToken || !isCurrentAttempt()) {
          if (mounted && connectGenerationRef.current === attemptId) {
            setIsOffline(false);
            setConnecting(false);
          }
          return;
        }

        const session = new LiveKitSession({
          onTrackSubscribed: ({ track, participant }) => {
            if (!isCurrentAttempt()) return;
            if (!mounted || track.kind !== Track.Kind.Video) return;
            gotVideo = true;
            const room = session.raw;
            if (room) syncCohostTilesFromRoomRef.current(room);
            routeVideoTrackRef.current(track, participant?.identity || "");
            setHasStream(true);
            setConnecting(false);
          },
          onParticipantConnected: () => {
            if (!isCurrentAttempt() || !mounted) return;
            const room = session.raw;
            if (room) syncCohostTilesFromRoomRef.current(room);
          },
          onParticipantDisconnected: (participant) => {
            if (!isCurrentAttempt() || !mounted) return;
            const identity = participant?.identity || "";
            const hostId = hostIdRef.current || hostUserIdProp || streamKey;
            if (!sameId(identity, streamKey) && !sameId(identity, hostId)) {
              const room = session.raw;
              if (room) {
                syncCohostTilesFromRoomRef.current(room);
                let stillCohost = false;
                for (const [, p] of room.remoteParticipants) {
                  const id = p.identity || "";
                  if (!id) continue;
                  if (sameId(id, hostId) || sameId(id, streamKey)) continue;
                  for (const [, pub] of p.videoTrackPublications) {
                    if (pub.track && pub.isSubscribed) {
                      stillCohost = true;
                      break;
                    }
                  }
                  if (stillCohost) break;
                }
                if (!stillCohost && modeRef.current === "cohost") {
                  setCoHosts([]);
                  setMode("normal");
                  modeRef.current = "normal";
                  reattachAllRef.current(room);
                }
              }
              return;
            }
            gotVideo = false;
            setHasStream(false);
            setConnecting(true);
            armConnectDeadline();
          },
          onDisconnected: () => {
            if (!isCurrentAttempt()) return;
            setIsOffline(false);
            setHasStream(false);
            setConnecting(false);
          },
        });
        attemptSession = session;
        sessionRef.current = session;
        await session.connect(url, lkToken);
        if (!isCurrentAttempt()) {
          void session.disconnect();
          return;
        }
        roomRef.current = session.raw;

        const authToken = useAuthStore.getState().session?.token;
        if (authToken && isCurrentAttempt()) {
          wsClient.connect(streamKey, authToken, {
            ownerId: wsOwnerIdRef.current,
          });
        }

        if (session.raw && isCurrentAttempt()) {
          syncCohostTilesFromRoomRef.current(session.raw);
          reattachAllRef.current(session.raw);
        }
        if (isCurrentAttempt() && (gotVideo || (session.raw && hasAnyVideo(session.raw)))) {
          gotVideo = true;
          setHasStream(true);
        }
      } catch {
        if (isCurrentAttempt()) {
          setHasStream(false);
          setIsOffline(true);
          disposeAttempt();
        }
      } finally {
        if (isCurrentAttempt()) setConnecting(false);
      }
    })();

    return () => {
      mounted = false;
      if (connectDeadlineId) clearTimeout(connectDeadlineId);
      connectedKeyRef.current = "";
      clearWs();
      disposeAttempt();
      setHasStream(false);
      setConnecting(false);
    };
  }, [isActive, streamKey, hostUserIdProp]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !isActive) return;
    reattachAll(room);
  }, [mode, coHosts, battle?.status, isActive, reattachAll]);

  const openWatch = useCallback(() => {
    if (!streamKey) return;
    navigate(`/watch/${encodeURIComponent(streamKey)}`);
  }, [navigate, streamKey]);

  const liveCohosts = coHosts.slice(0, 8);
  const displayAvatar = creatorAvatar || "";

  const placeholder = (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[rgba(0,0,0,0.35)] gap-4 pointer-events-none z-[1]">
      {displayAvatar ? (
        <div
          className="rounded-full overflow-hidden shrink-0"
          style={{ width: INLINE_LIVE_PLACEHOLDER_AVATAR_PX, height: INLINE_LIVE_PLACEHOLDER_AVATAR_PX }}
        >
          <img src={displayAvatar} alt="" className="w-full h-full object-cover object-center" />
        </div>
      ) : (
        <div
          className="rounded-full bg-white/10 shrink-0"
          style={{ width: INLINE_LIVE_PLACEHOLDER_AVATAR_PX, height: INLINE_LIVE_PLACEHOLDER_AVATAR_PX }}
        />
      )}
      <p className="text-white font-semibold text-base truncate max-w-[80%]">{creatorName}</p>
      {connecting && !isOffline ? (
        <>
          <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
          <span className="text-white/60 text-sm">Connecting to live...</span>
        </>
      ) : isOffline ? (
        <span className="text-white/50 text-sm">Stream ended</span>
      ) : null}
    </div>
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className="relative w-full h-full overflow-hidden text-left cursor-pointer"
      style={{ background: "#080A0E" }}
      onClick={openWatch}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openWatch();
        }
      }}
      aria-label={`Watch ${creatorName} live`}
      data-elix-watch-id={streamKey}
    >
      {mode === "normal" && (
        <div className="absolute inset-0">
          <video
            ref={hostVideoRef}
            className={VIDEO_CLASS}
            autoPlay
            playsInline
            muted
            controls={false}
            style={{ opacity: hasStream ? 1 : 0, transition: "opacity 0.35s ease", backgroundColor: "#080A0E" }}
          />
          {!hasStream && placeholder}
        </div>
      )}

      {mode === "battle" && (
        <div
          className="absolute inset-0 flex flex-col bg-[rgba(0,0,0,0.35)] overflow-hidden"
          data-elix-foryou-battle-root="1"
        >
          <div
            className="relative w-full overflow-hidden border-b border-[#2A2D33]"
            data-elix-foryou-battle="video-half"
            style={{ flex: "1 1 50%", height: "50%", maxHeight: "50%", minHeight: 0 }}
          >
            <div className="absolute inset-0 flex flex-row w-full h-full">
              <div className="w-1/2 h-full relative bg-[rgba(0,0,0,0.35)] overflow-hidden min-h-0">
                <video
                  ref={hostVideoRef}
                  className={VIDEO_CLASS}
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  style={{ backgroundColor: "#080A0E" }}
                />
                <span className="absolute bottom-1 left-1 z-10 text-white/80 text-[8px] font-bold bg-black/50 rounded px-1 truncate max-w-[90%]">
                  {creatorName}
                </span>
              </div>
              <div className="w-1/2 h-full relative bg-[rgba(0,0,0,0.35)] overflow-hidden min-h-0">
                <video
                  ref={opponentVideoRef}
                  className={VIDEO_CLASS}
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  style={{ backgroundColor: "#080A0E" }}
                />
                {!battle?.opponentName ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none z-[1]">
                    <span className="text-white/30 text-lg font-light">+</span>
                    <span className="text-white/40 text-[10px] font-semibold">Waiting</span>
                  </div>
                ) : (
                  <span className="absolute bottom-1 right-1 z-10 text-white/80 text-[8px] font-bold bg-black/50 rounded px-1 truncate max-w-[90%]">
                    {battle.opponentName}
                  </span>
                )}
              </div>
            </div>
            {!hasStream && placeholder}
          </div>

          <div
            className="relative w-full flex flex-col bg-[rgba(0,0,0,0.35)] overflow-hidden"
            data-elix-foryou-battle="chat-half"
            style={{ flex: "1 1 50%", height: "50%", maxHeight: "50%", minHeight: 0 }}
          >
            <div className="flex-1 min-h-0" style={{ visibility: "hidden" }} aria-hidden />
            <div className="flex-none px-3 pb-3 pt-1 pointer-events-none">
              <p className="text-white font-bold text-sm truncate mb-1.5">{creatorName}</p>
              <div className="flex items-center gap-2 mb-2">
                <Radio size={14} className="text-white/60" />
                <span className="text-white/70 text-xs font-semibold">Tap to join battle</span>
              </div>
              <div className="w-full rounded-full bg-white/5 border border-[#2A2D33] px-3 py-2 text-[11px] text-white/25">
                Say something…
              </div>
            </div>
          </div>
        </div>
      )}

      {mode === "cohost" && (
        <div className="absolute inset-0" style={{ background: "#080A0E" }}>
          <div
            className="absolute left-0 right-0 z-0 bg-transparent overflow-hidden rounded-none"
            data-elix-foryou-cohost-stage="1"
            style={{
              top: FOR_YOU_COHOST_STAGE_TOP,
              height: LIVE_COHOST_STAGE_HEIGHT,
            }}
          >
            <div className="relative flex w-full h-full min-h-0 flex-row overflow-hidden gap-[2px]">
              <div className="w-1/2 h-full relative elix-cohost-pill bg-white/5 overflow-hidden min-w-0">
                <video
                  ref={hostVideoRef}
                  className={VIDEO_CLASS}
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  style={{ opacity: hasStream ? 1 : 0, backgroundColor: "#080A0E" }}
                />
                {!hasStream && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[rgba(0,0,0,0.35)] z-[1]">
                    {displayAvatar ? (
                      <img src={displayAvatar} alt="" className="w-16 h-16 rounded-full object-cover" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-white/10" />
                    )}
                    <span className="text-white font-bold text-xs">{creatorName}</span>
                  </div>
                )}
                <span className="absolute bottom-1 left-1 z-10 text-white/80 text-[8px] font-bold bg-black/50 rounded px-1 truncate max-w-[90%]">
                  {creatorName}
                </span>
              </div>
              <div className="w-1/2 h-full grid grid-cols-2 grid-rows-4 gap-[2px] p-0 bg-transparent min-w-0">
                {Array.from({ length: 8 }).map((_, i) => {
                  const h = liveCohosts[i];
                  if (!h) {
                    return (
                      <div
                        key={`empty-${i}`}
                        className="relative elix-cohost-pill min-h-0 overflow-hidden bg-white/5 flex flex-col items-center justify-center"
                      >
                        <span className="text-white/30 text-lg font-light">+</span>
                        <span className="text-white/30 text-[8px] font-semibold">Add</span>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={h.userId}
                      className="relative elix-cohost-pill min-h-0 overflow-hidden bg-white/5"
                    >
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 z-[1] bg-transparent">
                        {h.avatar ? (
                          <img src={h.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[rgba(0,0,0,0.35)] border border-[#D8D9DD]/40" />
                        )}
                      </div>
                      <video
                        ref={(el) => {
                          if (el) {
                            const appId = appUserIdFromIdentity(h.userId);
                            coHostVideoRefs.current.set(h.userId, el);
                            if (appId && appId !== h.userId) {
                              coHostVideoRefs.current.set(appId, el);
                            }
                            const room = roomRef.current;
                            if (room) {
                              for (const [, p] of room.remoteParticipants) {
                                if (!sameId(p.identity, h.userId)) continue;
                                for (const [, pub] of p.videoTrackPublications) {
                                  if (pub.track && pub.isSubscribed) {
                                    attachToEl(pub.track as RemoteTrack, el);
                                  }
                                }
                              }
                            }
                          } else {
                            coHostVideoRefs.current.delete(h.userId);
                            const appId = appUserIdFromIdentity(h.userId);
                            if (appId) coHostVideoRefs.current.delete(appId);
                          }
                        }}
                        className={`absolute inset-0 w-full h-full object-cover z-[2]`}
                        autoPlay
                        playsInline
                        muted
                        controls={false}
                        style={{ backgroundColor: "#080A0E" }}
                      />
                      <span className="absolute bottom-0.5 left-0.5 z-[3] text-white/80 text-[7px] font-bold bg-black/50 rounded px-0.5 truncate max-w-[95%]">
                        {h.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {!isOffline && (
        <div
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 pointer-events-none"
          style={{ paddingTop: "calc(var(--safe-top) + 8px)" }}
        >
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#E53935]">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-white text-[10px] font-bold">LIVE</span>
            </div>
            {mode === "battle" && (
              <div className="px-2 py-1 rounded-md bg-black/50 text-[#FF6B6B] text-[10px] font-bold">
                BATTLE
              </div>
            )}
            {mode === "cohost" && (
              <div className="px-2 py-1 rounded-md bg-black/50 text-[#F5F5F7] text-[10px] font-bold">
                CO-HOST
              </div>
            )}
            <div className="px-2 py-1 rounded-md bg-black/50 text-white/90 text-[10px] font-semibold">
              {formatCompactNumber(viewerCount)} watching
            </div>
          </div>
        </div>
      )}

      {!isOffline && mode !== "battle" && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-3 pb-safe bg-gradient-to-t from-black/80 to-transparent pt-12 pointer-events-none">
          <p className="text-white font-bold text-sm truncate mb-1">{creatorName}</p>
          <div className="flex items-center gap-2">
            <Radio size={14} className="text-white/60" />
            <span className="text-white/70 text-xs font-semibold">
              {mode === "cohost" ? "Tap to join co-host live" : "Tap to join live"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
