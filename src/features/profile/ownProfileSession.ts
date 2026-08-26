import type { FeedVideo, UserPublic } from "@shared/contracts";
import type { ShopItem } from "@/features/shop/shopApi";
import {
  apiFetchOwnProfile,
  apiFetchOwnShop,
  apiFetchOwnTabPage,
  apiOwnHasActiveStory,
  apiUploadOwnAvatar,
  type OwnProfileTab,
} from "./ownProfileApi";

export type OwnProfilePhase = "idle" | "loading" | "ready" | "error";

export type OwnProfileSnapshot = {
  phase: OwnProfilePhase;
  error: string | null;
  profile: UserPublic | null;
  hasStory: boolean;
  tab: OwnProfileTab;
  items: FeedVideo[];
  shopItems: ShopItem[];
  nextCursor: string | null;
  tabLoading: boolean;
  tabLoadingMore: boolean;
  tabError: string | null;
  uploadingAvatar: boolean;
  shareOpen: boolean;
};

type Listener = () => void;

const empty: OwnProfileSnapshot = {
  phase: "idle",
  error: null,
  profile: null,
  hasStory: false,
  tab: "videos",
  items: [],
  shopItems: [],
  nextCursor: null,
  tabLoading: false,
  tabLoadingMore: false,
  tabError: null,
  uploadingAvatar: false,
  shareOpen: false,
};

export function createOwnProfileSession() {
  let profile: UserPublic | null = null;
  let phase: OwnProfilePhase = "idle";
  let error: string | null = null;
  let hasStory = false;
  let tab: OwnProfileTab = "videos";
  let items: FeedVideo[] = [];
  let shopItems: ShopItem[] = [];
  let nextCursor: string | null = null;
  let tabLoading = false;
  let tabLoadingMore = false;
  let tabError: string | null = null;
  let uploadingAvatar = false;
  let shareOpen = false;
  let tabGen = 0;
  let profileGen = 0;
  const listeners = new Set<Listener>();
  let cached: OwnProfileSnapshot = { ...empty };

  const snapshot = (): OwnProfileSnapshot => cached;

  const notify = () => {
    cached = {
      phase,
      error,
      profile,
      hasStory,
      tab,
      items,
      shopItems,
      nextCursor,
      tabLoading,
      tabLoadingMore,
      tabError,
      uploadingAvatar,
      shareOpen,
    };
    for (const fn of listeners) fn();
  };

  const loadTab = async (target: OwnProfileTab, cursor: string | null, append: boolean) => {
    const gen = ++tabGen;
    const userId = profile?.id;
    if (!userId) return;
    if (append) tabLoadingMore = true;
    else {
      tabLoading = true;
      tabError = null;
      if (!append) {
        items = [];
        shopItems = [];
        nextCursor = null;
      }
    }
    notify();
    if (target === "shop") {
      const res = await apiFetchOwnShop(userId);
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
    const res = await apiFetchOwnTabPage(target, userId, cursor);
    if (gen !== tabGen) return;
    tabLoading = false;
    tabLoadingMore = false;
    if (res.error || !res.page) {
      tabError = res.error || "Could not load";
      notify();
      return;
    }
    items = append ? [...items, ...res.page.videos] : res.page.videos;
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
    async load() {
      const gen = ++profileGen;
      phase = "loading";
      error = null;
      notify();
      const res = await apiFetchOwnProfile();
      if (gen !== profileGen) return;
      if (res.error || !res.profile) {
        phase = "error";
        error = res.error || "Profile not found";
        profile = null;
        notify();
        return;
      }
      profile = res.profile;
      phase = "ready";
      error = null;
      notify();
      void apiOwnHasActiveStory(res.profile.id).then((on) => {
        if (gen !== profileGen) return;
        hasStory = on;
        notify();
      });
      await loadTab(tab, null, false);
    },
    setTab(next: OwnProfileTab) {
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
      await this.load();
    },
    applyCollectionEvent(ev: {
      type: "saved" | "liked" | "refresh";
      videoId?: string;
      saved?: boolean;
      liked?: boolean;
      collection?: "saved" | "liked" | "all";
    }) {
      if (ev.type === "refresh") {
        if (
          ev.collection === "all" ||
          (ev.collection === "saved" && tab === "saved") ||
          (ev.collection === "liked" && tab === "liked")
        ) {
          void loadTab(tab, null, false);
        }
        return;
      }
      if (ev.type === "saved" && tab === "saved") {
        if (ev.saved === false && ev.videoId) {
          items = items.filter((v) => v.id !== ev.videoId);
          notify();
          return;
        }
        void loadTab("saved", null, false);
        return;
      }
      if (ev.type === "liked" && tab === "liked") {
        if (ev.liked === false && ev.videoId) {
          items = items.filter((v) => v.id !== ev.videoId);
          notify();
          return;
        }
        void loadTab("liked", null, false);
      }
    },
    setShareOpen(open: boolean) {
      shareOpen = open;
      notify();
    },
    async uploadAvatar(file: File) {
      if (uploadingAvatar) return { ok: false as const, error: "busy" };
      uploadingAvatar = true;
      notify();
      const res = await apiUploadOwnAvatar(file, file.name);
      uploadingAvatar = false;
      if (res.error || !res.avatarUrl) {
        notify();
        return { ok: false as const, error: res.error || "Avatar upload failed" };
      }
      if (profile) profile = { ...profile, avatarUrl: res.avatarUrl };
      notify();
      return { ok: true as const, avatarUrl: res.avatarUrl };
    },
    dispose() {
      profileGen += 1;
      tabGen += 1;
      profile = null;
      phase = "idle";
      error = null;
      hasStory = false;
      tab = "videos";
      items = [];
      shopItems = [];
      nextCursor = null;
      tabLoading = false;
      tabLoadingMore = false;
      tabError = null;
      uploadingAvatar = false;
      shareOpen = false;
      notify();
    },
  };
}

export type OwnProfileSession = ReturnType<typeof createOwnProfileSession>;
