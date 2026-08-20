import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { FeedPage } from "@shared/contracts";
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Music, Share2 } from "lucide-react";
import { apiLikeVideo, apiSaveVideo, apiUnlikeVideo, apiUnsaveVideo } from "@/features/feed/feedApi";
import { nativeShareUrl } from "@/lib/platform";
import { getPublicWebOrigin } from "@/lib/api";
import { showToast } from "@/lib/toast";
import { AvatarRing } from "@/components/AvatarRing";
import { LevelBadge } from "@/components/LevelBadge";
import { formatCompactNumber } from "@/lib/formatCompactNumber";

const SIDEBAR_AVATAR = 38;
const COUNT = "text-[10px] font-semibold leading-none text-[#E6E9EE]";

function FeedVideo({ src, poster, active }: { src?: string; poster?: string | null; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active) {
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, [active]);
  return (
    <video
      ref={ref}
      src={src}
      className="absolute inset-0 w-full h-full object-cover"
      playsInline
      loop
      muted
      poster={poster ?? undefined}
    />
  );
}

export function FeedScreen({
  load,
  emptyLabel,
}: {
  load: (cursor?: string | null) => Promise<{ page: FeedPage | null; error: string | null }>;
  emptyLabel: string;
}) {
  const navigate = useNavigate();
  const [items, setItems] = useState<FeedPage["items"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [moreId, setMoreId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load(null).then((res) => {
      if (cancelled) return;
      if (res.error || !res.page) {
        setError(res.error || "Could not load feed");
        setLoading(false);
        return;
      }
      setItems(res.page.items);
      setCursor(res.page.nextCursor);
      setActiveId(res.page.items[0]?.id ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = visible?.target.getAttribute("data-feed-id");
        if (id) setActiveId(id);
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-feed-id]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  const loadMore = async () => {
    if (!cursor) return;
    const res = await load(cursor);
    if (res.error || !res.page) {
      showToast(res.error || "Could not load more");
      return;
    }
    setItems((prev) => [...prev, ...res.page!.items]);
    setCursor(res.page.nextCursor);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
      </div>
    );
  }

  if (error) {
    return <div className="h-full flex items-center justify-center text-rose-300 text-sm px-4">{error}</div>;
  }

  if (items.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6">
        <p className="text-white/70 font-semibold text-base mb-1 text-center">Nothing here yet</p>
        <p className="text-white/40 text-sm text-center">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="h-full overflow-y-auto snap-y snap-mandatory">
      {items.map((item) => {
        const isActive = activeId === item.id;
        const isLive = item.kind === "live" || item.isLive;
        return (
          <article key={item.id} data-feed-id={item.id} className="relative h-full w-full shrink-0 snap-start overflow-hidden">
            {isLive ? (
              <button type="button" className="absolute inset-0 bg-black" onClick={() => navigate(`/watch/${item.streamId || item.id}`)}>
                {item.thumbnailUrl ? (
                  <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-[#080A0E]" />
                )}
                <span className="absolute top-24 left-3 text-[10px] font-black text-[#FF2D55]">LIVE</span>
              </button>
            ) : (
              <FeedVideo src={item.mediaUrl} poster={item.thumbnailUrl} active={isActive} />
            )}

            <div
              className="absolute z-[10] flex flex-col items-center gap-2 pointer-events-auto"
              style={{ right: "calc(12px - 3mm)", bottom: "calc(var(--nav-height, 56px) + 24px)" }}
            >
              <button
                type="button"
                onClick={() => navigate(`/profile/${item.userId}`)}
                className="relative mb-1 overflow-visible rounded-full active:scale-95"
                style={{ width: SIDEBAR_AVATAR, height: SIDEBAR_AVATAR }}
                title={item.username}
              >
                <AvatarRing src={item.avatarUrl} alt={item.displayName} size={SIDEBAR_AVATAR} />
              </button>

              {item.kind === "video" ? (
                <button
                  type="button"
                  className="flex flex-col items-center gap-0.5 active:scale-95"
                  onClick={() => {
                    const already = liked.has(item.id);
                    void (already ? apiUnlikeVideo(item.id) : apiLikeVideo(item.id)).then((r) => {
                      if (!r.ok) showToast(r.error);
                      else {
                        setLiked((prev) => {
                          const next = new Set(prev);
                          if (already) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        });
                      }
                    });
                  }}
                >
                  {liked.has(item.id) ? (
                    <Heart size={24} strokeWidth={2.25} className="fill-red-500 text-red-500" />
                  ) : (
                    <span className="royce-tile" style={{ width: 34, height: 34 }}>
                      <Heart size={24} className="royce-icon-gold" strokeWidth={2.25} />
                    </span>
                  )}
                  <span className={COUNT}>{formatCompactNumber((item.likeCount ?? 0) + (liked.has(item.id) ? 1 : 0))}</span>
                </button>
              ) : null}

              <button type="button" className="flex flex-col items-center gap-0.5 active:scale-95" onClick={() => navigate(`/video/${item.id}`)}>
                <span className="royce-tile" style={{ width: 34, height: 34 }}>
                  <MessageCircle size={24} className="royce-icon-gold" />
                </span>
                <span className={COUNT}>{formatCompactNumber(item.commentCount ?? 0)}</span>
              </button>

              {item.kind === "video" ? (
                <button
                  type="button"
                  className="flex flex-col items-center gap-0.5 active:scale-95"
                  onClick={() => {
                    const already = saved.has(item.id);
                    void (already ? apiUnsaveVideo(item.id) : apiSaveVideo(item.id)).then((r) => {
                      if (!r.ok) showToast(r.error);
                      else {
                        setSaved((prev) => {
                          const next = new Set(prev);
                          if (already) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        });
                      }
                    });
                  }}
                >
                  <span className="royce-tile" style={{ width: 34, height: 34 }}>
                    <Bookmark size={24} strokeWidth={2.25} className={saved.has(item.id) ? "fill-[#E6E9EE] royce-icon-gold" : "royce-icon-gold"} />
                  </span>
                  <span className={COUNT}>{formatCompactNumber((item.saveCount ?? 0) + (saved.has(item.id) ? 1 : 0))}</span>
                </button>
              ) : null}

              <button
                type="button"
                className="flex flex-col items-center gap-0.5 active:scale-95"
                onClick={() =>
                  void nativeShareUrl({
                    title: "Elix Star Live",
                    url: `${getPublicWebOrigin()}${isLive ? `/watch/${item.streamId}` : `/video/${item.id}`}`,
                  })
                }
              >
                <span className="royce-tile" style={{ width: 34, height: 34 }}>
                  <Share2 size={22} className="royce-icon-gold" />
                </span>
              </button>

              <button
                type="button"
                className="flex flex-col items-center gap-0.5 active:scale-95"
                onClick={() => navigate(item.soundId ? `/music/${item.soundId}` : "/music")}
              >
                <span className="royce-tile relative overflow-hidden" style={{ width: 32, height: 32 }}>
                  <Music size={18} strokeWidth={2.25} className="royce-icon-gold" />
                </span>
              </button>

              <button type="button" className="flex flex-col items-center gap-0.5 active:scale-95" aria-label="More options" onClick={() => setMoreId(item.id)}>
                <span className="royce-glow-disc" style={{ width: 34, height: 34 }} aria-hidden>
                  <MoreHorizontal size={22} strokeWidth={2.35} className="royce-icon-gold" />
                </span>
              </button>
            </div>

            <div className="absolute z-[10] pointer-events-none flex flex-col items-stretch gap-0.5" style={{ left: "3mm", right: "72px", bottom: "calc(var(--nav-height, 56px) + 24px)" }}>
              <div className="flex items-center gap-2 w-full min-w-0">
                <LevelBadge level={1} circleSize={26} size={16} />
                <h3 className="elix-silver-red-text font-bold truncate">{item.displayName || item.username}</h3>
              </div>
              <span className="elix-silver-red-text text-xs font-medium whitespace-nowrap overflow-hidden block max-w-full">Original Sound - {item.username}</span>
              <div className="flex items-center gap-2 elix-silver-red-text text-xs opacity-80">
                <span>{formatCompactNumber(item.viewCount ?? 0)} views</span>
              </div>
              <p className="elix-silver-red-text text-sm line-clamp-2 w-full text-left">{item.caption || ""}</p>
            </div>

            {moreId === item.id ? (
              <div className="absolute inset-0 z-20 bg-black/50" onClick={() => setMoreId(null)}>
                <div className="absolute bottom-24 left-4 right-4 rounded-2xl bg-[#1A1C21] border border-white/15 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 text-sm font-semibold border-b border-white/10"
                    onClick={() => {
                      setMoreId(null);
                      navigate(`/profile/${item.userId}`);
                    }}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 text-sm font-semibold"
                    onClick={() => {
                      setMoreId(null);
                      navigate("/report");
                    }}
                  >
                    Report
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
      {cursor ? (
        <div className="py-6 flex justify-center">
          <button type="button" onClick={() => void loadMore()} className="text-xs text-white/70">
            Load more
          </button>
        </div>
      ) : null}
    </div>
  );
}
