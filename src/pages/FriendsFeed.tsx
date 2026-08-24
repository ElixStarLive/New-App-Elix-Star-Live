import { useNavigate } from "react-router-dom";
import { useFriendsFeed } from "@/features/feed/useFriendsFeed";
import { FollowingFeedOverlay } from "@/components/FollowingFeedOverlay";
import { RelationSnapFeed } from "@/components/RelationSnapFeed";
import { DISCOVER_HOME, containerReturnState } from "@/lib/settingsNav";

export default function FriendsFeed() {
  const navigate = useNavigate();
  const feed = useFriendsFeed();

  return (
    <RelationSnapFeed
      {...feed}
      renderOverlay={(pageRef, onStoryOpenChange) => (
        <FollowingFeedOverlay
          pageRef={pageRef}
          onStoryOpenChange={onStoryOpenChange}
          title="Friends"
          returnPath="/friends"
          followingFirst={false}
        />
      )}
      empty={
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 px-6 text-center z-[1]">
          <p className="text-base font-semibold mb-1">No friend videos yet</p>
          <p className="text-xs text-white/30 mb-4">Add a photo or video story, or follow people who post</p>
          <button
            type="button"
            onClick={() => navigate("/upload?type=story")}
            className="px-5 py-2 bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] rounded-full text-sm font-bold mb-3 pointer-events-auto"
          >
            Add story
          </button>
          <button
            type="button"
            onClick={() => navigate(DISCOVER_HOME, { state: containerReturnState("/friends") })}
            className="px-5 py-2 bg-white/10 text-white rounded-full text-sm font-bold pointer-events-auto"
          >
            Discover people
          </button>
        </div>
      }
    />
  );
}
