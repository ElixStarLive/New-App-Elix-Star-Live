import { useCallback } from "react";
import { useParams } from "react-router-dom";
import { FeedScreen } from "@/components/FeedScreen";
import { apiFetchHashtagFeed } from "@/features/feed/feedApi";

export default function Hashtag() {
  const { tag } = useParams();
  const load = useCallback(
    (cursor?: string | null) => apiFetchHashtagFeed(tag || "", cursor),
    [tag],
  );
  return <FeedScreen load={load} emptyLabel={`No posts for #${tag || ""}`} />;
}
