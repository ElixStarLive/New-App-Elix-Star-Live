import { useCallback } from "react";
import { FeedScreen } from "@/components/FeedScreen";
import { apiFetchStemFeed } from "@/features/feed/feedApi";

export default function StemFeed() {
  const load = useCallback((cursor?: string | null) => apiFetchStemFeed(cursor), []);
  return <FeedScreen load={load} emptyLabel="No STEM videos yet" />;
}
