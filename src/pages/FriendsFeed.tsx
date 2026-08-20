import { useCallback } from "react";
import { FeedScreen } from "@/components/FeedScreen";
import { apiFetchFriendsFeed } from "@/features/feed/feedApi";

export default function FriendsFeed() {
  const load = useCallback((cursor?: string | null) => apiFetchFriendsFeed(cursor), []);
  return <FeedScreen load={load} emptyLabel="No friends posts yet" />;
}
