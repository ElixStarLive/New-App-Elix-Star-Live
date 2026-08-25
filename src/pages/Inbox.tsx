import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Bell, ChevronRight, Gift, Heart, Search, ShoppingBag, Trash2, UserPlus } from "lucide-react";
import { AvatarRing } from "@/components/AvatarRing";
import { nativeConfirm } from "@/components/NativeDialog";
import { RoyceBackIcon } from "@/components/royce";
import { StoryGoldRingAvatar } from "@/components/StoryGoldRingAvatar";
import type { ChatThread } from "@/features/chat/chatApi";
import { liveEndedKeys, parseLiveStartedCard } from "@/features/feed/livePresence";
import { InboxActivityOverlay } from "@/features/inbox/InboxActivityOverlay";
import { createInboxSession } from "@/features/inbox/inboxSession";
import { inboxMessagePreview, inboxTimeAgo } from "@/features/inbox/inboxPreview";
import { useInboxSession } from "@/features/inbox/useInboxSession";
import { isRecord } from "@/lib/isRecord";
import { FEED_HOME, inboxReturnState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { wsClient } from "@/lib/wsClient";
import { useAuthStore } from "@/store/useAuthStore";

const DEFAULT_AVATAR = "/royce/default-avatar.svg";

function threadName(row: ChatThread): string {
  return (row.otherDisplayName || row.otherUsername).trim();
}

export default function Inbox() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const sessionRef = useRef(createInboxSession());
  const session = sessionRef.current;
  const snap = useInboxSession(session);
  const viewerId = me?.id || "";

  useEffect(() => {
    if (!viewerId) return;
    void session.load(viewerId).then(() => {
      const after = session.getSnapshot();
      if (after.threadsError) showToast(after.threadsError);
      if (after.followersError) showToast(after.followersError);
      if (after.circlesError) showToast(after.circlesError);
      if (after.activityError) showToast(after.activityError);
      if (after.noticesError) showToast(after.noticesError);
      if (after.liveShareError) showToast(after.liveShareError);
    });
    return () => {
      session.dispose();
    };
  }, [session, viewerId]);

  useEffect(() => {
    const onDm = () => {
      void session.reloadThreads();
    };
    const onStarted = (data: unknown) => {
      const card = parseLiveStartedCard(data, Date.now());
      if (!card) return;
      session.applyStreamStarted(card.hostId, card.roomId);
    };
    const onEnded = (data: unknown) => {
      const roomId =
        isRecord(data) && typeof data.roomId === "string" && data.roomId.trim()
          ? data.roomId.trim()
          : liveEndedKeys(data)[0] || "";
      session.applyStreamEnded("", roomId);
    };
    wsClient.on("dm_message", onDm);
    wsClient.on("dm_thread_updated", onDm);
    wsClient.on("stream_started", onStarted);
    wsClient.on("stream_ended", onEnded);
    return () => {
      wsClient.off("dm_message", onDm);
      wsClient.off("dm_thread_updated", onDm);
      wsClient.off("stream_started", onStarted);
      wsClient.off("stream_ended", onEnded);
    };
  }, [session]);

  const liveUserIds = new Set(snap.liveUserIds);
  const followersCount = snap.followers.length;
  const suggested = snap.circles.filter((row) => !snap.followers.some((fan) => fan.id === row.id));
  const unreadThreads = snap.threads.filter((row) => row.unread);

  const openUserOrLive = (userId: string, isLive: boolean, roomId?: string | null) => {
    navigate(isLive ? `/watch/${encodeURIComponent(roomId || userId)}` : `/profile/${userId}`, {
      state: inboxReturnState(),
    });
  };

  const deleteConversation = async (threadId: string) => {
    const ok = await nativeConfirm("Delete this conversation? Messages will be removed.", "Delete Conversation");
    if (!ok) return;
    const res = await session.deleteThread(threadId);
    if (!res.ok) showToast(res.error === "busy" ? "Could not delete" : res.error);
  };

  const filterClass = (active: boolean) =>
    `px-2 py-1.5 text-xs font-bold whitespace-nowrap bg-transparent border-0 ${
      active ? "text-gold-bright" : "text-gold-bright/45"
    }`;

  return (
    <div className="page-above-bottom-nav bg-transparent z-[1]">
      <div className="page-above-bottom-nav__inner bg-transparent flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto bg-transparent">
          <div className="px-3 pt-page-header pb-1 flex items-center justify-between relative bg-transparent">
            <div className="flex items-center gap-3 z-10">
              <button type="button" onClick={() => navigate("/search", { state: inboxReturnState() })} aria-label="Search">
                <Search size={18} className="text-gold-bright" />
              </button>
            </div>
            <h1 className="text-sm font-bold text-gold-bright absolute left-1/2 transform -translate-x-1/2">Inbox</h1>
            <button
              type="button"
              onClick={() => navigate(FEED_HOME, { replace: true })}
              className="p-1 z-10"
              title="Close"
              aria-label="Close inbox and go to For You"
            >
              <RoyceBackIcon />
            </button>
          </div>

          <div className="px-3 pb-2 bg-transparent" style={{ marginTop: "4mm" }}>
            <div className="flex gap-3 overflow-x-auto overflow-y-hidden no-scrollbar pt-3" style={{ WebkitOverflowScrolling: "touch" }}>
              <button
                type="button"
                onClick={() => session.openFollowersPanel()}
                className="flex-shrink-0 flex flex-col items-center gap-1"
                style={{ width: 95, minWidth: 95 }}
              >
                <StoryGoldRingAvatar
                  data-avatar-circle="followers"
                  alt="Followers"
                  src={snap.followers[0]?.avatarUrl || me?.avatarUrl || DEFAULT_AVATAR}
                />
                <div className="text-[11px] text-gold-bright/80 truncate w-full text-center">Followers</div>
                <div className="text-[10px] text-[#F5F5F7]/90 truncate w-full text-center">{followersCount}</div>
              </button>
              {suggested.map((user) => {
                const live = liveUserIds.has(user.id) || user.isLive;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => openUserOrLive(user.id, live, user.roomId)}
                    className="flex-shrink-0 flex flex-col items-center gap-1"
                    style={{ width: 95, minWidth: 95 }}
                  >
                    <StoryGoldRingAvatar
                      live={live}
                      data-avatar-circle={live ? "live" : undefined}
                      src={user.avatarUrl || DEFAULT_AVATAR}
                      alt={user.displayName || user.username}
                    />
                    <div className="text-[11px] text-gold-bright/80 truncate w-full text-center">
                      {user.displayName || user.username}
                    </div>
                  </button>
                );
              })}
              {snap.followers.map((fan) => {
                const live = liveUserIds.has(fan.id) || Boolean(fan.isLive);
                return (
                  <button
                    key={fan.id}
                    type="button"
                    onClick={() => openUserOrLive(fan.id, live)}
                    className="flex-shrink-0 flex flex-col items-center gap-1"
                    style={{ width: 95, minWidth: 95 }}
                  >
                    <StoryGoldRingAvatar
                      live={live}
                      data-avatar-circle={live ? "live" : undefined}
                      src={fan.avatarUrl || DEFAULT_AVATAR}
                      alt={fan.displayName || fan.username}
                    />
                    <div className="text-[11px] text-gold-bright/80 truncate w-full text-center">
                      {fan.displayName || fan.username}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="pl-[calc(1rem+22mm)] pr-4 py-2 flex items-center justify-center gap-3 overflow-x-auto no-scrollbar mb-2 bg-transparent"
            style={{ marginLeft: "-20mm" }}
          >
            <button type="button" onClick={() => session.setFilter("main")} className={filterClass(snap.filter === "main")}>
              Main
            </button>
            <button type="button" onClick={() => session.setFilter("requests")} className={filterClass(snap.filter === "requests")}>
              Requests
            </button>
            <button type="button" onClick={() => session.setFilter("unread")} className={filterClass(snap.filter === "unread")}>
              Unread
            </button>
            <button type="button" onClick={() => session.setFilter("starred")} className={filterClass(snap.filter === "starred")}>
              Starred
            </button>
            <button type="button" onClick={() => session.requestActivityOverlay()} className={filterClass(snap.activityOverlayRequested)}>
              Activity
            </button>
          </div>

          <div className="px-4 py-1 space-y-4 bg-transparent pb-4">
            {snap.filter === "main" && (
              <>
                <button
                  type="button"
                  onClick={() => session.openFollowersPanel()}
                  className="flex items-center gap-3 w-full text-left py-2 px-2 bg-transparent"
                >
                  <div className="relative w-12 h-12 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 royce-tile">
                    <UserPlus className="w-6 h-6 royce-icon-gold relative z-10" strokeWidth={2} style={{ transform: "translate(0.5mm, -0.5mm)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-gold-metallic">New followers</h3>
                    <p className="text-gold-bright/70 text-xs truncate">
                      {followersCount === 0 ? "No new followers yet" : `${followersCount} people follow you`}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#F5F5F7]/70 flex-shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => session.requestActivityOverlay()}
                  className="flex items-center gap-3 w-full text-left py-2 px-2 bg-transparent"
                >
                  <div className="relative w-12 h-12 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 royce-tile">
                    <Heart className="w-6 h-6 text-red-500 relative z-10" strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-gold-metallic">Activity</h3>
                    <p className="text-gold-bright text-xs truncate">
                      {snap.activityTotal > 0 ? `${snap.activityTotal} likes, comments & saves` : "No recent activity"}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#F5F5F7]/70 flex-shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => session.openGiftsPanel()}
                  className="flex items-center gap-3 w-full text-left py-2 px-2 bg-transparent"
                >
                  <div className="relative w-12 h-12 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 royce-tile">
                    <Gift className="w-6 h-6 text-[#F5F5F7] relative z-10" strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-gold-metallic">Gift received</h3>
                    <p className="text-gold-bright text-xs truncate">
                      {snap.giftCount > 0
                        ? `${snap.giftCount} gift${snap.giftCount === 1 ? "" : "s"} received`
                        : "No gifts received yet"}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#F5F5F7]/70 flex-shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/alerts", { state: inboxReturnState() })}
                  className="flex items-center gap-3 w-full text-left py-2 px-2 bg-transparent"
                >
                  <div className="relative w-12 h-12 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 royce-tile">
                    <Bell className="w-6 h-6 text-[#F5F5F7] relative z-10" strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-gold-metallic">Alerts</h3>
                    <p className="text-gold-bright text-xs truncate">
                      {snap.alertCount > 0 ? `${snap.alertCount} alert${snap.alertCount === 1 ? "" : "s"}` : "No alerts yet"}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#F5F5F7]/70 flex-shrink-0" />
                </button>

                <div className="space-y-1 pt-2" style={{ marginTop: "-5mm" }}>
                  <h3 className="font-bold text-sm text-gold-metallic px-1 pb-2">Messages</h3>
                  {snap.phase === "error" && snap.threads.length === 0 ? (
                    <p className="text-rose-300 text-xs px-1 py-2">{snap.threadsError || "Could not load messages"}</p>
                  ) : snap.phase === "loading" && snap.threads.length === 0 ? null : snap.threads.length === 0 ? (
                    <p className="text-gold-bright/50 text-xs px-1 py-2">No messages yet</p>
                  ) : (
                    snap.threads.map((conv) => (
                      <div key={conv.id} className="flex items-center gap-3 py-2 px-2 bg-transparent group">
                        <button
                          type="button"
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                          onClick={() => navigate(`/inbox/${conv.id}`)}
                        >
                          <AvatarRing src={conv.otherAvatarUrl || ""} alt={threadName(conv)} size={48} />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-gold-bright truncate flex items-center gap-1.5">
                              {threadName(conv)}
                              {conv.unread ? (
                                <span className="inline-block w-2 h-2 rounded-full bg-[#E6E9EE] flex-shrink-0" title="Unread" aria-label="Unread messages" />
                              ) : null}
                            </p>
                            <p className="text-gold-bright/60 text-xs truncate">{inboxMessagePreview(conv.lastMessage)}</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void deleteConversation(conv.id);
                          }}
                          className="w-10 h-10 rounded-full bg-transparent border border-[#D8D9DD]/40 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform hover:border-[#D8D9DD]/50 hover:bg-transparent"
                          title="Delete conversation"
                          aria-label="Delete conversation"
                          disabled={snap.deleteBusyId === conv.id}
                        >
                          <Trash2 size={18} className="text-[#F5F5F7]/90 hover:text-gold-bright/60" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {snap.filter === "unread" && (
              <div className="space-y-1 pt-2">
                <h3 className="font-bold text-sm text-gold-metallic px-1 pb-2">Unread messages</h3>
                <p className="text-gold-bright/45 text-[11px] px-1 pb-3 leading-snug">
                  Chats appear here when someone messaged you and you haven’t opened the conversation yet. Opening a chat marks those messages as read.
                </p>
                {snap.phase === "error" && snap.threads.length === 0 ? (
                  <p className="text-rose-300 text-xs px-1 py-2">{snap.threadsError || "Could not load messages"}</p>
                ) : unreadThreads.length === 0 && snap.phase !== "loading" ? (
                  <p className="text-gold-bright/50 text-xs px-1 py-2">You’re all caught up.</p>
                ) : (
                  unreadThreads.map((conv) => (
                    <div key={conv.id} className="flex items-center gap-3 py-2 px-2 bg-transparent group">
                      <button
                        type="button"
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        onClick={() => navigate(`/inbox/${conv.id}`)}
                      >
                        <AvatarRing src={conv.otherAvatarUrl || ""} alt={threadName(conv)} size={48} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gold-bright truncate">{threadName(conv)}</p>
                          <p className="text-gold-bright/60 text-xs truncate">
                            {conv.unreadCount > 1
                              ? `${conv.unreadCount} unread · ${inboxMessagePreview(conv.lastMessage)}`
                              : conv.lastMessage
                                ? `Unread · ${inboxMessagePreview(conv.lastMessage)}`
                                : "Unread — tap to open"}
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void deleteConversation(conv.id);
                        }}
                        className="w-10 h-10 rounded-full bg-transparent border border-[#D8D9DD]/40 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform hover:border-[#D8D9DD]/50 hover:bg-transparent"
                        title="Delete conversation"
                        aria-label="Delete conversation"
                        disabled={snap.deleteBusyId === conv.id}
                      >
                        <Trash2 size={18} className="text-[#F5F5F7]/90 hover:text-gold-bright/60" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {snap.filter === "requests" && (
              <div className="space-y-1 pt-2">
                <h3 className="font-bold text-sm text-gold-metallic px-1 pb-2">Requests</h3>
                <p className="text-gold-bright/45 text-[11px] px-1 pb-3 leading-snug">
                  Live shares from people you don’t follow yet.
                </p>
                {snap.liveShareError && snap.liveShares.length === 0 ? (
                  <p className="text-rose-300 text-xs px-1 py-2">{snap.liveShareError}</p>
                ) : snap.liveShares.length === 0 ? (
                  <p className="text-gold-bright/50 text-xs px-1 py-2">No live shares right now.</p>
                ) : (
                  snap.liveShares.map((row) => {
                    const who = row.sharerName.trim() || "Someone";
                    const hostLabel = row.hostName.trim() || "a creator";
                    return (
                      <button
                        key={`${row.sharerId}_${row.streamKey}`}
                        type="button"
                        onClick={() => {
                          if (row.streamKey) {
                            navigate(`/watch/${encodeURIComponent(row.streamKey)}`, { state: inboxReturnState() });
                          }
                        }}
                        className="flex items-center gap-3 w-full text-left py-2.5 px-2 bg-transparent"
                      >
                        <AvatarRing src={row.sharerAvatar || ""} alt={who} size={48} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gold-bright truncate">{who}</p>
                          <p className="text-gold-bright/70 text-xs truncate">
                            Shared {hostLabel}&apos;s live with you · Tap to watch
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {snap.filter === "starred" && (
              <div className="py-8 text-center text-gold-bright/50 text-sm">No starred messages yet.</div>
            )}

            {snap.filter === "main" && snap.shop.length > 0 && (
              <div className="rounded-2xl border border-[#D8D9DD]/25 overflow-hidden mt-1">
                <div className="px-3 py-2 border-b border-[#D8D9DD]/15">
                  <h3 className="font-bold text-sm text-gold-metallic">Shop</h3>
                </div>
                <div className="px-1 py-1 space-y-0.5">
                  {snap.shop.map((notif) => (
                    <button
                      key={notif.id}
                      type="button"
                      onClick={() => navigate("/shop", { state: inboxReturnState() })}
                      className="flex items-center gap-3 w-full text-left py-2 px-2"
                    >
                      <div className="w-12 h-12 rounded-full bg-transparent border border-[#D8D9DD]/40 flex items-center justify-center">
                        <ShoppingBag className="w-6 h-6 text-[#F5F5F7]" strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-sm text-gold-metallic">{notif.title}</h3>
                        <p className="text-gold-bright text-xs truncate">{notif.body}</p>
                      </div>
                      <span className="text-[10px] text-gold-bright">{notif.createdAt ? inboxTimeAgo(notif.createdAt) : ""}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {snap.showFollowersPanel
        ? createPortal(
            <div className="page-above-bottom-nav bg-transparent z-[101] pointer-events-auto">
              <div className="page-above-bottom-nav__inner bg-transparent flex flex-col min-h-0">
                <div className="flex-1 min-h-0 overflow-y-auto bg-transparent new-followers-panel-scroll">
                  <div className="px-3 pt-page-header pb-1 flex items-center justify-between relative bg-transparent">
                    <div className="w-8" aria-hidden />
                    <h2 className="text-sm font-bold text-gold-bright absolute left-1/2 transform -translate-x-1/2">
                      Followers ({followersCount})
                    </h2>
                    <button type="button" onClick={() => session.closeFollowersPanel()} className="p-1 z-10" title="Close" aria-label="Close followers">
                      <RoyceBackIcon />
                    </button>
                  </div>
                  {snap.followers.length === 0 ? (
                    <p className="text-gold-bright/50 text-sm py-6 text-center px-4">
                      No one follows you yet. When they do, they’ll show here.
                    </p>
                  ) : (
                    <div className="space-y-0.5 pb-4 px-4 bg-transparent">
                      {snap.followers.map((fan) => {
                        const name = fan.displayName || fan.username;
                        return (
                          <div key={fan.id} className="flex items-center gap-2 w-full py-2.5 px-0 bg-transparent">
                            <button
                              type="button"
                              className="flex items-center gap-3 flex-1 min-w-0 text-left bg-transparent"
                              onClick={() => {
                                session.closeFollowersPanel();
                                navigate(`/profile/${fan.id}`, { state: inboxReturnState() });
                              }}
                            >
                              <div className="relative w-11 h-11 rounded-full bg-transparent flex items-center justify-center overflow-hidden flex-shrink-0">
                                {fan.avatarUrl ? (
                                  <img src={fan.avatarUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[#F5F5F7] font-bold text-lg">{name.charAt(0).toUpperCase()}</span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm text-gold-bright truncate">{name}</p>
                                <p className="text-gold-bright/60 text-xs truncate">@{fan.username}</p>
                              </div>
                            </button>
                            {viewerId && fan.id !== viewerId ? (
                              <button
                                type="button"
                                disabled={snap.followBusyId === fan.id}
                                onClick={() => {
                                  void session.toggleFollow(fan.id).then((res) => {
                                    if (!res.ok && res.error !== "busy") showToast(res.error);
                                  });
                                }}
                                className={`shrink-0 px-2 py-1.5 text-xs font-bold bg-transparent border-0 ${
                                  fan.isFollowing ? "text-gold-bright/45" : "text-gold-bright"
                                }`}
                              >
                                {fan.isFollowing ? "Following" : "Follow"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="p-1 flex-shrink-0 bg-transparent"
                              onClick={() => {
                                session.closeFollowersPanel();
                                navigate(`/profile/${fan.id}`, { state: inboxReturnState() });
                              }}
                              aria-label="Open profile"
                            >
                              <ChevronRight className="w-5 h-5 text-gold-bright/70" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {snap.showGiftsPanel
        ? createPortal(
            <div className="page-above-bottom-nav bg-transparent z-[101] pointer-events-auto">
              <div className="page-above-bottom-nav__inner bg-transparent flex flex-col min-h-0">
                <div className="flex-1 min-h-0 overflow-y-auto bg-transparent">
                  <div className="px-3 pt-page-header pb-1 flex items-center justify-between relative bg-transparent">
                    <div className="w-8" aria-hidden />
                    <h2 className="text-sm font-bold text-gold-bright absolute left-1/2 transform -translate-x-1/2">Gift received</h2>
                    <button type="button" onClick={() => session.closeGiftsPanel()} className="p-1 z-10" title="Close" aria-label="Close gifts">
                      <RoyceBackIcon />
                    </button>
                  </div>
                  {snap.gifts.length === 0 ? (
                    <p className="text-gold-bright/50 text-sm py-6 text-center px-4">
                      No gifts received yet. When someone sends you a gift, it will show here with their name and photo.
                    </p>
                  ) : (
                    <div className="space-y-0.5 pb-4 px-4 bg-transparent">
                      {snap.gifts.map((notif) => (
                        <button
                          key={notif.id}
                          type="button"
                          onClick={() => {
                            session.closeGiftsPanel();
                            if (notif.actionUrl) navigate(notif.actionUrl, { state: inboxReturnState() });
                          }}
                          className="flex items-center gap-3 w-full text-left py-2.5 px-0 bg-transparent"
                        >
                          <AvatarRing src={notif.imageUrl || "/elix-logo.png"} alt={notif.title} size={48} />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-gold-bright truncate">{notif.title}</p>
                            <p className="text-gold-bright/70 text-xs truncate">{notif.body}</p>
                          </div>
                          <span className="text-[10px] text-gold-bright flex-shrink-0">
                            {notif.createdAt ? inboxTimeAgo(notif.createdAt) : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <InboxActivityOverlay
        open={snap.activityOverlayRequested}
        items={snap.activityItems}
        error={snap.activityError}
        loading={snap.phase === "loading" && snap.activityItems.length === 0}
        onClose={() => session.clearActivityOverlayRequest()}
        onOpenVideo={(videoId) => {
          session.clearActivityOverlayRequest();
          navigate(`/video/${encodeURIComponent(videoId)}`, { state: inboxReturnState() });
        }}
      />
    </div>
  );
}
