import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Play, Radio, Send, Video } from "lucide-react";
import { RoyceBackIcon } from "@/components/royce";
import { AvatarRing } from "@/components/AvatarRing";
import { LevelBadge } from "@/components/LevelBadge";
import { StoryGoldRingAvatar } from "@/components/StoryGoldRingAvatar";
import { createChatThreadSession } from "@/features/chat/chatThreadSession";
import { useChatThreadSession } from "@/features/chat/useChatThreadSession";
import { firstAppShare, splitChatBody } from "@/features/chat/chatThreadLinks";
import { useChatLinkPreviews, type ChatLinkPreview } from "@/features/chat/chatThreadPreviews";
import { startOutgoingCall } from "@/features/calls/videoCallSession";
import { apiLiveStreams } from "@/features/feed/feedApi";
import { liveEndedKeys, parseLiveStartedCard } from "@/features/feed/livePresence";
import { isRecord } from "@/lib/isRecord";
import { INBOX_HOME, inboxReturnState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { wsClient } from "@/lib/wsClient";
import { useAuthStore } from "@/store/useAuthStore";

type LiveChip = { roomKey: string; userId: string; name: string; avatar: string };

function MessageBody({
  text,
  isMe,
  onAppPath,
}: {
  text: string;
  isMe: boolean;
  onAppPath: (path: string) => void;
}) {
  const parts = splitChatBody(text);
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === "app") {
          return (
            <button
              key={`${part.path}-${index}`}
              type="button"
              onClick={() => onAppPath(part.path)}
              className={`underline font-medium ${isMe ? "text-black/80" : "text-[#F5F5F7]"}`}
            >
              {part.label}
            </button>
          );
        }
        if (part.kind === "url") {
          return (
            <a
              key={`${part.href}-${index}`}
              href={part.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`underline ${isMe ? "text-black/70" : "text-[#F5F5F7]/80"}`}
            >
              {part.href}
            </a>
          );
        }
        return <span key={`t-${index}`}>{part.text}</span>;
      })}
    </>
  );
}

function mapLiveChips(
  streams: Array<{
    roomId: string;
    hostId: string;
    displayName: string;
    username: string;
    avatarUrl: string | null;
    title: string;
  }>,
  viewerId: string,
): LiveChip[] {
  const seen = new Set<string>();
  const list: LiveChip[] = [];
  for (const stream of streams) {
    const roomKey = stream.roomId.trim();
    const userId = stream.hostId.trim();
    if (!roomKey || !userId || userId === viewerId || seen.has(roomKey)) continue;
    seen.add(roomKey);
    list.push({
      roomKey,
      userId,
      name: (stream.displayName || stream.username || stream.title || "Live").trim() || "Live",
      avatar: stream.avatarUrl || "",
    });
  }
  return list;
}

export default function ChatThread() {
  const { threadId = "" } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const sessionRef = useRef(createChatThreadSession());
  const session = sessionRef.current;
  const snap = useChatThreadSession(session);
  const viewerId = me?.id || "";
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinToBottomRef = useRef(true);
  const [liveUsers, setLiveUsers] = useState<LiveChip[]>([]);
  const messageBodies = useMemo(() => snap.messages.map((row) => row.body), [snap.messages]);
  const previews = useChatLinkPreviews(messageBodies);

  const refreshLives = useCallback(() => {
    if (!viewerId) return;
    void apiLiveStreams().then(({ streams, error }) => {
      if (error) return;
      setLiveUsers(mapLiveChips(streams, viewerId));
    });
  }, [viewerId]);

  useEffect(() => {
    if (!viewerId || !threadId) return;
    pinToBottomRef.current = true;
    void session.open(viewerId, threadId).then(() => {
      const after = session.getSnapshot();
      if (after.error) showToast(after.error);
      if (after.markError) showToast(after.markError);
    });
    const onDm = (data: unknown) => {
      session.applyDmMessage(data);
    };
    const onConnected = () => {
      void session.reconcile();
      refreshLives();
    };
    const onStarted = (data: unknown) => {
      const card = parseLiveStartedCard(data, Date.now());
      if (!card) return;
      setLiveUsers((prev) => {
        const next = mapLiveChips([card], viewerId);
        if (next.length === 0) return prev;
        const byRoom = new Map(prev.map((row) => [row.roomKey, row]));
        for (const row of next) byRoom.set(row.roomKey, row);
        return [...byRoom.values()];
      });
    };
    const onEnded = (data: unknown) => {
      const roomId =
        isRecord(data) && typeof data.roomId === "string" && data.roomId.trim()
          ? data.roomId.trim()
          : liveEndedKeys(data)[0] || "";
      if (!roomId) return;
      setLiveUsers((prev) => prev.filter((row) => row.roomKey !== roomId));
    };
    wsClient.on("dm_message", onDm);
    wsClient.on("connected", onConnected);
    wsClient.on("stream_started", onStarted);
    wsClient.on("stream_ended", onEnded);
    refreshLives();
    return () => {
      wsClient.off("dm_message", onDm);
      wsClient.off("connected", onConnected);
      wsClient.off("stream_started", onStarted);
      wsClient.off("stream_ended", onEnded);
      session.dispose();
    };
  }, [session, viewerId, threadId, refreshLives]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [snap.messages]);

  const otherName = (snap.thread?.otherDisplayName || snap.thread?.otherUsername || "Chat").trim() || "Chat";
  const otherUserId = snap.thread?.otherUserId || "";
  const otherAvatar = snap.thread?.otherAvatarUrl || "";
  const otherLevel = snap.thread?.otherLevel || 1;
  const threadBlocked = snap.thread?.blocked === true;
  const canSend = snap.thread?.canSend === true;
  const myLevel = me?.level && me.level > 0 ? me.level : 1;

  const goInbox = () => {
    navigate(INBOX_HOME, { replace: true });
  };

  const openProfile = (userId: string) => {
    if (!userId) return;
    navigate(`/profile/${userId}`, { state: inboxReturnState() });
  };

  const openAppPath = (path: string) => {
    navigate(path, { state: inboxReturnState() });
  };

  const openWatchLive = (roomKey: string) => {
    navigate(`/watch/${encodeURIComponent(roomKey)}`, { state: inboxReturnState() });
  };

  const openPreviewMedia = (preview: ChatLinkPreview) => {
    if (preview.type === "video") {
      navigate(`/video/${preview.id}`, { state: inboxReturnState() });
      return;
    }
    openWatchLive(preview.id);
  };

  const handleVideoCall = () => {
    if (!threadId) {
      showToast("Cannot start call");
      return;
    }
    if (!otherUserId) {
      showToast("Cannot start call");
      return;
    }
    if (threadBlocked || !canSend) {
      showToast("Call not allowed");
      return;
    }
    const started = startOutgoingCall({
      threadId,
      calleeId: otherUserId,
      remoteUser: { id: otherUserId, username: otherName, avatar: otherAvatar },
    });
    if (!started.ok) {
      showToast(started.error);
      return;
    }
    navigate("/call");
  };

  return (
    <div
      className="fixed inset-0 flex flex-col w-full max-w-[480px] mx-auto bg-transparent text-white z-[1]"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="flex justify-center pt-2 pb-2 flex-shrink-0" aria-hidden>
        <div className="w-10 h-1 rounded-full bg-white/25" />
      </div>
      <header className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5 bg-transparent">
        <div className="flex w-11 shrink-0 items-center justify-start">
          {otherUserId ? (
            <button
              type="button"
              onClick={handleVideoCall}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-white/[0.06] border border-white/15 active:scale-95 transition-transform"
              aria-label="Video call"
              title="Video call"
            >
              <Video className="w-5 h-5 text-[#F5F5F7]" strokeWidth={2} />
            </button>
          ) : null}
        </div>
        {otherUserId ? (
          <button
            type="button"
            onClick={() => openProfile(otherUserId)}
            className="min-w-0 flex-1 flex justify-center active:opacity-90"
            aria-label={`Open ${otherName}'s profile`}
          >
            <AvatarRing src={otherAvatar} alt={otherName} size={48} />
          </button>
        ) : (
          <span className="flex-1 flex justify-center">
            <AvatarRing src={otherAvatar} alt={otherName} size={48} />
          </span>
        )}
        <div className="flex w-11 shrink-0 items-center justify-end">
          <button
            type="button"
            onClick={goInbox}
            className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Back to inbox"
            title="Back"
          >
            <RoyceBackIcon />
          </button>
        </div>
      </header>

      {otherUserId ? (
        <div className="flex-shrink-0 flex justify-center px-3 pb-2">
          <button
            type="button"
            onClick={() => openProfile(otherUserId)}
            className="min-w-0 max-w-full active:opacity-90"
            aria-label={`Open ${otherName}'s profile`}
          >
            <span className="block truncate text-center font-bold text-sm text-[#F5F5F7]">{otherName}</span>
          </button>
        </div>
      ) : (
        <div className="flex-shrink-0 flex justify-center px-3 pb-2">
          <span className="font-bold text-sm text-[#F5F5F7]">{otherName}</span>
        </div>
      )}

      <div className="mx-4 border-t border-[#D8D9DD]/45 flex-shrink-0" aria-hidden />

      {liveUsers.length > 0 ? (
        <div className="flex-shrink-0 border-b border-white/10 bg-transparent">
          <div
            className="flex gap-3 overflow-x-auto overflow-y-hidden no-scrollbar px-3 py-2"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {liveUsers.map((live) => (
              <button
                key={live.roomKey}
                type="button"
                onClick={() => openWatchLive(live.roomKey)}
                className="flex-shrink-0 flex flex-col items-center gap-1"
                style={{ width: 64, minWidth: 64 }}
              >
                <StoryGoldRingAvatar live size={48} src={live.avatar} alt={live.name} />
                <span className="text-[10px] text-white/80 truncate w-full text-center">{live.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 scroll-smooth"
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          pinToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {snap.phase === "loading" && snap.messages.length === 0 ? (
          <div className="text-center text-white/40 text-sm py-8">Loading messages...</div>
        ) : null}
        {snap.phase === "error" && snap.messages.length === 0 ? (
          <div className="text-center text-rose-300 text-sm py-8 px-6">{snap.error || "Could not load messages"}</div>
        ) : null}
        {snap.phase === "ready" && snap.messages.length === 0 ? (
          <div className="h-full min-h-[40vh] flex items-center justify-center">
            <p className="text-center text-white/45 text-sm px-6">Start the conversation!</p>
          </div>
        ) : null}
        {snap.messages.map((message) => {
          const isMe = message.senderId === me?.id;
          const senderName = isMe ? me?.displayName || me?.username || "You" : otherName;
          const senderAvatar = isMe ? me?.avatarUrl || "" : otherAvatar;
          const senderLevel = isMe ? myLevel : otherLevel;
          const senderId = isMe ? me?.id || "" : otherUserId;
          const share = firstAppShare(message.body);
          const preview: ChatLinkPreview | null = share
            ? previews[`${share.type}:${share.id}`] ?? { type: share.type, id: share.id }
            : null;
          return (
            <div key={message.id} className="flex flex-col gap-1 items-start">
              <button
                type="button"
                onClick={() => senderId && openProfile(senderId)}
                className="flex items-center gap-2 min-w-0 self-start active:opacity-90"
                aria-label={`Open ${senderName}'s profile`}
              >
                <LevelBadge
                  level={senderLevel}
                  avatar={senderAvatar}
                  name={senderName}
                  circleSize={30}
                  size={16}
                />
                <span className="text-[#F5F5F7] font-semibold text-[11px] leading-none truncate">{senderName}</span>
              </button>
              <div className="max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-snug break-words bg-transparent text-white rounded-tl-none border border-white/25">
                {preview && preview.type === "profile" ? (
                  <button
                    type="button"
                    onClick={() => openProfile(preview.id)}
                    className="flex items-center gap-2.5 active:scale-[0.98] transition-transform text-left"
                  >
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-black/20 flex-shrink-0">
                      {preview.thumbnail ? (
                        <img src={preview.thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div
                          className={`w-full h-full flex items-center justify-center text-xs font-bold ${isMe ? "text-black/60" : "text-white/60"}`}
                        >
                          {(preview.username || "U").slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-bold truncate ${isMe ? "text-black" : "text-white"}`}>
                        {preview.username || "Profile"}
                      </p>
                      <span className={`text-[11px] ${isMe ? "text-black/50" : "text-white/40"}`}>Tap to view profile</span>
                    </div>
                  </button>
                ) : preview ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => openPreviewMedia(preview)}
                      className="w-full rounded-lg overflow-hidden mb-1.5 active:scale-[0.98] transition-transform text-left"
                    >
                      <div className="relative w-full aspect-video bg-black/30 rounded-lg overflow-hidden">
                        {preview.thumbnail ? (
                          <img src={preview.thumbnail} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {preview.type === "live" ? (
                              <Radio size={28} className={isMe ? "text-black/40" : "text-white/40"} />
                            ) : (
                              <Play size={28} className={isMe ? "text-black/40" : "text-white/40"} />
                            )}
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${isMe ? "bg-black/30" : "bg-white/20"}`}
                          >
                            {preview.type === "live" ? (
                              <Radio size={18} className="text-white" />
                            ) : (
                              <Play size={18} className="text-white" fill="white" />
                            )}
                          </div>
                        </div>
                        {preview.type === "live" ? (
                          <div className="absolute top-2 left-2 px-2 py-0.5 bg-white/20 rounded text-[10px] font-bold text-white">
                            LIVE
                          </div>
                        ) : null}
                      </div>
                      {preview.username || preview.description ? (
                        <div className="mt-1.5 px-0.5">
                          {preview.username ? (
                            <p className={`text-xs font-semibold ${isMe ? "text-black/70" : "text-white/70"}`}>
                              @{preview.username}
                            </p>
                          ) : null}
                          {preview.description ? (
                            <p className={`text-xs mt-0.5 line-clamp-2 ${isMe ? "text-black/50" : "text-white/50"}`}>
                              {preview.description}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </button>
                    <span className={`text-[11px] ${isMe ? "text-black/50" : "text-white/40"}`}>
                      Tap to {preview.type === "live" ? "join live" : "watch video"}
                    </span>
                  </div>
                ) : (
                  <MessageBody text={message.body} isMe={isMe} onAppPath={openAppPath} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="flex-shrink-0 px-3 pt-2 bg-transparent border-t border-white/10"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}
      >
        <form
          className="flex items-center gap-2 rounded-full px-3 py-2 border border-white/15 bg-white/[0.06]"
          onSubmit={(event) => {
            event.preventDefault();
            pinToBottomRef.current = true;
            void session.send().then(() => {
              const after = session.getSnapshot();
              if (after.sendError) showToast(after.sendError);
            });
          }}
        >
          <input
            value={snap.draft}
            onChange={(event) => session.setDraft(event.target.value)}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-white placeholder-white/40"
            placeholder="Type a message..."
            aria-label="Message"
          />
          <button
            type="submit"
            disabled={!canSend || threadBlocked || !snap.draft.trim() || snap.sending}
            title="Send message"
            aria-label="Send message"
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-transparent text-[#F5F5F7] disabled:opacity-40 active:scale-95 transition-transform"
          >
            <Send size={16} strokeWidth={2.25} />
          </button>
        </form>
      </div>
    </div>
  );
}
