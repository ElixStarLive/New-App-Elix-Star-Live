import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Search as SearchIcon, X } from 'lucide-react';
import { searchUsers, type UserPreview } from '../features/users/usersApi';
import { fetchForYou, type FeedVideo } from '../features/feed/feedApi';

const FIXED_CATEGORIES = ['All', 'For You', 'Trending', 'Dance', 'Comedy', 'Music', 'Food', 'Sports', 'Fashion', 'Gaming', 'Travel', 'Fitness', 'Beauty', 'Pets', 'Art'];

export default function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserPreview[]>([]);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [allVideos, setAllVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setQuery(params.get('q') ?? '');
    void fetchForYou().then(({ data }) => {
      if (data) setAllVideos(data.videos);
    });
  }, [location.search]);

  const goBack = useCallback(
    () => navigate((location.state as { from?: string } | null)?.from || '/feed', { replace: true }),
    [navigate, location.state],
  );

  const clearQuery = useCallback(() => setQuery(''), []);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const next = query.trim();
      const params = new URLSearchParams(location.search);
      if (next) params.set('q', next);
      else params.delete('q');
      navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true });
    },
    [query, location.pathname, location.search, navigate],
  );

  useEffect(() => {
    const next = query.trim().toLowerCase();
    if (next.length < 2) {
      setUsers([]);
      setVideos([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data: uData }, { data: vData }] = await Promise.all([
        searchUsers(next),
        Promise.resolve({ data: allVideos }),
      ]);
      if (cancelled) return;
      setUsers(uData?.users.slice(0, 20) ?? []);
      const matched = (vData ?? allVideos).filter((v) => {
        const desc = (v.description || '').toLowerCase();
        const tags = v.hashtags.join(' ').toLowerCase();
        return desc.includes(next) || tags.includes(next);
      }).slice(0, 30);
      setVideos(matched);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [query, allVideos]);

  const filteredVideos = (() => {
    if (query.trim().length >= 2) return videos;
    const all = allVideos.slice(0, 60);
    if (activeCategory === 'All' || activeCategory === 'For You') return all;
    if (activeCategory === 'Trending') return [...all].sort((a, b) => b.stats.views - a.stats.views);
    const cat = activeCategory.toLowerCase();
    const matched = all.filter((v) => {
      const desc = (v.description || '').toLowerCase();
      const tags = v.hashtags.map((h) => h.replace(/^#/, '').toLowerCase());
      return tags.some((t) => t === cat || t.includes(cat)) || desc.includes(cat);
    });
    return matched.length > 0 ? matched : all;
  })();

  const openUser = useCallback(
    (userId: string) => navigate(`/profile/${userId}`, { state: { from: '/search' } }),
    [navigate],
  );

  const openVideo = useCallback(
    (videoId: string) => navigate(`/video/${videoId}`, { state: { from: '/search' } }),
    [navigate],
  );

  return (
    <div className="fixed inset-0 z-50 flex h-full w-full flex-col app-live-column">
      <div className="absolute inset-0 bg-black/60" onClick={goBack} />

      <div className="relative z-10 flex h-full w-full max-w-[480px] flex-col self-center shadow-2xl app-live-column" style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--bottom-ui-reserve)' }}>
        <div className="flex items-center justify-between px-3 py-2">
          <button
            type="button"
            onClick={() => searchInputRef.current?.focus()}
            className="p-1"
            aria-label="Search"
          >
            <SearchIcon size={18} className="royce-icon-gold" />
          </button>
          <h1 className="elix-silver-red-text text-sm font-bold">Search</h1>
          <button onClick={goBack} className="p-1" aria-label="Back">
            <span className="royce-glow-disc">
              <ChevronLeft size={18} strokeWidth={2.35} className="royce-icon-gold" />
            </span>
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-2 px-3 py-2">
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="flex-1 bg-transparent text-sm text-[#F5F5F7] placeholder-white/40 outline-none"
            autoFocus
          />
          {query && (
            <button type="button" onClick={clearQuery} className="p-0.5 text-white/60">
              <X size={14} />
            </button>
          )}
        </form>
        <div className="mx-3 border-b border-[#D8D9DD]/45" />

        <div className="flex flex-1 flex-col overflow-y-auto">
          {query.trim().length < 2 ? (
            <>
              <div className="flex gap-2 overflow-x-auto p-3 no-scrollbar">
                {FIXED_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`shrink-0 rounded-full border border-transparent px-3 py-1 text-xs font-bold whitespace-nowrap transition-opacity ${
                      activeCategory === cat ? 'opacity-100' : 'opacity-45'
                    }`}
                  >
                    <span className="elix-silver-red-text">{cat}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-1 p-2">
                {filteredVideos.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => openVideo(v.id)}
                    className="relative aspect-[9/16] overflow-hidden rounded bg-transparent"
                  >
                    <img src={v.thumbnail} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-4 p-4">
              {loading && <div className="py-3 text-center text-xs text-white/60">Searching…</div>}

              {users.length > 0 && (
                <div>
                  <h2 className="mb-2 text-sm font-bold text-[#E6E9EE]">Users</h2>
                  <div className="space-y-1">
                    {users.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => openUser(u.id)}
                        className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/5"
                      >
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt="" className="h-9 w-9 rounded-full border border-[#D8D9DD] object-cover" />
                        ) : (
                          <div className="h-9 w-9 rounded-full border border-[#D8D9DD] bg-white/10" />
                        )}
                        <div>
                          <div className="text-xs font-semibold text-[#F5F5F7]">@{u.displayName}</div>
                          <div className="text-[10px] text-white/50">{u.displayName}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h2 className="mb-2 text-sm font-bold text-[#E6E9EE]">Videos</h2>
                {!loading && videos.length === 0 ? (
                  <div className="text-xs text-white/40">No videos found.</div>
                ) : (
                  <div className="space-y-2">
                    {videos.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => openVideo(v.id)}
                        className="flex w-full gap-3 rounded-xl p-2 text-left hover:bg-white/5"
                      >
                        <img src={v.thumbnail} alt="" className="h-22 w-16 rounded-lg border border-[#D8D9DD]/20 object-cover" />
                        <div className="flex-1">
                          <div className="text-xs font-semibold line-clamp-2">{v.description}</div>
                          <div className="mt-1 text-[10px] text-[#F5F5F7]">@{v.user.displayName}</div>
                          <div className="mt-1 text-[10px] text-white/40 line-clamp-1">
                            {v.hashtags.map((h) => `#${h}`).join(' ')}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
