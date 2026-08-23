import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedVideo } from "@shared/contracts";
import { apiFetchStemFeed } from "@/features/feed/feedApi";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export function useStemFeed() {
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const fetchGen = useRef(0);
  const moreLock = useRef(false);
  const seenVideoIds = useRef(new Set<string>());

  const loadVideos = useCallback(async (nextCursor: string | null, append: boolean) => {
    const gen = ++fetchGen.current;
    const res = await apiFetchStemFeed(nextCursor);
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
    setCursor(res.page.nextCursor);
    setError(null);
    return true;
  }, []);

  const reload = useCallback(async () => {
    fetchGen.current += 1;
    moreLock.current = false;
    setLoading(true);
    setError(null);
    setActiveIndex(0);
    await loadVideos(null, false);
    setLoading(false);
  }, [loadVideos]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (!cursor || moreLock.current || loadingMore) return;
    moreLock.current = true;
    setLoadingMore(true);
    await loadVideos(cursor, true);
    setLoadingMore(false);
    moreLock.current = false;
  }, [cursor, loadingMore, loadVideos]);

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

  return {
    videos,
    activeIndex,
    setActiveIndex,
    loading,
    loadingMore,
    error,
    hasMore: Boolean(cursor),
    reload,
    loadMore,
    updateVideo,
  };
}
