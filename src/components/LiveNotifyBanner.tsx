import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { wsClient } from "@/lib/wsClient";
import { isRecord } from "@/lib/isRecord";
import { showToast } from "@/lib/toast";
import { apiLiveStreams, apiLiveToken } from "@/features/feed/feedApi";
import { isLiveNotifySurfacePath } from "@/lib/appShell";

type StartedBanner = {
  kind: "started";
  room: string;
  userId: string;
  name: string;
  avatar: string;
};

type ShareBanner = {
  kind: "share";
  streamKey: string;
  sharerName: string;
  sharerAvatar: string;
  hostName: string;
  hostAvatar: string;
};

type InviteBanner = {
  kind: "battle" | "cohost";
  hostName: string;
  hostAvatar: string;
  streamKey: string;
  hostUserId: string;
};

const SEEN_CAP = 80;
const STARTED_DISMISS_MS = 6000;
const SHARE_DISMISS_MS = 12000;
const LIVE_RING = "#FF2D55";

function text(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function parseSharePayload(data: unknown): ShareBanner | null {
  if (!isRecord(data)) return null;
  const streamKey = text(data, "streamKey");
  if (!streamKey) return null;
  return {
    kind: "share",
    streamKey,
    sharerName: text(data, "sharerName") || "Someone",
    sharerAvatar: text(data, "sharerAvatar"),
    hostName: text(data, "hostName") || "a creator",
    hostAvatar: text(data, "hostAvatar"),
  };
}

function parseInvitePayload(data: unknown, kind: "battle" | "cohost"): InviteBanner | null {
  if (!isRecord(data)) return null;
  const streamKey = text(data, "streamKey");
  const hostUserId = text(data, "hostUserId");
  if (!streamKey || !hostUserId) return null;
  return {
    kind,
    hostName: text(data, "hostName") || "Creator",
    hostAvatar: text(data, "hostAvatar"),
    streamKey,
    hostUserId,
  };
}

async function isStreamJoinable(streamKey: string): Promise<boolean> {
  const { streams, error } = await apiLiveStreams();
  if (!error) {
    if (streams.some((row) => row.roomId === streamKey)) {
      return true;
    }
  }
  const { token, error: tokenErr } = await apiLiveToken(streamKey, "spectator");
  return !tokenErr && Boolean(token?.token);
}

function LiveNotifyAvatar({ src, alt, live }: { src: string; alt: string; live?: boolean }) {
  const ring = live ? LIVE_RING : "#D8D9DD";
  const photo = src.trim();
  return (
    <div className="relative flex-shrink-0" style={{ width: 26, height: 26 }}>
      <div
        className="absolute inset-0 rounded-full overflow-hidden"
        style={{ border: `1px solid ${ring}`, background: "#121419" }}
      >
        {photo ? (
          <img src={photo} alt={alt} className="block w-full h-full object-cover object-center" draggable={false} />
        ) : null}
      </div>
      {live ? (
        <div
          className="pointer-events-none absolute bottom-0 left-1/2 z-[20] -translate-x-1/2 translate-y-1/2 whitespace-nowrap font-bold leading-none"
          style={{
            backgroundColor: LIVE_RING,
            color: "#FFFFFF",
            fontSize: 5,
            padding: "1px 3px",
            borderRadius: 2,
          }}
        >
          LIVE
        </div>
      ) : null}
    </div>
  );
}

export function LiveNotifyBanner() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.session?.token) || "";
  const liveNotifications = useSettingsStore((state) => state.liveNotifications);

  const [startedBanner, setStartedBanner] = useState<StartedBanner | null>(null);
  const [shareBanner, setShareBanner] = useState<ShareBanner | null>(null);
  const [inviteBanner, setInviteBanner] = useState<InviteBanner | null>(null);
  const [inviteJoining, setInviteJoining] = useState(false);
  const shareBannerRef = useRef<ShareBanner | null>(null);
  shareBannerRef.current = shareBanner;
  const startedBannerRef = useRef<StartedBanner | null>(null);
  startedBannerRef.current = startedBanner;
  const seenStartedRef = useRef<Set<string>>(new Set());
  const startedDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissStarted = useCallback(() => {
    if (startedDismissTimer.current) {
      clearTimeout(startedDismissTimer.current);
      startedDismissTimer.current = null;
    }
    setStartedBanner(null);
  }, []);

  const dismissShare = useCallback(() => {
    if (shareDismissTimer.current) {
      clearTimeout(shareDismissTimer.current);
      shareDismissTimer.current = null;
    }
    setShareBanner(null);
  }, []);

  const dismissInvite = useCallback(() => {
    setInviteBanner(null);
    setInviteJoining(false);
  }, []);

  useEffect(() => {
    if (!token || !liveNotifications) return;
    let cancelled = false;

    const showStarted = (data: unknown) => {
      if (!isRecord(data)) return;
      const room = text(data, "roomId");
      const uid = text(data, "hostId");
      if (!room) return;
      if (uid && user?.id && uid === user.id) return;
      if (seenStartedRef.current.has(room)) return;
      seenStartedRef.current.add(room);
      if (seenStartedRef.current.size > SEEN_CAP) {
        const first = seenStartedRef.current.values().next().value;
        if (first) seenStartedRef.current.delete(first);
      }
      const name = text(data, "displayName") || "Someone";
      const avatar = text(data, "avatarUrl");
      if (cancelled) return;
      setStartedBanner({ kind: "started", room, userId: uid, name, avatar });
      if (startedDismissTimer.current) clearTimeout(startedDismissTimer.current);
      startedDismissTimer.current = setTimeout(() => setStartedBanner(null), STARTED_DISMISS_MS);
    };

    const retireStarted = (data: unknown) => {
      if (!isRecord(data)) return;
      const endedRoom = text(data, "roomId");
      const current = startedBannerRef.current;
      if (!current) return;
      if (endedRoom && current.room === endedRoom) {
        dismissStarted();
      }
    };

    wsClient.on("stream_started", showStarted);
    wsClient.on("stream_ended", retireStarted);
    return () => {
      cancelled = true;
      wsClient.off("stream_started", showStarted);
      wsClient.off("stream_ended", retireStarted);
      if (startedDismissTimer.current) {
        clearTimeout(startedDismissTimer.current);
        startedDismissTimer.current = null;
      }
    };
  }, [token, liveNotifications, user?.id, dismissStarted]);

  useEffect(() => {
    if (!token || !user?.id) return;

    const showShare = (data: unknown) => {
      const parsed = parseSharePayload(data);
      if (!parsed) return;
      if (!isRecord(data)) return;
      const sharerId = text(data, "sharerUserId");
      if (sharerId && sharerId === user.id) return;
      setShareBanner(parsed);
      if (shareDismissTimer.current) clearTimeout(shareDismissTimer.current);
      shareDismissTimer.current = setTimeout(() => setShareBanner(null), SHARE_DISMISS_MS);
    };

    const onStreamEnded = (data: unknown) => {
      if (!isRecord(data)) return;
      const endedKey = text(data, "roomId");
      const current = shareBannerRef.current;
      if (endedKey && current?.streamKey === endedKey) dismissShare();
    };

    wsClient.on("live_share", showShare);
    wsClient.on("stream_ended", onStreamEnded);
    return () => {
      wsClient.off("live_share", showShare);
      wsClient.off("stream_ended", onStreamEnded);
      if (shareDismissTimer.current) {
        clearTimeout(shareDismissTimer.current);
        shareDismissTimer.current = null;
      }
    };
  }, [token, user?.id, dismissShare]);

  useEffect(() => {
    if (!token || !user?.id) return;

    const onBattleInvite = (data: unknown) => {
      const parsed = parseInvitePayload(data, "battle");
      if (!parsed) return;
      if (parsed.hostUserId === user.id) return;
      setInviteBanner(parsed);
      showToast(`@${parsed.hostName} invited you to battle — tap Join`);
    };

    const onCohostInvite = (data: unknown) => {
      const parsed = parseInvitePayload(data, "cohost");
      if (!parsed) return;
      if (parsed.hostUserId === user.id) return;
      setInviteBanner(parsed);
      showToast(`@${parsed.hostName} wants you to co-host — tap Join`);
    };

    wsClient.on("battle_invite", onBattleInvite);
    wsClient.on("cohost_invite", onCohostInvite);
    return () => {
      wsClient.off("battle_invite", onBattleInvite);
      wsClient.off("cohost_invite", onCohostInvite);
    };
  }, [token, user?.id]);

  const onLiveSurface = isLiveNotifySurfacePath(location.pathname);
  const startedSuppressed = onLiveSurface;
  const shareSuppressed =
    !!shareBanner &&
    (location.pathname === `/watch/${shareBanner.streamKey}` ||
      location.pathname.startsWith(`/watch/${shareBanner.streamKey}/`));
  const inviteSuppressed = onLiveSurface;

  const openStartedLive = useCallback(() => {
    if (!startedBanner) return;
    dismissStarted();
    navigate(`/watch/${encodeURIComponent(startedBanner.room)}`);
  }, [startedBanner, dismissStarted, navigate]);

  const openSharedLive = useCallback(async () => {
    if (!shareBanner) return;
    const key = shareBanner.streamKey;
    dismissShare();
    try {
      const joinable = await isStreamJoinable(key);
      if (!joinable) {
        showToast("This live has ended");
        return;
      }
      navigate(`/watch/${encodeURIComponent(key)}`);
    } catch {
      showToast("Could not join live");
    }
  }, [shareBanner, dismissShare, navigate]);

  const rejectInvite = useCallback(() => {
    if (!inviteBanner) return;
    if (inviteBanner.kind === "battle") {
      wsClient.send("battle_invite_decline", {
        streamKey: inviteBanner.streamKey,
        hostUserId: inviteBanner.hostUserId,
      });
    } else {
      wsClient.send("cohost_invite_decline", {
        streamKey: inviteBanner.streamKey,
        userId: inviteBanner.hostUserId,
      });
    }
    dismissInvite();
  }, [inviteBanner, dismissInvite]);

  const acceptInvite = useCallback(async () => {
    if (!inviteBanner || !user?.id || inviteJoining) return;
    setInviteJoining(true);
    try {
      if (inviteBanner.kind === "battle") {
        dismissInvite();
        navigate(`/live/${encodeURIComponent(inviteBanner.streamKey)}?battle=1`, {
          state: {
            battleHost: {
              userId: inviteBanner.hostUserId,
              name: inviteBanner.hostName,
              avatar: inviteBanner.hostAvatar,
            },
          },
        });
        return;
      }
      dismissInvite();
      navigate(`/watch/${encodeURIComponent(inviteBanner.streamKey)}?cohost=1`, {
        replace: true,
        state: { fromCohostInvite: true },
      });
    } finally {
      setInviteJoining(false);
    }
  }, [inviteBanner, user, inviteJoining, dismissInvite, navigate]);

  if (inviteBanner && !inviteSuppressed) {
    return (
      <div
        className="fixed left-0 right-0 top-0 z-[9999] flex justify-center px-3 pointer-events-none"
        style={{ paddingTop: "calc(var(--safe-top) + 8px)" }}
      >
        <div className="pointer-events-auto w-full max-w-[480px] flex items-center gap-2 rounded-full elix-panel border border-[#D8D9DD]/40 pl-1.5 pr-2 py-1 shadow-[0_8px_30px_rgba(0,0,0,0.55)]">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <LiveNotifyAvatar src={inviteBanner.hostAvatar} alt={inviteBanner.hostName} live />
            <span className="flex-1 min-w-0 flex flex-col truncate">
              <span className="text-white font-bold text-xs truncate">@{inviteBanner.hostName}</span>
              <span className="text-[#F5F5F7] text-[10px] font-semibold truncate">
                {inviteBanner.kind === "battle" ? "Battle invite" : "Co-host invite"}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={rejectInvite}
            className="h-6 px-3 rounded-full bg-red-500/25 border border-red-400/50 inline-flex items-center justify-center active:scale-95 shrink-0"
          >
            <span className="text-red-300 text-[10px] font-bold leading-none whitespace-nowrap">Reject</span>
          </button>
          <button
            type="button"
            disabled={inviteJoining}
            onClick={() => {
              void acceptInvite();
            }}
            className="h-6 px-3.5 rounded-full bg-green-500 inline-flex items-center justify-center active:scale-95 disabled:opacity-60 shrink-0"
          >
            <span className="text-black text-[10px] font-bold leading-none whitespace-nowrap">
              {inviteJoining ? "Joining…" : "Join"}
            </span>
          </button>
          <button
            type="button"
            onClick={dismissInvite}
            aria-label="Dismiss"
            className="p-0.5 text-white/50 active:text-white/80 shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  const bannerShell = (
    label: string,
    name: string,
    avatar: string,
    badge: string,
    onOpen: () => void,
    onDismiss: () => void,
  ) => (
    <div
      className="fixed left-0 right-0 top-0 z-[9999] flex justify-center px-3 pointer-events-none"
      style={{ paddingTop: "calc(var(--safe-top) + 8px)" }}
    >
      <div className="pointer-events-auto w-full max-w-[480px] flex items-center gap-2 rounded-full elix-panel border border-[#D8D9DD]/40 pl-1.5 pr-2 py-1 shadow-[0_8px_30px_rgba(0,0,0,0.55)]">
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 min-w-0 flex items-center gap-2 text-left active:scale-[0.99] transition-transform"
        >
          <LiveNotifyAvatar src={avatar} alt={name} live />
          <span className="flex-1 min-w-0 flex items-baseline gap-1.5 truncate">
            <span className="text-white font-bold text-xs truncate">{name}</span>
            <span className="text-[#F5F5F7] text-[11px] font-semibold whitespace-nowrap truncate">{label}</span>
          </span>
        </button>
        <span className="text-[9px] font-bold text-white bg-red-600 rounded-full px-1.5 py-0.5 tracking-wide shrink-0">
          {badge}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="p-0.5 text-white/50 active:text-white/80 shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );

  if (shareBanner && !shareSuppressed) {
    const hostLabel = shareBanner.hostName.trim() || "a live";
    return bannerShell(
      `shared ${hostLabel} — tap to join`,
      shareBanner.sharerName,
      shareBanner.sharerAvatar,
      "LIVE",
      () => {
        void openSharedLive();
      },
      dismissShare,
    );
  }

  if (startedBanner && !startedSuppressed) {
    return bannerShell(
      "is live now — tap to watch",
      startedBanner.name,
      startedBanner.avatar,
      "LIVE",
      openStartedLive,
      dismissStarted,
    );
  }

  return null;
}
