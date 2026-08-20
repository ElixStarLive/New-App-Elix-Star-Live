import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeedItem, LiveStreamCard } from "@shared/contracts";
import { apiFetchForYouFeed, apiFetchProfile, apiLiveStreams } from "@/features/feed/feedApi";
import { createLiveSnapshotGate, pruneEndedBefore, reconcileLiveSnapshot } from "@/features/feed/livePresence";
import { wsClient } from "@/lib/wsClient";
import { isRecord } from "@/lib/isRecord";
import { showToast } from "@/lib/toast";

export type ForYouLiveSlide = {
  kind: "live";
  key: string;
  stream: LiveStreamCard;
};

export type ForYouVideoSlide = {
  kind: "video";
  key: string;
  item: FeedItem;
};

export type ForYouSlide = ForYouLiveSlide | ForYouVideoSlide;

type TrackedLive = LiveStreamCard & { discoveredAt: number };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function liveKey(stream: LiveStreamCard): string {
  return stream.roomId || stream.streamId;
}

function parseLiveFromWs(data: unknown, discoveredAt: number): TrackedLive | null {
  if (!isRecord(data)) return null;
  const roomId =
    (typeof data.stream_key === "string" && data.stream_key) ||
    (typeof data.room_id === "string" && data.room_id) ||
    (typeof data.streamKey === "string" && data.streamKey) ||
    "";
  const hostId =
    (typeof data.user_id === "string" && data.user_id) ||
    (typeof data.hostUserId === "string" && data.hostUserId) ||
    (typeof data.host_id === "string" && data.host_id) ||
    "";
  if (!roomId || !isUuid(hostId)) return null;
  const streamIdRaw =
    (typeof data.streamId === "string" && data.streamId) ||
    (typeof data.stream_id === "string" && data.stream_id) ||
    (typeof data.id === "string" && data.id) ||
    "";
  const streamId = isUuid(streamIdRaw) ? streamIdRaw : hostId;
  return {
    streamId,
    roomId,
    hostId,
    displayName:
      (typeof data.display_name === "string" && data.display_name) ||
      (typeof data.displayName === "string" && data.displayName) ||
      (typeof data.title === "string" && data.title) ||
      "LIVE",
    username: typeof data.username === "string" ? data.username : "",
    avatarUrl: typeof data.avatar_url === "string" ? data.avatar_url : typeof data.avatarUrl === "string" ? data.avatarUrl : null,
    title: typeof data.title === "string" ? data.title : "",
    viewerCount: typeof data.viewers === "number" ? data.viewers : typeof data.viewerCount === "number" ? data.viewerCount : 0,
    startedAt: new Date(discoveredAt).toISOString(),
    discoveredAt,
  };
}

function endedKeys(data: unknown): string[] {
  if (!isRecord(data)) return [];
  return [
    typeof data.stream_key === "string" ? data.stream_key : "",
    typeof data.streamKey === "string" ? data.streamKey : "",
    typeof data.room_id === "string" ? data.room_id : "",
    typeof data.streamId === "string" ? data.streamId : "",
    typeof data.stream_id === "string" ? data.stream_id : "",
    typeof data.id === "string" ? data.id : "",
  ].filter(Boolean);
}

function needsLiveEnrichment(stream: LiveStreamCard): boolean {
  const name = stream.displayName.trim();
  return !stream.avatarUrl || !name || name === "LIVE";
}

export function useForYouFeed() {
  const [lives, setLives] = useState<TrackedLive[]>([]);
  const [videos, setVideos] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const fetchGen = useRef(0);
  const moreLock = useRef(false);
  const seenVideoIds = useRef(new Set<string>());
  const endedAtRef = useRef(new Map<string, number>());
  const snapshotGate = useRef(createLiveSnapshotGate());

  const slides: ForYouSlide[] = useMemo(
    () => [
      ...lives.map((stream) => ({ kind: "live" as const, key: `live-${liveKey(stream)}`, stream })),
      ...videos.map((item) => ({ kind: "video" as const, key: `video-${item.id}`, item })),
    ],
    [lives, videos],
  );

  const loadVideos = useCallback(async (nextCursor: string | null, append: boolean) => {
    const gen = ++fetchGen.current;
    const res = await apiFetchForYouFeed(nextCursor);
    if (gen !== fetchGen.current) return false;
    if (res.error || !res.page) {
      if (!append) setError(res.error || "Could not load feed");
      else showToast(res.error || "Could not load more");
      return false;
    }
    const incoming = res.page.items.filter((item) => item.kind === "video" && !seenVideoIds.current.has(item.id));
    if (!append) {
      seenVideoIds.current = new Set(incoming.map((item) => item.id));
      setVideos(incoming);
    } else {
      for (const item of incoming) seenVideoIds.current.add(item.id);
      setVideos((prev) => [...prev, ...incoming]);
    }
    setCursor(res.page.nextCursor);
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
        snapshot: res.streams.map((stream) => ({ ...stream, discoveredAt: requestedAt })),
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
    await Promise.all([loadLives(), loadVideos(null, false)]);
    setLoading(false);
  }, [loadLives, loadVideos]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
      setVideos((prev) => prev.map((item) => (item.userId === card.hostId ? { ...item, isLive: true } : item)));
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
      setLives((prev) => {
        const removedHosts = new Set<string>();
        const next = prev.filter((row) => {
          const drop = keys.includes(liveKey(row)) || keys.includes(row.streamId) || keys.includes(row.hostId);
          if (drop) removedHosts.add(row.hostId);
          return !drop;
        });
        if (removedHosts.size > 0) {
          setVideos((videosPrev) =>
            videosPrev.map((item) => (removedHosts.has(item.userId) ? { ...item, isLive: false } : item)),
          );
        }
        return next;
      });
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
    if (!cursor || moreLock.current || loadingMore) return;
    moreLock.current = true;
    setLoadingMore(true);
    await loadVideos(cursor, true);
    setLoadingMore(false);
    moreLock.current = false;
  }, [cursor, loadingMore, loadVideos]);

  const updateVideo = useCallback((videoId: string, patch: Partial<FeedItem>) => {
    setVideos((prev) => prev.map((item) => (item.id === videoId ? { ...item, ...patch } : item)));
  }, []);

  const liveHostIds = useMemo(() => new Set(lives.map((row) => row.hostId)), [lives]);

  return {
    slides,
    activeIndex,
    setActiveIndex,
    loading,
    loadingMore,
    error,
    hasMore: Boolean(cursor),
    reload,
    loadMore,
    updateVideo,
    liveHostIds,
  };
}
