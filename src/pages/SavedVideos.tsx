import { useCallback } from "react";
import { FeedScreen } from "@/components/FeedScreen";
import { apiFetchSavedFeed } from "@/features/feed/feedApi";

export default function SavedVideos() {
  const load = useCallback((cursor?: string | null) => apiFetchSavedFeed(cursor), []);
  return <FeedScreen load={load} emptyLabel="No saved videos" />;
}
