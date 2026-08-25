import type { FeedVideo, UserPublic } from "@shared/contracts";
import type { ShopItem } from "@/features/shop/shopApi";
import {
  apiBlockUser,
  apiFetchPublicProfile,
  apiFetchPublicProfileById,
  apiFetchPublicShop,
  apiFetchPublicStories,
  apiFetchPublicTabPage,
  apiFollowPublicUser,
  apiRegisterPublicProfileView,
  apiUnfollowPublicUser,
  type PublicProfileTab,
} from "./publicProfileApi";

export type PublicProfilePhase = "idle" | "loading" | "ready" | "error";

export type PublicStory = { id: string; mediaUrl: string; thumbnailUrl: string | null };

export type PublicProfileSnapshot = {
  phase: PublicProfilePhase;
  error: string | null;
  errorStatus: number | null;
  profile: UserPublic | null;
  stories: PublicStory[];
  tab: PublicProfileTab;
  items: FeedVideo[];
  shopItems: ShopItem[];
  nextCursor: string | null;
  tabLoading: boolean;
  tabLoadingMore: boolean;
  tabError: string | null;
  followBusy: boolean;
  blockBusy: boolean;
  shareOpen: boolean;
};

type Listener = () => void;

const empty: PublicProfileSnapshot = {
  phase: "idle",
  error: null,
  errorStatus: null,
  profile: null,
  stories: [],
  tab: "videos",
  items: [],
  shopItems: [],
  nextCursor: null,
  tabLoading: false,
  tabLoadingMore: false,
  tabError: null,
  followBusy: false,
  blockBusy: false,
  shareOpen: false,
};

function mapLoadError(message: string, status?: number): { error: string; status: number | null } {
  if (status === 403) return { error: "You cannot view this profile", status };
  if (status === 404) return { error: message || "Profile not found.", status };
  return { error: message || "Could not load profile", status: status ?? null };
}

export function createPublicProfileSession() {
  let profile: UserPublic | null = null;
  let phase: PublicProfilePhase = "idle";
  let error: string | null = null;
  let errorStatus: number | null = null;
  let stories: PublicStory[] = [];
  let tab: PublicProfileTab = "videos";
  let items: FeedVideo[] = [];
  let shopItems: ShopItem[] = [];
  let nextCursor: string | null = null;
  let tabLoading = false;
  let tabLoadingMore = false;
  let tabError: string | null = null;
  let followBusy = false;
  let blockBusy = false;
  let shareOpen = false;
  let viewerId: string | null = null;
  let tabGen = 0;
  let profileGen = 0;
  const listeners = new Set<Listener>();
  let cached: PublicProfileSnapshot = { ...empty };

  const snapshot = (): PublicProfileSnapshot => cached;

  const notify = () => {
    cached = {
      phase,
      error,
      errorStatus,
      profile,
      stories,
      tab,
      items,
      shopItems,
      nextCursor,
      tabLoading,
      tabLoadingMore,
      tabError,
      followBusy,
      blockBusy,
      shareOpen,
    };
    for (const fn of listeners) fn();
  };

  const clearContent = () => {
    items = [];
    shopItems = [];
    nextCursor = null;
    tabError = null;
    stories = [];
  };

  const loadTab = async (target: PublicProfileTab, cursor: string | null, append: boolean) => {
    const gen = ++tabGen;
    const userId = profile?.id;
    if (!userId) return;
    if (append) tabLoadingMore = true;
    else {
      tabLoading = true;
      tabError = null;
      items = [];
      shopItems = [];
      nextCursor = null;
    }
    notify();
    if (target === "shop") {
      const res = await apiFetchPublicShop(userId);
      if (gen !== tabGen) return;
      tabLoading = false;
      tabLoadingMore = false;
      if (res.error) {
        tabError = res.error;
        notify();
        return;
      }
      shopItems = res.items;
      items = [];
      nextCursor = null;
      notify();
      return;
    }
    const res = await apiFetchPublicTabPage(target, userId, cursor);
    if (gen !== tabGen) return;
    tabLoading = false;
    tabLoadingMore = false;
    if (res.error || !res.page) {
      tabError = res.error || "Could not load";
      notify();
      return;
    }
    if (append) {
      const seen = new Set(items.map((row) => row.id));
      items = [...items, ...res.page.videos.filter((row) => !seen.has(row.id))];
    } else {
      items = res.page.videos;
    }
    nextCursor = res.page.nextCursor;
    tabError = null;
    notify();
  };

  return {
    subscribe(fn: Listener) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getSnapshot: snapshot,
    async load(routeKey: string, nextViewerId: string | null, initialTab: PublicProfileTab = "videos") {
      const gen = ++profileGen;
      tabGen += 1;
      viewerId = nextViewerId;
      tab = initialTab;
      phase = "loading";
      error = null;
      errorStatus = null;
      profile = null;
      shareOpen = false;
      followBusy = false;
      blockBusy = false;
      clearContent();
      notify();
      const res = await apiFetchPublicProfile(routeKey);
      if (gen !== profileGen) return;
      if (res.error || !res.profile) {
        const mapped = mapLoadError(res.error || "Profile not found.", res.status);
        phase = "error";
        error = mapped.error;
        errorStatus = mapped.status;
        profile = null;
        notify();
        return;
      }
      profile = res.profile;
      phase = "ready";
      error = null;
      errorStatus = null;
      notify();
      if (viewerId && viewerId !== res.profile.id) {
        void apiRegisterPublicProfileView(res.profile.id).then((view) => {
          if (gen !== profileGen || view.error || view.uniqueViews == null || !profile) return;
          profile = { ...profile, viewCount: view.uniqueViews };
          notify();
        });
      }
      void apiFetchPublicStories(res.profile.id).then((storyRes) => {
        if (gen !== profileGen) return;
        stories = storyRes.stories;
        notify();
      });
      await loadTab(tab, null, false);
    },
    setTab(next: PublicProfileTab) {
      if (tab === next) return;
      tab = next;
      notify();
      void loadTab(next, null, false);
    },
    async loadMore() {
      if (!nextCursor || tabLoading || tabLoadingMore || tab === "shop") return;
      await loadTab(tab, nextCursor, true);
    },
    async refresh() {
      const key = profile?.id;
      if (!key) return;
      await this.load(key, viewerId, tab);
    },
    setShareOpen(open: boolean) {
      shareOpen = open;
      notify();
    },
    async toggleFollow(): Promise<{ ok: true } | { ok: false; error: string }> {
      if (followBusy || !profile) return { ok: false, error: "busy" };
      if (!viewerId) return { ok: false, error: "Log in to follow" };
      if (viewerId === profile.id) return { ok: false, error: "Cannot follow yourself" };
      const targetId = profile.id;
      const wasFollowing = Boolean(profile.isFollowing);
      followBusy = true;
      profile = { ...profile, isFollowing: !wasFollowing };
      notify();
      const res = wasFollowing ? await apiUnfollowPublicUser(targetId) : await apiFollowPublicUser(targetId);
      if (!res.ok) {
        followBusy = false;
        if (profile && profile.id === targetId) {
          profile = { ...profile, isFollowing: wasFollowing };
        }
        notify();
        return res;
      }
      const fresh = await apiFetchPublicProfileById(targetId);
      followBusy = false;
      if (profile && profile.id !== targetId) return { ok: true };
      if (fresh.profile) profile = fresh.profile;
      else if (profile) profile = { ...profile, isFollowing: !wasFollowing };
      notify();
      return { ok: true };
    },
    async blockTarget(): Promise<{ ok: true } | { ok: false; error: string }> {
      if (blockBusy || !profile) return { ok: false, error: "busy" };
      if (!viewerId || viewerId === profile.id) return { ok: false, error: "Cannot block yourself" };
      const targetId = profile.id;
      blockBusy = true;
      notify();
      const res = await apiBlockUser(targetId);
      if (!res.ok) {
        blockBusy = false;
        notify();
        return res;
      }
      profileGen += 1;
      tabGen += 1;
      profile = null;
      clearContent();
      shareOpen = false;
      followBusy = false;
      blockBusy = false;
      phase = "error";
      error = "You cannot view this profile";
      errorStatus = 403;
      notify();
      return { ok: true };
    },
    dispose() {
      profileGen += 1;
      tabGen += 1;
      profile = null;
      phase = "idle";
      error = null;
      errorStatus = null;
      stories = [];
      tab = "videos";
      items = [];
      shopItems = [];
      nextCursor = null;
      tabLoading = false;
      tabLoadingMore = false;
      tabError = null;
      followBusy = false;
      blockBusy = false;
      shareOpen = false;
      viewerId = null;
      notify();
    },
  };
}

export type PublicProfileSession = ReturnType<typeof createPublicProfileSession>;
