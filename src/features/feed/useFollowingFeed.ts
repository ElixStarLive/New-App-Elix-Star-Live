import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedVideo } from "@shared/contracts";
import { apiFetchFollowingFeed } from "@/features/feed/feedApi";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export function useFollowingFeed() {
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const fetchGen = useRef(0);
  const seenVideoIds = useRef(new Set<string>());

  const loadVideos = useCallback(async () => {
    const gen = ++fetchGen.current;
    const res = await apiFetchFollowingFeed();
    if (gen !== fetchGen.current) return false;
    if (res.error || !res.feed) {
      if (res.status === 401) void useAuthStore.getState().checkUser();
      setError(res.error || "Could not load feed");
      return false;
    }
    const incoming = res.feed.videos.filter(
      (item) => Boolean(item.url?.trim()) && !seenVideoIds.current.has(item.id),
    );
    seenVideoIds.current = new Set(incoming.map((item) => item.id));
    setVideos(incoming);
    setError(null);
    return true;
  }, []);

  const reload = useCallback(async () => {
    fetchGen.current += 1;
    setLoading(true);
    setError(null);
    setActiveIndex(0);
    await loadVideos();
    setLoading(false);
  }, [loadVideos]);

  useEffect(() => {
    void reload();
  }, [reload]);

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

  const removeCreator = useCallback((userId: string) => {
    setVideos((prev) => {
      const next = prev.filter((item) => item.user.id !== userId);
      seenVideoIds.current = new Set(next.map((item) => item.id));
      return next;
    });
  }, []);

  return {
    videos,
    activeIndex,
    setActiveIndex,
    loading,
    loadingMore: false,
    error,
    hasMore: false,
    reload,
    loadMore: async () => undefined,
    updateVideo,
    removeCreator,
  };
}
