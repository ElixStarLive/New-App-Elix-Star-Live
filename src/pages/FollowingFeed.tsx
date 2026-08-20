import { useCallback } from "react";
import { FeedScreen } from "@/components/FeedScreen";
import { apiFetchFollowingFeed } from "@/features/feed/feedApi";

export default function FollowingFeed() {
  const load = useCallback((cursor?: string | null) => apiFetchFollowingFeed(cursor), []);
  return <FeedScreen load={load} emptyLabel="Follow people to see their posts" />;
}
