import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart2,
  ChevronLeft,
  Gift,
  Mic,
  MicOff,
  MoreVertical,
  Share2,
  SwitchCamera,
  Swords,
  UserPlus,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import type { BattleState, CohostSeat, GiftCatalogItem, GiftGoal } from "@shared/contracts";
import { battleStateSchema, cohostLayoutSchema, giftGoalSchema } from "@shared/contracts";
import { wsClient } from "@/lib/wsClient";
import { useAuthStore } from "@/store/useAuthStore";
import { formatWalletCount } from "@/features/wallet/formatWalletCount";
import { useTestCoinsStore } from "@/store/useTestCoinsStore";
import { useWalletStore } from "@/store/useWalletStore";
import { apiFetchProfile, apiFollow, apiUnfollow } from "@/features/feed/feedApi";
import { apiGiftCatalog, apiSendGift } from "@/features/gifts/giftApi";
import { useLiveHostSession } from "@/features/live/useLiveHostSession";
import { useSpectatorSession } from "@/features/live/useSpectatorSession";
import { getPublicWebOrigin } from "@/lib/api";
import { nativeShareUrl } from "@/lib/platform";
import { watchLiveProfilePath } from "@/lib/liveProfileNav";
import { namedExitForLocation } from "@/lib/settingsNav";
import { LiveHostProfileHeader, LiveMarkedSubHeaderBar } from "@/components/LiveMarkedTopUi";
import { formatCompactNumber } from "@/lib/formatCompactNumber";
import { GiftOverlay } from "@/components/GiftOverlay";
import GiftAnimationOverlay from "@/components/GiftAnimationOverlay";
import { LiveGiftFeedStack } from "@/components/LiveGiftFeedStack";
import ReportModal from "@/components/ReportModal";
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
  MVP_BADGE_CLASS,
  MVP_GOLD,
  MVP_RING_PHOTO_SOFT_CLASS,
} from "@/lib/profileFrame";
import { COHOST_SEAT_COUNT } from "@/features/live/cohostLayout";
import { apiGetDailyHearts, apiSendDailyHeart } from "@/features/live/dailyHearts";
import {
  LIVE_SAFETY_TICK_MS,
  LIVE_SAFETY_WARNING,
  apiLiveSafetyCheck,
  frameFromLiveVideo,
} from "@/features/live/liveSafetyCheck";
import { isRecord } from "@/lib/isRecord";
import { showToast } from "@/lib/toast";

type ChatRow = { id: string; displayName: string; body: string };

type RoomMode = "solo" | "cohost" | "battle";

function emptySeats(): Array<CohostSeat | null> {
  return Array.from({ length: COHOST_SEAT_COUNT }, () => null);
}

function emptyBattle(): BattleState {
  return {
    roomId: "",
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
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const paidCoins = useWalletStore((s) => s.paidCoins);
  const promoCoins = useWalletStore((s) => s.promoCoins);
  const walletStatus = useWalletStore((s) => s.status);
  const fetchWallet = useWalletStore((s) => s.fetchWallet);
  const testCoins = useTestCoinsStore((s) => s.testCoins);
  const testStatus = useTestCoinsStore((s) => s.status);
  const fetchTestCoins = useTestCoinsStore((s) => s.fetchTestCoins);
  const hostSession = useLiveHostSession(role === "host", user?.displayName || user?.username || "LIVE");
  const spectatorSession = useSpectatorSession(role === "spectator", streamIdProp);

  const [streamId, setStreamId] = useState(streamIdProp);
  const [roomId, setRoomId] = useState(streamIdProp);
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
  const [likeCount, setLikeCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollDraft, setPollDraft] = useState("");
  const [topGifters, setTopGifters] = useState<Array<{ id: string; name: string; avatar: string | null }>>([]);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyMessage, setSafetyMessage] = useState(LIVE_SAFETY_WARNING);
  const [hostName, setHostName] = useState(user?.displayName || "LIVE");
  const [hostAvatar, setHostAvatar] = useState<string | null>(user?.avatarUrl ?? null);
  const [hostId, setHostId] = useState(user?.id ?? "");
  const [mvpHost] = useState<Array<{ id: string; name: string; avatar: string | null }>>([]);
  const [mvpOpp] = useState<Array<{ id: string; name: string; avatar: string | null }>>([]);
  const followLock = useRef(false);
  const joinLock = useRef(false);
  const hostVideoRef = useRef<HTMLVideoElement | null>(null);

  const hostAttachRef = useRef(hostSession.attachLocal);
  hostAttachRef.current = hostSession.attachLocal;

  const attachLocal = useCallback((el: HTMLVideoElement | null) => {
    hostVideoRef.current = el;
    if (role === "host") hostAttachRef.current(el);
  }, [role]);

  useEffect(() => {
    if (role !== "spectator" || !spectatorSession.creds) return;
    setStreamId(spectatorSession.creds.streamId);
    setRoomId(spectatorSession.creds.roomId);
    setHostId(spectatorSession.creds.hostId);
    setHostName(spectatorSession.creds.displayName || spectatorSession.creds.username);
    setHostAvatar(spectatorSession.creds.avatarUrl);
  }, [role, spectatorSession.creds]);

  useEffect(() => {
    if (role !== "host" || !user) return;
    setHostId(user.id);
    setHostName(user.displayName || user.username || "LIVE");
    setHostAvatar(user.avatarUrl ?? null);
  }, [role, user]);

  useEffect(() => {
    if (role !== "host" || !hostSession.streamId) return;
    setStreamId(hostSession.streamId);
    setRoomId(hostSession.roomId);
  }, [hostSession.roomId, hostSession.streamId, role]);

  useEffect(() => {
    if (role !== "spectator" || !spectatorSession.creds?.roomId) return;
    void apiGiftCatalog().then((catalog) => {
      if (catalog.error) showToast(catalog.error);
      else setGifts(catalog.gifts);
    });
    void fetchWallet();
    void fetchTestCoins();
  }, [fetchTestCoins, fetchWallet, role, spectatorSession.creds?.roomId]);

  useEffect(() => {
    if (role !== "spectator" || !spectatorSession.creds?.hostId || spectatorSession.creds.hostId === user?.id) return;
    void apiFetchProfile(spectatorSession.creds.hostId).then((res) => {
      if (res.profile?.isFollowing) setFollowing(true);
    });
  }, [role, spectatorSession.creds?.hostId, user?.id]);

  useEffect(() => {
    if (role !== "host" || !hostSession.roomId) return;
    void apiGiftCatalog().then((catalog) => {
      if (catalog.error) showToast(catalog.error);
      else setGifts(catalog.gifts);
    });
    void fetchWallet();
    void fetchTestCoins();
  }, [fetchTestCoins, fetchWallet, hostSession.roomId, role]);

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
    const onGift = (data: unknown) => {
      if (!isRecord(data)) return;
      const url = typeof data.animationUrl === "string" ? data.animationUrl : null;
      if (url) setGiftVideo(url);
      const senderId = typeof data.senderId === "string" ? data.senderId : "";
      const senderName = typeof data.displayName === "string" ? data.displayName : "User";
      const senderAvatar = typeof data.avatarUrl === "string" ? data.avatarUrl : null;
      if (senderId) {
        setTopGifters((prev) => {
          const next = [{ id: senderId, name: senderName, avatar: senderAvatar }, ...prev.filter((row) => row.id !== senderId)];
          return next.slice(0, 3);
        });
      }
    };
    const onHeart = (data: unknown) => {
      if (isRecord(data) && typeof data.count === "number") {
        setLikeCount(data.count);
        return;
      }
      setLikeCount((prev) => prev + 1);
    };
    const onGoal = (data: unknown) => {
      if (data == null) {
        setGiftGoal(null);
        return;
      }
      const parsed = giftGoalSchema.safeParse(data);
      if (parsed.success) setGiftGoal(parsed.data);
    };
    const onSafety = (data: unknown) => {
      const message =
        isRecord(data) && typeof data.message === "string" && data.message
          ? data.message
          : LIVE_SAFETY_WARNING;
      setSafetyMessage(message);
      setSafetyOpen(true);
    };
    wsClient.on("chat_message", onChat);
    wsClient.on("viewer_count", onViewers);
    wsClient.on("cohost_layout_sync", onCohost);
    wsClient.on("cohost_request", onCohostRequest);
    wsClient.on("battle_state_sync", onBattle);
    wsClient.on("battle_tick", onBattle);
    wsClient.on("gift_sent", onGift);
    wsClient.on("heart_sent", onHeart);
    wsClient.on("gift_goal_sync", onGoal);
    wsClient.on("moderation_warning", onSafety);
    return () => {
      wsClient.off("chat_message", onChat);
      wsClient.off("viewer_count", onViewers);
      wsClient.off("cohost_layout_sync", onCohost);
      wsClient.off("cohost_request", onCohostRequest);
      wsClient.off("battle_state_sync", onBattle);
      wsClient.off("battle_tick", onBattle);
      wsClient.off("gift_sent", onGift);
      wsClient.off("heart_sent", onHeart);
      wsClient.off("gift_goal_sync", onGoal);
      wsClient.off("moderation_warning", onSafety);
    };
  }, []);

  useEffect(() => {
    if (!hostId) return;
    void apiGetDailyHearts(hostId).then((result) => {
      if (result.hasSent) setJoinSent(true);
    });
  }, [hostId]);

  useEffect(() => {
    if (role !== "host" || !roomId) return;
    const tick = () => {
      const frame = frameFromLiveVideo(hostVideoRef.current);
      if (!frame) return;
      void apiLiveSafetyCheck({ roomId, imageBase64: frame }).then((result) => {
        if (result.action === "warning") {
          setSafetyMessage(result.message || LIVE_SAFETY_WARNING);
          setSafetyOpen(true);
        }
      });
    };
    const timer = window.setInterval(tick, LIVE_SAFETY_TICK_MS);
    return () => window.clearInterval(timer);
  }, [role, roomId]);

  const sendChat = () => {
    const body = draft.trim();
    if (!body) return;
    wsClient.send("chat_message", { roomId, body });
    setDraft("");
  };

  const sendHeart = () => {
    wsClient.send("heart_sent", { roomId });
  };

  const sendGift = async (gift: GiftCatalogItem, bucket: "paid" | "promo" | "test") => {
    if (!hostId) {
      showToast("Host is not ready");
      return;
    }
    if (bucket === "test") {
      if (testStatus !== "ready" || testCoins == null) {
        showToast(testStatus === "error" ? "Test coins unavailable" : "Test coins loading");
        return;
      }
      if (testCoins < gift.coinCost) {
        showToast("Not enough test coins");
        return;
      }
    } else {
      if (walletStatus !== "ready" || (bucket === "promo" ? promoCoins : paidCoins) == null) {
        showToast(walletStatus === "error" ? "Wallet unavailable" : "Wallet loading");
        return;
      }
      if (bucket === "promo" && (promoCoins ?? 0) < gift.coinCost) {
        showToast("Not enough promo coins");
        return;
      }
      if (bucket === "paid" && (paidCoins ?? 0) < gift.coinCost) {
        showToast("Not enough coins");
        return;
      }
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
    if (bucket === "test") await fetchTestCoins();
    else await fetchWallet();
    // Room WS gift_sent fanout drives GiftAnimationOverlay; do not also pushLocalGiftPill.
    setGiftOpen(false);
  };

  const closeLive = async () => {
    if (role === "host") {
      await hostSession.endBroadcast();
    } else {
      await spectatorSession.leave();
    }
    navigate(namedExitForLocation(location.pathname, location.state), { replace: true });
  };

  const shareLive = () => {
    const liveRoom = roomId || (role === "host" ? hostSession.roomId : "");
    if (!liveRoom) {
      showToast("Could not share");
      return;
    }
    const url = `${getPublicWebOrigin()}/watch/${encodeURIComponent(liveRoom)}`;
    void nativeShareUrl({
      title: role === "host" ? "Watch my LIVE on Elix" : `Watch ${hostName} live on Elix`,
      url,
    }).then((ok) => {
      if (!ok) showToast("Could not share");
    });
  };

  const attachRemote = spectatorSession.attachRemote;
  const liveKit = role === "host" ? hostSession.sessionRef : spectatorSession.sessionRef;
  const bootConnecting = role === "host" ? hostSession.connecting : spectatorSession.phase === "connecting";
  const spectatorGate = role === "spectator" && (spectatorSession.phase === "ended" || spectatorSession.phase === "failed");
  const bootError = role === "host" ? hostSession.error : spectatorGate ? spectatorSession.error : null;

  const isBattle = mode === "battle" && battle.status !== "ENDED";
  const isCohost = mode === "cohost";
  const remaining = Math.max(0, Math.ceil(battle.remainingMs / 1000));

  const battleTiles = useMemo(() => {
    if (battle.type === "2x2") return ["host", "opponent", "player3", "player4"] as const;
    return ["host", "opponent"] as const;
  }, [battle.type]);

  const isBattleParticipant = useMemo(() => {
    if (!user?.id) return false;
    return Object.values(battle.seats).includes(user.id);
  }, [battle.seats, user?.id]);

  const sendBattleTap = useCallback(
    (seat: (typeof battleTiles)[number]) => {
      if (battle.status !== "ACTIVE" || remaining <= 0) return;
      if (isBattleParticipant) return;
      wsClient.send("battle_spectator_vote", { roomId, target: seat });
    },
    [battle.status, isBattleParticipant, remaining, roomId],
  );

  if (bootError) {
    const ended = role === "spectator" && spectatorSession.phase === "ended";
    return (
      <div className="elix-live-room min-h-[100dvh] flex flex-col items-center justify-center text-white px-6">
        <h2 className="text-[#F5F5F7] font-bold text-xl tracking-tight mb-2">{ended ? "Live ended" : "Stream offline"}</h2>
        <p className="text-sm text-white/70 mb-4 text-center">{bootError}</p>
        <button
          type="button"
          onClick={() => navigate(namedExitForLocation(location.pathname, location.state), { replace: true })}
          className="border border-[#D8D9DD]/40 rounded-xl px-4 py-2"
        >
          Back to For You
        </button>
      </div>
    );
  }

  return (
    <div className="elix-live-room relative h-[100dvh] overflow-hidden text-white">
      {bootConnecting ? (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#080A0E] gap-4">
          <div className="w-10 h-10 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
          {role === "spectator" ? <p className="text-white/60 text-sm">Connecting to live…</p> : null}
        </div>
      ) : null}

      <div className={`absolute top-0 left-0 right-0 z-[110] pointer-events-none overflow-visible elix-live-top-chrome ${isBattle ? "elix-battle-top-fundal" : ""}`}>
        <div className="px-3 pb-1.5" style={{ paddingTop: "max(2px, calc(var(--safe-top) + 6px))" }}>
          <div className="flex items-start justify-between gap-2">
            <div className="pointer-events-auto flex flex-col gap-2">
              <LiveHostProfileHeader
                name={hostName}
                avatar={hostAvatar}
                likes={likeCount}
                showFollow={role === "spectator" && Boolean(hostId) && hostId !== user?.id}
                isFollowing={following}
                joinSent={joinSent}
                onLikesClick={sendHeart}
                onAvatarClick={() => {
                  const path = watchLiveProfilePath(streamIdProp, hostId);
                  if (!path) return;
                  navigate(path);
                }}
                onFollow={(e) => {
                  e.stopPropagation();
                  if (!hostId || hostId === user?.id || followLock.current) return;
                  followLock.current = true;
                  const next = !following;
                  setFollowing(next);
                  void (next ? apiFollow(hostId) : apiUnfollow(hostId))
                    .then((r) => {
                      if (!r.ok) {
                        setFollowing(!next);
                        showToast(r.error);
                      }
                    })
                    .finally(() => {
                      followLock.current = false;
                    });
                }}
                onJoin={() => {
                  if (!hostId || joinLock.current) return;
                  joinLock.current = true;
                  void apiSendDailyHeart(hostId)
                    .then((result) => {
                      if (result.ok) setJoinSent(true);
                      else showToast(result.error || "Could not send membership heart. Try again.");
                    })
                    .finally(() => {
                      joinLock.current = false;
                    });
                }}
              />
            </div>
            <div className="pointer-events-auto flex items-center gap-[0mm] mt-1">
              {topGifters.length > 0 ? (
                <div className="flex items-center gap-[0mm] flex-shrink-0" style={{ transform: "translateX(-2mm)" }}>
                  {topGifters.slice(0, 3).map((viewer, i) => (
                    <div key={viewer.id} className="relative" style={{ zIndex: 3 - i, marginLeft: i === 0 ? "0mm" : "-1.5mm" }}>
                      <div className={i === 0 ? MVP_RING_PHOTO_SOFT_CLASS : "rounded-full"}>
                        <AvatarRing src={viewer.avatar} alt={viewer.name} size={LIVE_MVP_PROFILE_RING_PX} ringColor={i === 0 ? MVP_GOLD : undefined} />
                      </div>
                      {i === 0 ? <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 z-[2] ${MVP_BADGE_CLASS}`}>MVP</span> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <span className="text-white/50 text-[9px] font-bold tabular-nums" style={{ marginRight: "1mm" }}>
                {formatCompactNumber(viewerCount)}
              </span>
              <button type="button" onClick={() => void closeLive()} className="p-1 active:scale-95" aria-label="Close">
                <ChevronLeft size={18} className="text-[#E6E9EE]" strokeWidth={2.35} />
              </button>
            </div>
          </div>
          <LiveMarkedSubHeaderBar
            rank={null}
            giftLabel={giftGoal ? `${giftGoal.currentCount}/${giftGoal.targetCount}` : undefined}
            onWeeklyRanking={() => navigate("/engagement")}
            onDiamond={() => navigate("/engagement")}
            onGiftGoal={() => setGiftOpen(true)}
            onExplore={() => navigate("/live")}
          />
        </div>
      </div>

      {!isBattle && !isCohost ? (
        <VideoTile attach={role === "host" ? attachLocal : attachRemote(hostId)} className="absolute inset-0" />
      ) : null}

      {isCohost ? (
        <div
          className="absolute left-0 right-0 mx-auto max-w-[480px] flex gap-[2px]"
          style={{ top: "calc(var(--safe-top) + 90px + 9mm)", height: "calc(36dvh + 10mm)" }}
        >
          <VideoTile
            attach={role === "host" ? attachLocal : attachRemote(hostId)}
            className="elix-cohost-pill w-1/2 min-w-0 h-full"
            label={hostName}
          />
          <div className="w-1/2 h-full grid grid-cols-2 grid-rows-4 gap-[2px] bg-transparent">
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
                      if (role === "host") wsClient.send("cohost_request_accept", { roomId });
                      else wsClient.send("cohost_request_send", { roomId });
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
                  <div
                    key={seat}
                    className="elix-battle-slot relative"
                    onClick={() => {
                      if (uid) sendBattleTap(seat);
                    }}
                  >
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
                          wsClient.send("battle_join", { roomId, seat });
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
        className="elix-live-lower-fundal absolute left-0 right-0 mx-auto max-w-[480px] flex items-end gap-1.5 px-2 z-40"
        style={{ bottom: LIVE_BOTTOM_ACTION_PADDING }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendChat();
          }}
          placeholder="Say something..."
          className="flex-1 bg-black/35 backdrop-blur-sm border border-[#2A2D33] rounded-full px-3 h-10 text-white text-xs placeholder:text-white/30"
        />
        {role === "spectator" ? (
          <>
            <LiveDockButton label="Poll" onClick={() => setPollOpen(true)}>
              <BarChart2 size={18} className="text-[#F5F5F7]" strokeWidth={2.25} />
            </LiveDockButton>
            <LiveDockButton
              label="Co-Host"
              onClick={() => wsClient.send("cohost_request_send", { roomId })}
            >
              <UserPlus size={18} className="text-[#F5F5F7]" strokeWidth={2.25} />
            </LiveDockButton>
            <LiveDockButton label="Gift" onClick={() => setGiftOpen(true)}>
              <Gift size={18} className="text-[#E6E9EE]" strokeWidth={2.25} />
            </LiveDockButton>
            <LiveDockButton label="Share" onClick={shareLive}>
              <Share2 size={18} className="text-[#F5F5F7]" strokeWidth={2.25} />
            </LiveDockButton>
            <LiveDockButton label="More" onClick={() => setMoreOpen(true)}>
              <MoreVertical size={18} className="text-[#F5F5F7]" strokeWidth={2.25} />
            </LiveDockButton>
          </>
        ) : (
          <>
            {!isBattle ? (
              <LiveDockButton
                label="Co-Host"
                onClick={() => {
                  setMode("cohost");
                  wsClient.send("cohost_layout_sync", { roomId, bigScreenUserId: user?.id ?? null, seats: seats.filter(Boolean) });
                }}
              >
                <Users size={18} className="text-[#F5F5F7]" strokeWidth={2.25} />
              </LiveDockButton>
            ) : null}
            <LiveDockButton
              label="Battle"
              onClick={() => {
                if (isBattle && battle.status === "ACTIVE") {
                  wsClient.send("battle_end", { roomId });
                  return;
                }
                const type = isCohost && seats.filter(Boolean).length >= 3 ? "2x2" : "1x1";
                wsClient.send("battle_create", { roomId, type });
                setMode("battle");
              }}
            >
              <Swords size={18} className="text-[#F5F5F7]" strokeWidth={2.25} />
            </LiveDockButton>
            <LiveDockButton label="Poll" onClick={() => setPollOpen(true)}>
              <BarChart2 size={18} className="text-[#F5F5F7]" strokeWidth={2.25} />
            </LiveDockButton>
            <LiveDockButton label="Share" onClick={shareLive}>
              <Share2 size={18} className="text-[#F5F5F7]" strokeWidth={2.25} />
            </LiveDockButton>
            <LiveDockButton label="More" onClick={() => setMoreOpen(true)}>
              <MoreVertical size={18} className="text-[#F5F5F7]" strokeWidth={2.25} />
            </LiveDockButton>
          </>
        )}
      </div>

      {moreOpen ? (
        <div className="absolute inset-x-0 bottom-0 z-50 mx-auto max-w-[480px] rounded-t-2xl border border-[#D8D9DD]/30 bg-black/80 p-3">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-bold">More</p>
            <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close more">
              <X size={16} />
            </button>
          </div>
          {role === "host" ? (
            <div className="flex items-center justify-around pb-2">
              <button
                type="button"
                className="flex flex-col items-center gap-1"
                onClick={() => {
                  const next = !micOn;
                  setMicOn(next);
                  void liveKit.current?.setMicrophoneEnabled(next);
                }}
              >
                <span className="royce-glow-disc w-10 h-10">{micOn ? <Mic size={18} /> : <MicOff size={18} />}</span>
                <span className="text-[10px] text-white/70">Mic</span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-1"
                onClick={() => {
                  const next = !camOn;
                  setCamOn(next);
                  void liveKit.current?.setCameraEnabled(next);
                }}
              >
                <span className="royce-glow-disc w-10 h-10">{camOn ? <Video size={18} /> : <VideoOff size={18} />}</span>
                <span className="text-[10px] text-white/70">Camera</span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-1"
                onClick={() => {
                  void liveKit.current?.switchCamera();
                }}
              >
                <span className="royce-glow-disc w-10 h-10">
                  <SwitchCamera size={18} />
                </span>
                <span className="text-[10px] text-white/70">Flip</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <button type="button" className="w-full py-2 text-sm text-white/80" onClick={sendHeart}>
                Send like
              </button>
              {hostId ? (
                <button
                  type="button"
                  className="w-full py-2 text-sm text-white/80"
                  onClick={() => {
                    setMoreOpen(false);
                    setReportOpen(true);
                  }}
                >
                  Report
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        videoId=""
        contentType="user"
        contentId={hostId || undefined}
      />

      {pollOpen ? (
        <div className="absolute inset-x-0 bottom-0 z-50 mx-auto max-w-[480px] rounded-t-2xl border border-[#D8D9DD]/30 bg-black/80 p-3">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-bold">Poll</p>
            <button type="button" onClick={() => setPollOpen(false)} aria-label="Close poll">
              <X size={16} />
            </button>
          </div>
          <input
            value={pollDraft}
            onChange={(e) => setPollDraft(e.target.value)}
            placeholder="Ask the room..."
            className="w-full bg-black/35 border border-[#2A2D33] rounded-full px-3 h-10 text-white text-xs mb-3"
          />
          <button
            type="button"
            className="w-full py-2.5 rounded-lg bg-[#E6E9EE] text-white font-semibold"
            onClick={() => {
              const question = pollDraft.trim();
              if (!question) return;
              wsClient.send("chat_message", { roomId, body: `Poll: ${question}` });
              setPollDraft("");
              setPollOpen(false);
            }}
          >
            Post poll
          </button>
        </div>
      ) : null}

      {giftOpen ? (
        <div className="absolute inset-x-0 bottom-0 z-50 mx-auto max-w-[480px] rounded-t-2xl border border-[#D8D9DD]/30 bg-black/80 p-3">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-bold">Gifts</p>
            <button type="button" onClick={() => setGiftOpen(false)} aria-label="Close gifts">
              <X size={16} />
            </button>
          </div>
          <p className="text-[11px] text-white/50 mb-2">
            Paid coins {formatWalletCount(paidCoins, walletStatus)} · Promo {formatWalletCount(promoCoins, walletStatus)} · Test coins {formatWalletCount(testCoins, testStatus)} (battle score only)
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
                {walletStatus === "ready" && (promoCoins ?? 0) > 0 ? (
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

      {safetyOpen ? (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70"
          onClick={() => setSafetyOpen(false)}
        >
          <div
            className="bg-[rgba(0,0,0,0.35)] border border-[#2A2D33] rounded-xl p-6 max-w-sm w-full shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
              <h3 className="font-semibold text-white">Safety reminder</h3>
            </div>
            <p className="text-white/80 text-sm mb-4">{safetyMessage}</p>
            <button
              type="button"
              onClick={() => setSafetyOpen(false)}
              className="w-full py-2.5 rounded-lg bg-[#E6E9EE] text-white font-semibold"
            >
              OK
            </button>
          </div>
        </div>
      ) : null}

      <GiftOverlay videoSrc={giftVideo} onEnded={() => setGiftVideo(null)} isBattleMode={isBattle} />
      <GiftAnimationOverlay streamId={streamId} isBattleMode={isBattle} />
      <LiveGiftFeedStack streamId={streamId} isBattleMode={isBattle} isCohostMode={isCohost} />
    </div>
  );
}

function LiveDockButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="flex flex-col items-center gap-0.5 flex-shrink-0" onClick={onClick} title={label}>
      <span className="royce-glow-disc w-10 h-10">{children}</span>
      <span className="elix-silver-red-text text-[8px] font-medium">{label}</span>
    </button>
  );
}

function scorePct(a: number, b: number, side: "a" | "b"): number {
  const total = a + b;
  if (total <= 0) return 50;
  return side === "a" ? (a / total) * 100 : (b / total) * 100;
}
