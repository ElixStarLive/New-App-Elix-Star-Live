import { useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Send, Video } from "lucide-react";
import { RoyceBackIcon } from "@/components/royce";
import { AvatarRing } from "@/components/AvatarRing";
import { LevelBadge } from "@/components/LevelBadge";
import { createChatThreadSession } from "@/features/chat/chatThreadSession";
import { useChatThreadSession } from "@/features/chat/useChatThreadSession";
import { splitChatBody } from "@/features/chat/chatThreadLinks";
import { startOutgoingCall } from "@/features/calls/videoCallSession";
import { INBOX_HOME, inboxReturnState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { wsClient } from "@/lib/wsClient";
import { useAuthStore } from "@/store/useAuthStore";

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
    };
    wsClient.on("dm_message", onDm);
    wsClient.on("connected", onConnected);
    return () => {
      wsClient.off("dm_message", onDm);
      wsClient.off("connected", onConnected);
      session.dispose();
    };
  }, [session, viewerId, threadId]);

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
          return (
            <div key={message.id} className="flex flex-col gap-1 items-start">
              <button
                type="button"
                onClick={() => senderId && openProfile(senderId)}
                className="flex items-center gap-2 min-w-0 self-start active:opacity-90"
                aria-label={`Open ${senderName}'s profile`}
              >
                <AvatarRing src={senderAvatar} alt={senderName} size={30} />
                <LevelBadge level={senderLevel} circleSize={30} size={16} />
                <span className="text-[#F5F5F7] font-semibold text-[11px] leading-none truncate">{senderName}</span>
              </button>
              <div className="max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-snug break-words bg-transparent text-white rounded-tl-none border border-white/25">
                <MessageBody text={message.body} isMe={isMe} onAppPath={openAppPath} />
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
