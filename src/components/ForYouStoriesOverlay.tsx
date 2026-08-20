import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Plus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetchStories } from "@/features/feed/feedApi";
import { AvatarRing } from "@/components/AvatarRing";
import { useAuthStore } from "@/store/useAuthStore";

type StoryUser = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  stories: Array<{ id: string; mediaUrl: string }>;
};

export function ForYouStoriesOverlay({
  pageRef,
  liveHostIds,
}: {
  pageRef: RefObject<HTMLDivElement | null>;
  liveHostIds: Set<string>;
}) {
  const navigate = useNavigate();
  const self = useAuthStore((state) => state.user);
  const [users, setUsers] = useState<StoryUser[]>([]);
  const [visible, setVisible] = useState(false);
  const [viewer, setViewer] = useState<{ user: StoryUser; index: number } | null>(null);
  const startY = useRef<number | null>(null);

  const reload = useCallback(() => {
    void apiFetchStories().then((res) => {
      if (res.error) return;
      setUsers(
        res.users.map((row) => ({
          userId: row.userId,
          username: row.username,
          displayName: row.displayName,
          avatarUrl: row.avatarUrl,
          stories: row.stories.map((story) => ({ id: story.id, mediaUrl: story.mediaUrl })),
        })),
      );
    });
  }, []);

  useEffect(() => {
    reload();
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => {
      startY.current = e.touches[0]?.clientY ?? null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || viewer) return;
      const y = e.touches[0]?.clientY ?? startY.current;
      const dy = y - startY.current;
      if (dy > 56) setVisible(true);
      if (dy < -40) setVisible(false);
    };
    const onEnd = () => {
      startY.current = null;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [pageRef, viewer]);

  const own = users.find((row) => row.userId === self?.id);
  const others = users.filter((row) => row.userId !== self?.id);

  return (
    <>
      {visible && !viewer ? (
        <div
          className="absolute left-0 right-0 z-[20] pointer-events-none"
          style={{ top: "calc(var(--safe-top) + var(--topnav-bar-height))" }}
        >
          <div className="pointer-events-auto flex gap-3 overflow-x-auto no-scrollbar px-3 py-2">
            <button
              type="button"
              className="shrink-0 flex flex-col items-center"
              style={{ width: 80 }}
              onClick={() => {
                if (own?.stories[0]) setViewer({ user: own, index: 0 });
                else navigate("/create");
              }}
            >
              <div className="relative" style={{ width: 58, height: 58 }}>
                <AvatarRing src={self?.avatarUrl} alt={self?.username || "You"} size={58} />
                <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-[#E6E9EE] border-2 border-black flex items-center justify-center">
                  <Plus size={9} className="text-black" strokeWidth={3} />
                </span>
              </div>
              <span className="elix-silver-red-text text-[10px] truncate w-full text-center mt-0.5">
                {own?.stories.length ? "Your story" : "Add story"}
              </span>
            </button>
            {others.map((user) => (
              <button
                key={user.userId}
                type="button"
                className="shrink-0 flex flex-col items-center"
                style={{ width: 80 }}
                onClick={() => setViewer({ user, index: 0 })}
              >
                <AvatarRing
                  src={user.avatarUrl}
                  alt={user.displayName || user.username}
                  size={58}
                  ringColor={liveHostIds.has(user.userId) ? "#FF2D55" : "#D8D9DD"}
                />
                <span className="elix-silver-red-text text-[10px] truncate w-full text-center mt-0.5">
                  {user.username}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {viewer ? (
        <div className="fixed inset-0 z-[80] bg-black">
          <video
            key={viewer.user.stories[viewer.index]?.id}
            src={viewer.user.stories[viewer.index]?.mediaUrl}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
            onEnded={() => {
              setViewer((prev) => {
                if (!prev) return null;
                if (prev.index + 1 < prev.user.stories.length) return { ...prev, index: prev.index + 1 };
                return null;
              });
            }}
          />
          <button type="button" className="absolute top-3 right-3 z-20 p-1" aria-label="Close story" onClick={() => setViewer(null)}>
            <X size={18} className="text-white" />
          </button>
        </div>
      ) : null}
    </>
  );
}
