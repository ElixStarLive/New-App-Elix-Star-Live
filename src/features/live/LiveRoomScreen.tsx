import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Gift,
  Heart,
  Mic,
  MicOff,
  Swords,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import type { RemoteParticipant, RemoteTrack } from "livekit-client";
import { Track } from "livekit-client";
import type { BattleState, CohostSeat, GiftCatalogItem, GiftGoal } from "@shared/contracts";
import { battleStateSchema, cohostLayoutSchema, giftGoalSchema } from "@shared/contracts";
import { LiveKitSession } from "@/lib/livekitSession";
import { wsClient } from "@/lib/wsClient";
import { getSessionToken } from "@/lib/sessionToken";
import { useAuthStore } from "@/store/useAuthStore";
import { useWalletStore } from "@/store/useWalletStore";
import { apiFollow, apiLiveEnd, apiLiveStart, apiLiveToken } from "@/features/feed/feedApi";
import { apiGiftCatalog, apiSendGift } from "@/features/gifts/giftApi";
import { LiveHostProfileHeader } from "@/components/LiveMarkedTopUi";
import { GiftOverlay } from "@/components/GiftOverlay";
import GiftAnimationOverlay, { pushLocalGiftPill } from "@/components/GiftAnimationOverlay";
import { LiveGiftFeedStack } from "@/components/LiveGiftFeedStack";
import { AvatarRing } from "@/components/AvatarRing";
import {
  BATTLE_MVP_CIRCLE_GAP_CLASS,
  BATTLE_MVP_SLOTS_PER_SIDE,
  LIVE_BATTLE_CHAT_HEIGHT,
  LIVE_BATTLE_STAGE_BOTTOM,
  LIVE_BATTLE_VIDEO_HEIGHT,
  LIVE_BOTTOM_ACTION_PADDING,
  LIVE_MVP_PROFILE_RING_PX,
  LIVE_SOLO_CHAT_TOP_FROM_BOTTOM,
} from "@/lib/profileFrame";
import { COHOST_SEAT_COUNT } from "@/features/live/cohostLayout";
import { isRecord } from "@/lib/isRecord";
import { showToast } from "@/lib/toast";

type ChatRow = { id: string; displayName: string; body: string };

type RoomMode = "solo" | "cohost" | "battle";

function emptySeats(): Array<CohostSeat | null> {
  return Array.from({ length: COHOST_SEAT_COUNT }, () => null);
}

function emptyBattle(): BattleState {
  return {
    streamId: "",
    type: "1x1",
    status: "WAITING",
    seats: { host: null, opponent: null, player3: null, player4: null },
    teamAScore: 0,
    teamBScore: 0,
    startedAt: null,
    endsAt: null,
    remainingMs: 0,
  };
}

function VideoTile({
  attach,
  label,
  className,
}: {
  attach: (el: HTMLVideoElement | null) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden bg-black ${className ?? ""}`}>
      <video
        ref={attach}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        playsInline
        muted
      />
      {label ? (
        <span className="absolute bottom-1 left-1 text-[9px] text-white font-semibold drop-shadow">{label}</span>
      ) : null}
    </div>
  );
}

export function LiveRoomScreen({
  streamId: streamIdProp,
  role,
}: {
  streamId: string;
  role: "host" | "spectator";
}) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const paidCoins = useWalletStore((s) => s.paidCoins);
  const promoCoins = useWalletStore((s) => s.promoCoins);
  const testCoins = useWalletStore((s) => s.testCoins);
  const fetchWallet = useWalletStore((s) => s.fetchWallet);

  const [streamId, setStreamId] = useState(streamIdProp);
  const [roomId, setRoomId] = useState(streamIdProp);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  const [chat, setChat] = useState<ChatRow[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<RoomMode>("solo");
  const [seats, setSeats] = useState<Array<CohostSeat | null>>(emptySeats);
  const [battle, setBattle] = useState<BattleState>(emptyBattle);
  const [gifts, setGifts] = useState<GiftCatalogItem[]>([]);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftVideo, setGiftVideo] = useState<string | null>(null);
  const [giftGoal, setGiftGoal] = useState<GiftGoal | null>(null);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [following, setFollowing] = useState(false);
  const [joinSent, setJoinSent] = useState(false);
  const [hostName, setHostName] = useState(user?.displayName || "LIVE");
  const [hostAvatar, setHostAvatar] = useState<string | null>(user?.avatarUrl ?? null);
  const [hostId, setHostId] = useState(user?.id ?? "");
  const [mvpHost] = useState<Array<{ id: string; name: string; avatar: string | null }>>([]);
  const [mvpOpp] = useState<Array<{ id: string; name: string; avatar: string | null }>>([]);

  const sessionRef = useRef<LiveKitSession | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteEls = useRef<Map<string, HTMLVideoElement>>(new Map());
  const tracks = useRef<Map<string, RemoteTrack>>(new Map());
  const cohostPublished = useRef(false);

  const attachRemote = useCallback((identity: string) => (el: HTMLVideoElement | null) => {
    if (!el) {
      remoteEls.current.delete(identity);
      return;
    }
    remoteEls.current.set(identity, el);
    const track = tracks.current.get(identity);
    if (track) track.attach(el);
  }, []);

  const attachLocal = useCallback((el: HTMLVideoElement | null) => {
    localVideoRef.current = el;
    if (el) sessionRef.current?.attachLocalVideo(el);
  }, []);

  const connectRoom = useCallback(async () => {
    const token = getSessionToken();
    if (!token) {
      setError("Sign in required");
      setConnecting(false);
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      let nextStreamId = streamIdProp;
      let nextRoomId = streamIdProp;
      let livekitUrl = "";
      let livekitToken = "";
      if (role === "host" && (streamIdProp === "broadcast" || streamIdProp === user?.id)) {
        const started = await apiLiveStart("LIVE");
        if (!started.session) throw new Error(started.error || "Could not start live");
        nextStreamId = started.session.streamId;
        nextRoomId = started.session.roomId;
        livekitUrl = started.session.livekitUrl;
        livekitToken = started.session.livekitToken;
        setHostId(user?.id ?? "");
        setHostName(user?.displayName || user?.username || "LIVE");
        setHostAvatar(user?.avatarUrl ?? null);
      } else {
        const tok = await apiLiveToken(streamIdProp, role === "host" ? "host" : "spectator");
        if (!tok.token) throw new Error(tok.error || "Could not join live");
        nextRoomId = tok.token.roomId;
        livekitUrl = tok.token.url;
        livekitToken = tok.token.token;
        nextStreamId = tok.token.streamId;
        setHostId(tok.token.hostId);
        setHostName(tok.token.displayName || tok.token.username);
        setHostAvatar(tok.token.avatarUrl);
        if (!tok.token.canPublish && role === "host") {
          throw new Error("This live is not authorized to publish.");
        }
      }
      setStreamId(nextStreamId);
      setRoomId(nextRoomId);
      const session = new LiveKitSession({
        onTrackSubscribed: ({ track, participant }) => {
          if (track.kind !== Track.Kind.Video) return;
          tracks.current.set(participant.identity, track);
          const el = remoteEls.current.get(participant.identity);
          if (el) track.attach(el);
        },
        onTrackUnsubscribed: ({ participant }) => {
          tracks.current.delete(participant.identity);
        },
        onParticipantDisconnected: (p: RemoteParticipant) => {
          tracks.current.delete(p.identity);
        },
      });
      sessionRef.current = session;
      await session.connect(livekitUrl, livekitToken);
      if (role === "host") {
        await session.publishCamera({ audio: true, video: true });
        if (localVideoRef.current) session.attachLocalVideo(localVideoRef.current);
      }
      wsClient.connect(nextRoomId, token, { persistent: role === "host", ownerId: `live-${role}` });
      const catalog = await apiGiftCatalog();
      if (catalog.error) showToast(catalog.error);
      else setGifts(catalog.gifts);
      await fetchWallet();
      setConnecting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Live connection failed");
      setConnecting(false);
    }
  }, [fetchWallet, role, streamIdProp, user]);

  useEffect(() => {
    void connectRoom();
    return () => {
      void sessionRef.current?.disconnect();
      sessionRef.current = null;
      wsClient.disconnect(`live-${role}`);
    };
  }, [connectRoom, role]);

  useEffect(() => {
    if (role === "host" || cohostPublished.current || !user?.id || !roomId) return;
    const seated = seats.some((seat) => seat?.userId === user.id);
    if (!seated) return;
    cohostPublished.current = true;
    void (async () => {
      const tok = await apiLiveToken(roomId, "cohost");
      if (!tok.token) {
        cohostPublished.current = false;
        showToast(tok.error || "Could not publish as co-host");
        return;
      }
      const session = sessionRef.current;
      if (!session) {
        cohostPublished.current = false;
        return;
      }
      await session.connect(tok.token.url, tok.token.token);
      await session.publishCamera({ audio: true, video: true });
      if (localVideoRef.current) session.attachLocalVideo(localVideoRef.current);
    })();
  }, [role, roomId, seats, user?.id]);

  useEffect(() => {
    const onChat = (data: unknown) => {
      if (!isRecord(data) || typeof data.body !== "string") return;
      const body = data.body;
      const displayName = typeof data.displayName === "string" ? data.displayName : "User";
      setChat((prev) => [
        ...prev.slice(-80),
        {
          id: `${Date.now()}-${prev.length}`,
          displayName,
          body,
        },
      ]);
    };
    const onViewers = (data: unknown) => {
      if (isRecord(data) && typeof data.count === "number") setViewerCount(data.count);
    };
    const onCohost = (data: unknown) => {
      const parsed = cohostLayoutSchema.safeParse(data);
      if (!parsed.success) return;
      const next = emptySeats();
      for (const seat of parsed.data.seats) next[seat.seatIndex] = seat;
      setSeats(next);
      setMode("cohost");
    };
    const onBattle = (data: unknown) => {
      const parsed = battleStateSchema.safeParse(data);
      if (!parsed.success) return;
      if (parsed.data.status === "ENDED") {
        setBattle(emptyBattle());
        setMode("solo");
        return;
      }
      setBattle(parsed.data);
      setMode("battle");
    };
    const onCohostRequest = (data: unknown) => {
      if (isRecord(data) && typeof data.displayName === "string") {
        showToast(`${data.displayName} requested to join`);
      }
    };
    const onEnd = () => {
      showToast("Live ended");
      navigate("/feed", { replace: true });
    };
    const onGift = (data: unknown) => {
      if (!isRecord(data)) return;
      const url = typeof data.animationUrl === "string" ? data.animationUrl : null;
      if (url) setGiftVideo(url);
    };
    const onGoal = (data: unknown) => {
      if (data == null) {
        setGiftGoal(null);
        return;
      }
      const parsed = giftGoalSchema.safeParse(data);
      if (parsed.success) setGiftGoal(parsed.data);
    };
    wsClient.on("chat_message", onChat);
    wsClient.on("viewer_count", onViewers);
    wsClient.on("cohost_layout_sync", onCohost);
    wsClient.on("cohost_request", onCohostRequest);
    wsClient.on("battle_state_sync", onBattle);
    wsClient.on("battle_tick", onBattle);
    wsClient.on("stream_ended", onEnd);
    wsClient.on("gift_sent", onGift);
    wsClient.on("gift_goal_sync", onGoal);
    return () => {
      wsClient.off("chat_message", onChat);
      wsClient.off("viewer_count", onViewers);
      wsClient.off("cohost_layout_sync", onCohost);
      wsClient.off("cohost_request", onCohostRequest);
      wsClient.off("battle_state_sync", onBattle);
      wsClient.off("battle_tick", onBattle);
      wsClient.off("stream_ended", onEnd);
      wsClient.off("gift_sent", onGift);
      wsClient.off("gift_goal_sync", onGoal);
    };
  }, [navigate]);

  const sendChat = () => {
    const body = draft.trim();
    if (!body) return;
    wsClient.send("chat_message", { streamId, body });
    setDraft("");
  };

  const sendHeart = () => {
    wsClient.send("heart_sent", { streamId });
  };

  const sendGift = async (gift: GiftCatalogItem, bucket: "paid" | "promo" | "test") => {
    if (!hostId) {
      showToast("Host is not ready");
      return;
    }
    if (bucket === "test" && testCoins < gift.coinCost) {
      showToast("Not enough test coins");
      return;
    }
    if (bucket === "promo" && promoCoins < gift.coinCost) {
      showToast("Not enough promo coins");
      return;
    }
    if (bucket === "paid" && paidCoins < gift.coinCost) {
      showToast("Not enough coins");
      return;
    }
    const result = await apiSendGift({
      giftId: gift.id,
      recipientId: hostId,
      streamId,
      idempotencyKey: crypto.randomUUID(),
      bucket,
    });
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    await fetchWallet();
    pushLocalGiftPill({
      username: user?.displayName,
      giftName: gift.name,
      giftIcon: gift.animationUrl ?? undefined,
      streamId,
      creatorName: hostName,
    });
    if (gift.animationUrl) setGiftVideo(gift.animationUrl);
    setGiftOpen(false);
  };

  const closeLive = async () => {
    if (role === "host") {
      const ended = await apiLiveEnd(streamId);
      if (!ended.ok) showToast(ended.error);
    }
    navigate("/feed", { replace: true });
  };

  const isBattle = mode === "battle" && battle.status !== "ENDED";
  const isCohost = mode === "cohost";
  const remaining = Math.max(0, Math.ceil(battle.remainingMs / 1000));

  const battleTiles = useMemo(() => {
    if (battle.type === "2x2") return ["host", "opponent", "player3", "player4"] as const;
    return ["host", "opponent"] as const;
  }, [battle.type]);

  if (error) {
    return (
      <div className="elix-live-room min-h-[100dvh] flex flex-col items-center justify-center text-white px-6">
        <p className="text-sm text-rose-300 mb-4">{error}</p>
        <button type="button" onClick={() => navigate("/feed", { replace: true })} className="border border-[#D8D9DD]/40 rounded-xl px-4 py-2">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="elix-live-room relative h-[100dvh] overflow-hidden text-white">
      {connecting ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#080A0E]">
          <div className="w-10 h-10 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
        </div>
      ) : null}

      <div className="absolute left-2 z-30" style={{ top: "calc(var(--safe-top) + 8px)" }}>
        <LiveHostProfileHeader
          name={hostName}
          avatar={hostAvatar}
          likes={viewerCount}
          showFollow={role === "spectator"}
          isFollowing={following}
          joinSent={joinSent}
          onAvatarClick={() => navigate(`/profile/${hostId}`)}
          onFollow={(e) => {
            e.stopPropagation();
            if (!hostId) return;
            void apiFollow(hostId).then((r) => {
              if (!r.ok) showToast(r.error);
              else setFollowing(true);
            });
          }}
          onJoin={() => {
            setJoinSent(true);
            wsClient.send("cohost_request_send", { streamId });
          }}
        />
      </div>
      <button
        type="button"
        onClick={() => void closeLive()}
        className="absolute right-3 z-30 royce-glow-disc"
        style={{ top: "calc(var(--safe-top) + 10px)" }}
        aria-label="Close"
      >
        <X size={16} className="text-white" />
      </button>

      {!isBattle && !isCohost ? (
        <VideoTile attach={role === "host" ? attachLocal : attachRemote(hostId || roomId)} className="absolute inset-0" />
      ) : null}

      {isCohost ? (
        <div className="absolute left-0 right-0 mx-auto max-w-[480px] flex" style={{ top: "calc(var(--safe-top) + 90px)", height: "36dvh" }}>
          <VideoTile attach={role === "host" ? attachLocal : attachRemote(hostId)} className="w-1/2 h-full" label={hostName} />
          <div className="w-1/2 h-full grid grid-cols-2 grid-rows-4 gap-[2px]">
            {seats.map((seat, i) => (
              <div key={i} className="elix-cohost-pill relative">
                {seat ? (
                  <VideoTile
                    attach={seat.userId === user?.id ? attachLocal : attachRemote(seat.userId)}
                    className="absolute inset-0"
                    label={seat.displayName}
                  />
                ) : (
                  <button
                    type="button"
                    className="h-full w-full flex flex-col items-center justify-center"
                    onClick={() => {
                      if (role === "host") wsClient.send("cohost_request_accept", { streamId });
                      else wsClient.send("cohost_request_send", { streamId });
                    }}
                  >
                    <span className="text-white/30 text-2xl font-light">+</span>
                    <p className="text-white/30 text-[9px] font-semibold mt-0.5">Add</p>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isBattle ? (
        <>
          <div
            className="elix-battle-stage-fundal absolute left-0 right-0 mx-auto max-w-[480px] overflow-hidden"
            style={{ top: "calc(var(--safe-top) + 112px - 2.5mm)", height: LIVE_BATTLE_VIDEO_HEIGHT }}
          >
            <div className={`w-full h-full grid ${battle.type === "2x2" ? "grid-cols-2 grid-rows-2" : "grid-cols-2 grid-rows-1"} gap-[2px]`}>
              {battleTiles.map((seat) => {
                const uid = battle.seats[seat];
                return (
                  <div key={seat} className="elix-battle-slot relative">
                    {uid ? (
                      <VideoTile
                        attach={uid === user?.id ? attachLocal : attachRemote(uid)}
                        className="absolute inset-0"
                        label={seat}
                      />
                    ) : (
                      <button
                        type="button"
                        className="absolute inset-0 flex items-center justify-center text-white/40 text-[11px]"
                        onClick={() => {
                          if (role === "host") return;
                          wsClient.send("battle_join", { streamId, seat });
                        }}
                      >
                        Waiting
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="absolute left-0 right-0 bottom-0 h-2 flex elix-battle-score-wrap">
              <div className="elix-battle-score-host h-full" style={{ width: `${scorePct(battle.teamAScore, battle.teamBScore, "a")}%` }} />
              <div className="elix-battle-score-guest h-full flex-1" />
            </div>
            <div className="absolute left-2 bottom-3 text-[11px] font-black">{battle.teamAScore}</div>
            <div className="absolute right-2 bottom-3 text-[11px] font-black">{battle.teamBScore}</div>
            <div className="absolute left-1/2 -translate-x-1/2 bottom-2 text-[10px] font-bold">{remaining}s</div>
          </div>
          <div className="elix-battle-mvp-row fixed left-0 right-0 z-[120] flex justify-center pointer-events-none" style={{ top: LIVE_BATTLE_STAGE_BOTTOM }}>
            <div className="relative w-full max-w-[480px] min-h-[56px]">
              <div className="elix-battle-mvp-fundal absolute inset-0 pointer-events-none" aria-hidden />
              <div className="relative z-[2] px-3 py-1.5 flex items-end justify-between overflow-x-hidden min-h-[56px]">
                <div className={`flex items-center ${BATTLE_MVP_CIRCLE_GAP_CLASS} w-1/2 min-w-0 justify-start`}>
                  {Array.from({ length: BATTLE_MVP_SLOTS_PER_SIDE }, (_, i) => {
                    const v = mvpHost[i];
                    return v ? (
                      <AvatarRing key={v.id} src={v.avatar} alt={v.name} size={LIVE_MVP_PROFILE_RING_PX} />
                    ) : (
                      <div
                        key={`l-${i}`}
                        className="relative shrink-0 rounded-full bg-[#121419] border border-[#D8D9DD]/70"
                        style={{ width: LIVE_MVP_PROFILE_RING_PX, height: LIVE_MVP_PROFILE_RING_PX }}
                      />
                    );
                  })}
                </div>
                <div className={`flex items-center ${BATTLE_MVP_CIRCLE_GAP_CLASS} w-1/2 min-w-0 justify-end`}>
                  {Array.from({ length: BATTLE_MVP_SLOTS_PER_SIDE }, (_, i) => {
                    const v = mvpOpp[i];
                    return v ? (
                      <AvatarRing key={v.id} src={v.avatar} alt={v.name} size={LIVE_MVP_PROFILE_RING_PX} />
                    ) : (
                      <div
                        key={`r-${i}`}
                        className="relative shrink-0 rounded-full bg-[#121419] border border-[#D8D9DD]/70"
                        style={{ width: LIVE_MVP_PROFILE_RING_PX, height: LIVE_MVP_PROFILE_RING_PX }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <div
        className="elix-live-chat-fundal absolute left-0 right-0 mx-auto max-w-[480px] overflow-hidden px-2"
        style={{
          bottom: LIVE_BOTTOM_ACTION_PADDING,
          height: isBattle ? LIVE_BATTLE_CHAT_HEIGHT : undefined,
          top: isBattle ? undefined : undefined,
          maxHeight: isBattle ? undefined : `calc(${LIVE_SOLO_CHAT_TOP_FROM_BOTTOM} - 8px)`,
        }}
      >
        <div className="h-full overflow-y-auto flex flex-col justify-end gap-1 pb-14">
          {giftGoal ? (
            <p className="text-[12px] text-white/80">
              Goal {giftGoal.giftName} {giftGoal.currentCount}/{giftGoal.targetCount}
            </p>
          ) : null}
          {chat.map((row) => (
            <p key={row.id} className="text-[12px] text-white/90">
              <span className="font-bold text-[#E6E9EE]">{row.displayName}</span> {row.body}
            </p>
          ))}
        </div>
      </div>

      <div
        className="absolute left-0 right-0 mx-auto max-w-[480px] flex items-center gap-2 px-2 z-40"
        style={{ bottom: LIVE_BOTTOM_ACTION_PADDING }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendChat();
          }}
          placeholder="Say something..."
          className="flex-1 bg-white/10 border border-white/10 rounded-full px-3 py-2 text-white"
        />
        <button type="button" className="royce-glow-disc" onClick={sendHeart} aria-label="Like">
          <Heart size={16} className="text-[#FF2D55]" />
        </button>
        <button type="button" className="royce-glow-disc" onClick={() => setGiftOpen(true)} aria-label="Gifts">
          <Gift size={16} className="text-[#E6E9EE]" />
        </button>
        {role === "host" ? (
          <>
            <button
              type="button"
              className="royce-glow-disc"
              title="Co-Host"
              onClick={() => {
                setMode("cohost");
                wsClient.send("cohost_layout_sync", { streamId, bigScreenUserId: user?.id ?? null, seats: seats.filter(Boolean) });
              }}
            >
              <Users size={16} />
            </button>
            <button
              type="button"
              className="royce-glow-disc"
              title="Battle"
              onClick={() => {
                if (isBattle && battle.status === "ACTIVE") {
                  wsClient.send("battle_end", { streamId });
                  return;
                }
                const type = isCohost && seats.filter(Boolean).length >= 3 ? "2x2" : "1x1";
                wsClient.send("battle_create", { streamId, type });
                setMode("battle");
              }}
            >
              <Swords size={16} />
            </button>
            <button
              type="button"
              className="royce-glow-disc"
              onClick={() => {
                const next = !micOn;
                setMicOn(next);
                void sessionRef.current?.setMicrophoneEnabled(next);
              }}
            >
              {micOn ? <Mic size={16} /> : <MicOff size={16} />}
            </button>
            <button
              type="button"
              className="royce-glow-disc"
              onClick={() => {
                const next = !camOn;
                setCamOn(next);
                void sessionRef.current?.setCameraEnabled(next);
              }}
            >
              {camOn ? <Video size={16} /> : <VideoOff size={16} />}
            </button>
          </>
        ) : null}
      </div>

      {giftOpen ? (
        <div className="absolute inset-x-0 bottom-0 z-50 mx-auto max-w-[480px] rounded-t-2xl border border-[#D8D9DD]/30 bg-black/80 p-3">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-bold">Gifts</p>
            <button type="button" onClick={() => setGiftOpen(false)} aria-label="Close gifts">
              <X size={16} />
            </button>
          </div>
          <p className="text-[11px] text-white/50 mb-2">
            Paid coins {paidCoins} · Promo {promoCoins} · Test coins {testCoins} (battle score only)
          </p>
          <div className="grid grid-cols-4 gap-2 max-h-[40vh] overflow-y-auto">
            {gifts.map((g) => (
              <div key={g.id} className="border border-white/10 rounded-xl p-2 text-center">
                <button
                  type="button"
                  className="w-full"
                  onClick={() => void sendGift(g, "paid")}
                >
                  <p className="text-[11px] truncate">{g.name}</p>
                  <p className="text-[10px] text-white/60">{g.coinCost}</p>
                </button>
                <button
                  type="button"
                  className="text-[10px] text-white/50 mt-1"
                  onClick={() => void sendGift(g, "test")}
                >
                  Test
                </button>
                {promoCoins > 0 ? (
                  <button
                    type="button"
                    className="text-[10px] text-white/50 mt-1"
                    onClick={() => void sendGift(g, "promo")}
                  >
                    Promo
                  </button>
                ) : null}
                {role === "host" ? (
                  <button
                    type="button"
                    className="text-[10px] text-white/50 mt-1"
                    onClick={() => wsClient.send("gift_goal_set", { giftId: g.id, targetCount: 10 })}
                  >
                    Goal
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {role === "host" && giftGoal ? (
            <button type="button" className="mt-2 text-[12px] text-white/60" onClick={() => wsClient.send("gift_goal_clear", {})}>
              Clear goal
            </button>
          ) : null}
        </div>
      ) : null}

      <GiftOverlay videoSrc={giftVideo} onEnded={() => setGiftVideo(null)} isBattleMode={isBattle} />
      <GiftAnimationOverlay streamId={streamId} isBattleMode={isBattle} />
      <LiveGiftFeedStack streamId={streamId} isBattleMode={isBattle} isCohostMode={isCohost} />
    </div>
  );
}

function scorePct(a: number, b: number, side: "a" | "b"): number {
  const total = a + b;
  if (total <= 0) return 50;
  return side === "a" ? (a / total) * 100 : (b / total) * 100;
}
