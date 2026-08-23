import type { InboxActivityItem, InboxCircle, InboxLiveShare, InboxNotice, UserPublic } from "@shared/contracts";
import type { ChatThread } from "@/features/chat/chatApi";
import { apiDeleteChatThread, apiListChatThreads } from "@/features/chat/chatApi";
import { apiFetchFollowers, apiFollowFollowerRow, apiUnfollowFollowerRow } from "@/features/profile/followersApi";
import {
  apiListInboxActivity,
  apiListInboxCircles,
  apiListInboxNotices,
  apiListLiveShareRequests,
  apiMarkInboxNoticesRead,
} from "./inboxApi";

export type InboxFilter = "main" | "requests" | "unread" | "starred";
export type InboxPhase = "idle" | "loading" | "ready" | "error";

export type InboxSnapshot = {
  phase: InboxPhase;
  viewerId: string;
  filter: InboxFilter;
  threads: ChatThread[];
  threadsError: string | null;
  followers: UserPublic[];
  followersError: string | null;
  circles: InboxCircle[];
  circlesError: string | null;
  activityItems: InboxActivityItem[];
  activityTotal: number;
  activityError: string | null;
  gifts: InboxNotice[];
  giftCount: number;
  shop: InboxNotice[];
  alerts: InboxNotice[];
  alertCount: number;
  noticesError: string | null;
  liveShares: InboxLiveShare[];
  liveShareError: string | null;
  liveUserIds: string[];
  liveRoomIds: string[];
  showFollowersPanel: boolean;
  showGiftsPanel: boolean;
  activityOverlayRequested: boolean;
  followBusyId: string | null;
  deleteBusyId: string | null;
};

type Listener = () => void;

const empty: InboxSnapshot = {
  phase: "idle",
  viewerId: "",
  filter: "main",
  threads: [],
  threadsError: null,
  followers: [],
  followersError: null,
  circles: [],
  circlesError: null,
  activityItems: [],
  activityTotal: 0,
  activityError: null,
  gifts: [],
  giftCount: 0,
  shop: [],
  alerts: [],
  alertCount: 0,
  noticesError: null,
  liveShares: [],
  liveShareError: null,
  liveUserIds: [],
  liveRoomIds: [],
  showFollowersPanel: false,
  showGiftsPanel: false,
  activityOverlayRequested: false,
  followBusyId: null,
  deleteBusyId: null,
};

function uniq(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export function createInboxSession() {
  let phase: InboxPhase = "idle";
  let viewerId = "";
  let filter: InboxFilter = "main";
  let threads: ChatThread[] = [];
  let threadsError: string | null = null;
  let followers: UserPublic[] = [];
  let followersError: string | null = null;
  let circles: InboxCircle[] = [];
  let circlesError: string | null = null;
  let activityItems: InboxActivityItem[] = [];
  let activityTotal = 0;
  let activityError: string | null = null;
  let gifts: InboxNotice[] = [];
  let giftCount = 0;
  let shop: InboxNotice[] = [];
  let alerts: InboxNotice[] = [];
  let alertCount = 0;
  let noticesError: string | null = null;
  let liveShares: InboxLiveShare[] = [];
  let liveShareError: string | null = null;
  let liveUserIds: string[] = [];
  let liveRoomIds: string[] = [];
  let showFollowersPanel = false;
  let showGiftsPanel = false;
  let activityOverlayRequested = false;
  let followBusyId: string | null = null;
  let deleteBusyId: string | null = null;
  let loadGen = 0;
  let threadGen = 0;
  const listeners = new Set<Listener>();
  let cached: InboxSnapshot = { ...empty };

  const snapshot = (): InboxSnapshot => cached;

  const rebuildLive = (nextUsers: string[], nextRooms: string[]) => {
    liveUserIds = uniq(nextUsers);
    liveRoomIds = uniq(nextRooms);
  };

  const notify = () => {
    cached = {
      phase,
      viewerId,
      filter,
      threads,
      threadsError,
      followers,
      followersError,
      circles,
      circlesError,
      activityItems,
      activityTotal,
      activityError,
      gifts,
      giftCount,
      shop,
      alerts,
      alertCount,
      noticesError,
      liveShares,
      liveShareError,
      liveUserIds,
      liveRoomIds,
      showFollowersPanel,
      showGiftsPanel,
      activityOverlayRequested,
      followBusyId,
      deleteBusyId,
    };
    for (const fn of listeners) fn();
  };

  const refreshLiveFromRows = () => {
    const users: string[] = [];
    const rooms: string[] = [];
    for (const row of circles) {
      if (row.isLive) {
        users.push(row.id);
        if (row.roomId) rooms.push(row.roomId);
      }
    }
    for (const row of followers) {
      if (row.isLive) users.push(row.id);
    }
    rebuildLive(users, rooms);
  };

  return {
    subscribe(fn: Listener) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getSnapshot: snapshot,
    setFilter(next: InboxFilter) {
      filter = next;
      notify();
    },
    openFollowersPanel() {
      showFollowersPanel = true;
      showGiftsPanel = false;
      activityOverlayRequested = false;
      notify();
    },
    closeFollowersPanel() {
      showFollowersPanel = false;
      notify();
    },
    openGiftsPanel() {
      showGiftsPanel = true;
      showFollowersPanel = false;
      activityOverlayRequested = false;
      notify();
    },
    closeGiftsPanel() {
      showGiftsPanel = false;
      notify();
    },
    requestActivityOverlay() {
      activityOverlayRequested = true;
      showFollowersPanel = false;
      showGiftsPanel = false;
      notify();
    },
    clearActivityOverlayRequest() {
      activityOverlayRequested = false;
      notify();
    },
    applyStreamStarted(userId: string, roomId: string) {
      if (!userId && !roomId) return;
      const nextUsers = userId ? [...liveUserIds, userId] : liveUserIds;
      const nextRooms = roomId ? [...liveRoomIds, roomId] : liveRoomIds;
      circles = circles.map((row) =>
        row.id === userId ? { ...row, isLive: true, roomId: roomId || row.roomId } : row,
      );
      followers = followers.map((row) => (row.id === userId ? { ...row, isLive: true } : row));
      rebuildLive(nextUsers, nextRooms);
      notify();
    },
    applyStreamEnded(userId: string, roomId: string) {
      circles = circles.map((row) => {
        if (row.id === userId || (roomId && row.roomId === roomId)) {
          return { ...row, isLive: false, roomId: null };
        }
        return row;
      });
      followers = followers.map((row) =>
        row.id === userId ? { ...row, isLive: false } : row,
      );
      liveUserIds = liveUserIds.filter((id) => id !== userId);
      liveRoomIds = liveRoomIds.filter((id) => id !== roomId);
      if (roomId) {
        alerts = alerts.filter((row) => !row.actionUrl?.includes(roomId));
        alertCount = Math.min(alertCount, alerts.length);
      }
      notify();
    },
    async load(nextViewerId: string) {
      const gen = ++loadGen;
      const viewerChanged = viewerId !== nextViewerId;
      viewerId = nextViewerId;
      phase = "loading";
      threadGen += 1;
      threadsError = null;
      followersError = null;
      circlesError = null;
      activityError = null;
      noticesError = null;
      liveShareError = null;
      followBusyId = null;
      deleteBusyId = null;
      // Drop prior viewer rows immediately so A→B never flashes A's DMs/activity.
      if (viewerChanged) {
        threads = [];
        followers = [];
        circles = [];
        activityItems = [];
        activityTotal = 0;
        gifts = [];
        giftCount = 0;
        shop = [];
        alerts = [];
        alertCount = 0;
        liveShares = [];
        liveUserIds = [];
        liveRoomIds = [];
        showFollowersPanel = false;
        showGiftsPanel = false;
        activityOverlayRequested = false;
      }
      notify();
      const [threadRes, followerRes, circleRes, activityRes, noticeRes, shareRes] = await Promise.all([
        apiListChatThreads(),
        apiFetchFollowers(nextViewerId),
        apiListInboxCircles(),
        apiListInboxActivity(),
        apiListInboxNotices(),
        apiListLiveShareRequests(),
      ]);
      if (gen !== loadGen) return;
      if (threadRes.error) {
        threadsError = threadRes.error;
        if (threads.length === 0) phase = "error";
      } else {
        threads = threadRes.threads;
        threadsError = null;
      }
      if (followerRes.error) {
        followersError = followerRes.error;
        if (followers.length === 0 && phase !== "error") {
          /* keep prior followers */
        }
      } else {
        followers = followerRes.users;
        followersError = null;
      }
      if (circleRes.error) circlesError = circleRes.error;
      else {
        circles = circleRes.users;
        circlesError = null;
      }
      if (activityRes.error) activityError = activityRes.error;
      else {
        activityItems = activityRes.items;
        activityTotal = activityRes.total;
        activityError = null;
      }
      if (noticeRes.error) noticesError = noticeRes.error;
      else {
        gifts = noticeRes.gifts;
        giftCount = noticeRes.giftCount;
        shop = noticeRes.shop;
        alerts = noticeRes.alerts;
        alertCount = noticeRes.alertCount;
        noticesError = null;
        if (noticeRes.unreadIds.length > 0) {
          void apiMarkInboxNoticesRead(noticeRes.unreadIds);
        }
      }
      if (shareRes.error) liveShareError = shareRes.error;
      else {
        liveShares = shareRes.items;
        liveShareError = null;
      }
      refreshLiveFromRows();
      phase = threadsError && threads.length === 0 ? "error" : "ready";
      notify();
    },
    async reloadThreads() {
      if (!viewerId) return;
      const gen = ++threadGen;
      const res = await apiListChatThreads();
      if (gen !== threadGen || loadGen === 0) return;
      if (res.error) {
        threadsError = res.error;
        notify();
        return;
      }
      threads = res.threads;
      threadsError = null;
      if (phase === "error" && threads.length > 0) phase = "ready";
      notify();
    },
    async deleteThread(threadId: string) {
      if (!threadId || deleteBusyId) return { ok: false as const, error: "busy" };
      deleteBusyId = threadId;
      notify();
      const res = await apiDeleteChatThread(threadId);
      deleteBusyId = null;
      if (!res.ok) {
        notify();
        return { ok: false as const, error: res.error };
      }
      threads = threads.filter((row) => row.id !== threadId);
      notify();
      return { ok: true as const };
    },
    async toggleFollow(targetId: string) {
      if (!viewerId) return { ok: false as const, error: "Log in to follow" };
      if (targetId === viewerId) return { ok: false as const, error: "busy" };
      if (followBusyId) return { ok: false as const, error: "busy" };
      const row = followers.find((user) => user.id === targetId);
      if (!row) return { ok: false as const, error: "User not found" };
      const was = Boolean(row.isFollowing);
      followBusyId = targetId;
      followers = followers.map((user) => (user.id === targetId ? { ...user, isFollowing: !was } : user));
      notify();
      const res = was ? await apiUnfollowFollowerRow(targetId) : await apiFollowFollowerRow(targetId);
      followBusyId = null;
      if (!res.ok) {
        followers = followers.map((user) => (user.id === targetId ? { ...user, isFollowing: was } : user));
        notify();
        return { ok: false as const, error: res.error };
      }
      notify();
      return { ok: true as const };
    },
    dispose() {
      loadGen += 1;
      threadGen += 1;
      phase = "idle";
      viewerId = "";
      filter = "main";
      threads = [];
      threadsError = null;
      followers = [];
      followersError = null;
      circles = [];
      circlesError = null;
      activityItems = [];
      activityTotal = 0;
      activityError = null;
      gifts = [];
      giftCount = 0;
      shop = [];
      alerts = [];
      alertCount = 0;
      noticesError = null;
      liveShares = [];
      liveShareError = null;
      liveUserIds = [];
      liveRoomIds = [];
      showFollowersPanel = false;
      showGiftsPanel = false;
      activityOverlayRequested = false;
      followBusyId = null;
      deleteBusyId = null;
      notify();
    },
  };
}

export type InboxSession = ReturnType<typeof createInboxSession>;
export { empty as emptyInboxSnapshot };
