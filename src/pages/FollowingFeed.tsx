import { useNavigate } from "react-router-dom";
import { useFollowingFeed } from "@/features/feed/useFollowingFeed";
import { FollowingFeedOverlay } from "@/components/FollowingFeedOverlay";
import { RelationSnapFeed } from "@/components/RelationSnapFeed";
import { DISCOVER_HOME, containerReturnState } from "@/lib/settingsNav";

export default function FollowingFeed() {
  const navigate = useNavigate();
  const feed = useFollowingFeed();

  return (
    <RelationSnapFeed
      {...feed}
      renderOverlay={(pageRef, onStoryOpenChange) => (
        <FollowingFeedOverlay pageRef={pageRef} onStoryOpenChange={onStoryOpenChange} />
      )}
      empty={
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 px-6 text-center z-[1]">
          <p className="text-base font-semibold mb-1">No videos from people you follow</p>
          <p className="text-xs text-white/30 mb-4">Follow people to see their videos here</p>
          <button
            type="button"
            onClick={() => navigate(DISCOVER_HOME, { state: containerReturnState("/following") })}
            className="px-5 py-2 bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] rounded-full text-sm font-bold pointer-events-auto"
          >
            Discover people
          </button>
        </div>
      }
    />
  );
}
