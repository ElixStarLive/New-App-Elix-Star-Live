import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeedVideo, LiveStreamCard } from "@shared/contracts";
import { apiFetchForYouFeed, apiFetchProfile, apiLiveStreams } from "@/features/feed/feedApi";
import {
  createLiveSnapshotGate,
  liveEndedKeys,
  liveKey,
  parseLiveStartedCard,
  pruneEndedBefore,
  reconcileLiveSnapshot,
} from "@/features/feed/livePresence";
import { wsClient } from "@/lib/wsClient";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export type ForYouLiveSlide = {
  kind: "live";
  key: string;
  stream: LiveStreamCard;
};

export type ForYouVideoSlide = {
  kind: "video";
  key: string;
  item: FeedVideo;
};

export type ForYouSlide = ForYouLiveSlide | ForYouVideoSlide;

type TrackedLive = LiveStreamCard & { discoveredAt: number };

export { liveKey } from "@/features/feed/livePresence";

function parseLiveFromWs(data: unknown, discoveredAt: number): TrackedLive | null {
  return parseLiveStartedCard(data, discoveredAt);
}

function endedKeys(data: unknown): string[] {
  return liveEndedKeys(data);
}

function needsLiveEnrichment(stream: LiveStreamCard): boolean {
  const name = stream.displayName.trim();
  return !stream.avatarUrl || !name || name === "LIVE";
}

export function useForYouFeed() {
  const viewerId = useAuthStore((state) => state.user?.id ?? null);
  const [lives, setLives] = useState<TrackedLive[]>([]);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const fetchGen = useRef(0);
  const moreLock = useRef(false);
  const seenVideoIds = useRef(new Set<string>());
  const endedAtRef = useRef(new Map<string, number>());
  const snapshotGate = useRef(createLiveSnapshotGate());
  const viewerRef = useRef<string | null>(viewerId);

  const slides: ForYouSlide[] = useMemo(
    () => [
      ...lives.map((stream) => ({ kind: "live" as const, key: `live-${liveKey(stream)}`, stream })),
      ...videos.map((item) => ({ kind: "video" as const, key: `video-${item.id}`, item })),
    ],
    [lives, videos],
  );

  const loadVideos = useCallback(async (nextPage: number, append: boolean) => {
    const gen = ++fetchGen.current;
    const res = await apiFetchForYouFeed(nextPage);
    if (gen !== fetchGen.current) return false;
    if (res.error || !res.page) {
      if (res.status === 401) void useAuthStore.getState().checkUser();
      if (!append) setError(res.error || "Could not load feed");
      else showToast(res.error || "Could not load more");
      return false;
    }
    const incoming = res.page.videos.filter(
      (item) => Boolean(item.url?.trim()) && !seenVideoIds.current.has(item.id),
    );
    if (!append) {
      seenVideoIds.current = new Set(incoming.map((item) => item.id));
      setVideos(incoming);
    } else {
      for (const item of incoming) seenVideoIds.current.add(item.id);
      setVideos((prev) => [...prev, ...incoming]);
    }
    setPage(res.page.page);
    setHasMore(res.page.hasMore);
    setError(null);
    return true;
  }, []);

  const loadLives = useCallback(async () => {
    const ticket = snapshotGate.current.begin();
    const requestedAt = Date.now();
    const res = await apiLiveStreams();
    if (!snapshotGate.current.isCurrent(ticket)) return;
    if (res.error) return;
    setLives((prev) =>
      reconcileLiveSnapshot({
        snapshot: res.streams
          .filter((stream) => liveKey(stream))
          .map((stream) => ({ ...stream, discoveredAt: requestedAt })),
        previous: prev,
        keyOf: liveKey,
        discoveredAtOf: (row) => row.discoveredAt,
        requestedAt,
        endedAt: endedAtRef.current,
      }),
    );
    pruneEndedBefore(endedAtRef.current, requestedAt);
  }, []);

  const reload = useCallback(async () => {
    fetchGen.current += 1;
    moreLock.current = false;
    setLoading(true);
    setError(null);
    setActiveIndex(0);
    setPage(1);
    setHasMore(false);
    await Promise.all([loadLives(), loadVideos(1, false)]);
    setLoading(false);
  }, [loadLives, loadVideos]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (viewerRef.current === viewerId) return;
    viewerRef.current = viewerId;
    fetchGen.current += 1;
    moreLock.current = false;
    seenVideoIds.current = new Set();
    endedAtRef.current = new Map();
    setVideos([]);
    setLives([]);
    setActiveIndex(0);
    setPage(1);
    setHasMore(false);
    setError(null);
    void reload();
  }, [viewerId, reload]);

  useEffect(() => {
    const onStarted = (data: unknown) => {
      const now = Date.now();
      const card = parseLiveFromWs(data, now);
      if (!card) {
        void loadLives();
        return;
      }
      for (const key of [liveKey(card), card.streamId, card.hostId]) {
        endedAtRef.current.delete(key);
      }
      setLives((prev) => {
        if (prev.some((row) => liveKey(row) === liveKey(card) || row.streamId === card.streamId)) return prev;
        return [card, ...prev];
      });
      if (needsLiveEnrichment(card)) {
        void apiFetchProfile(card.hostId).then((res) => {
          if (!res.profile) return;
          setLives((prev) =>
            prev.map((row) =>
              liveKey(row) === liveKey(card)
                ? {
                    ...row,
                    displayName: row.displayName && row.displayName !== "LIVE" ? row.displayName : res.profile!.displayName,
                    username: row.username || res.profile!.username,
                    avatarUrl: row.avatarUrl || res.profile!.avatarUrl,
                  }
                : row,
            ),
          );
        });
      }
    };
    const onEnded = (data: unknown) => {
      const keys = endedKeys(data);
      if (keys.length === 0) {
        void loadLives();
        return;
      }
      const now = Date.now();
      for (const key of keys) endedAtRef.current.set(key, now);
      setLives((prev) =>
        prev.filter((row) => !keys.includes(liveKey(row)) && !keys.includes(row.streamId) && !keys.includes(row.hostId)),
      );
    };
    wsClient.on("stream_started", onStarted);
    wsClient.on("stream_ended", onEnded);
    return () => {
      wsClient.off("stream_started", onStarted);
      wsClient.off("stream_ended", onEnded);
    };
  }, [loadLives]);

  useEffect(() => {
    const reconcile = () => {
      if (document.visibilityState === "visible") void loadLives();
    };
    document.addEventListener("visibilitychange", reconcile);
    window.addEventListener("focus", reconcile);
    return () => {
      document.removeEventListener("visibilitychange", reconcile);
      window.removeEventListener("focus", reconcile);
    };
  }, [loadLives]);

  const loadMore = useCallback(async () => {
    if (!hasMore || moreLock.current || loadingMore) return;
    moreLock.current = true;
    setLoadingMore(true);
    await loadVideos(page + 1, true);
    setLoadingMore(false);
    moreLock.current = false;
  }, [hasMore, loadingMore, loadVideos, page]);

  const updateVideo = useCallback((videoId: string, patch: Partial<FeedVideo>) => {
    setVideos((prev) =>
      prev.map((item) => {
        if (item.id !== videoId) return item;
        return {
          ...item,
          ...patch,
          user: patch.user ? { ...item.user, ...patch.user } : item.user,
          stats: patch.stats ? { ...item.stats, ...patch.stats } : item.stats,
        };
      }),
    );
  }, []);

  const liveHostIds = useMemo(() => new Set(lives.map((row) => row.hostId)), [lives]);
  const liveByHost = useMemo(() => {
    const next = new Map<string, string>();
    for (const stream of lives) {
      const roomId = stream.roomId || stream.streamId;
      if (stream.hostId && roomId) next.set(stream.hostId, roomId);
    }
    return next;
  }, [lives]);

  return {
    slides,
    activeIndex,
    setActiveIndex,
    loading,
    loadingMore,
    error,
    hasMore,
    reload,
    loadMore,
    updateVideo,
    liveHostIds,
    liveByHost,
  };
}
