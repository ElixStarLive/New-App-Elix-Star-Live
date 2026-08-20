import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { PageScaffold } from "@/components/PageScaffold";
import { SEARCH_EXIT_TO } from "@/lib/settingsNav";
import { AvatarRing } from "@/components/AvatarRing";

type Hit = { id: string; kind: "user" | "video" | "hashtag"; title: string; subtitle: string; avatarUrl: string | null };

const CATEGORIES = ["Trending", "Music", "Comedy", "Gaming", "Dance", "Fashion"];

export default function SearchPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [category, setCategory] = useState("Trending");

  const run = (query: string) => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    setSearching(true);
    void apiRequest<unknown>(`/api/search?q=${encodeURIComponent(query.trim())}`).then((res) => {
      setSearching(false);
      if (res.error) {
        setError(res.error.message);
        return;
      }
      const list = Array.isArray(res.data) ? res.data : isRecord(res.data) && Array.isArray(res.data.results) ? res.data.results : [];
      const next: Hit[] = [];
      for (const raw of list) {
        if (!isRecord(raw) || typeof raw.id !== "string") continue;
        next.push({
          id: raw.id,
          kind: raw.kind === "video" || raw.kind === "hashtag" ? raw.kind : "user",
          title: typeof raw.title === "string" ? raw.title : "",
          subtitle: typeof raw.subtitle === "string" ? raw.subtitle : "",
          avatarUrl: typeof raw.avatarUrl === "string" ? raw.avatarUrl : null,
        });
      }
      setHits(next);
    });
  };

  const users = hits.filter((h) => h.kind === "user");
  const videos = hits.filter((h) => h.kind === "video");

  return (
    <PageScaffold
      title="Search"
      headerBorder={false}
      onClose={() => navigate(SEARCH_EXIT_TO, { replace: true })}
      left={
        <button type="button" className="p-1" aria-label="Search" onClick={() => inputRef.current?.focus()}>
          <Search size={18} className="text-[#F5F5F7]" />
        </button>
      }
    >
      <div className="px-3 pb-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(q);
          }}
          className="flex items-center gap-2 min-w-0"
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Search"
            aria-label="Search"
            className="w-full min-w-0 bg-transparent text-gold-metallic placeholder-[#FFFFFF]/40 py-1 text-sm focus:outline-none"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (e.target.value.trim().length >= 2) run(e.target.value);
              else setHits([]);
            }}
            autoFocus
          />
          {q ? (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setHits([]);
              }}
              className="shrink-0 text-[#F5F5F7]/60 p-0.5"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          ) : null}
        </form>
        <div className="mt-1 border-b border-[#D8D9DD]/45" aria-hidden />
      </div>

      {!q.trim() ? (
        <>
          <div className="px-3 pt-1 pb-1 flex gap-2 overflow-x-auto no-scrollbar">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setCategory(cat);
                  navigate(`/hashtag/${encodeURIComponent(cat.toLowerCase())}`);
                }}
                className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap border border-transparent ${category === cat ? "opacity-100" : "opacity-45"}`}
              >
                <span className="elix-silver-red-text">{cat}</span>
              </button>
            ))}
          </div>
          <p className="px-4 pt-6 text-white/40 text-sm text-center">Search people and videos</p>
        </>
      ) : (
        <div className="space-y-4 px-4 pb-4 pt-3">
          {searching ? <div className="text-xs text-[#F5F5F7]/60 text-center py-3">Searching...</div> : null}
          {error ? <p className="text-rose-300 text-sm">{error}</p> : null}
          {users.length > 0 ? (
            <div>
              <h2 className="font-bold mb-2 text-gold-metallic text-sm">Users</h2>
              {users.map((u) => (
                <button key={u.id} type="button" onClick={() => navigate(`/profile/${u.id}`)} className="w-full flex items-center gap-3 p-2 rounded-xl">
                  <AvatarRing src={u.avatarUrl} alt={u.title} size={32} />
                  <div className="text-left">
                    <div className="text-xs font-semibold text-gold-metallic">{u.subtitle || u.title}</div>
                    <div className="text-[10px] text-white/50">{u.title}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
          <div>
            <h2 className="font-bold mb-2 text-gold-metallic text-sm">Videos</h2>
            {!searching && videos.length === 0 ? <div className="text-xs text-white/40">No videos found.</div> : null}
            {videos.map((v) => (
              <button key={v.id} type="button" onClick={() => navigate(`/video/${v.id}`)} className="w-full flex gap-3 p-2 rounded-xl text-left">
                <div className="w-16 h-[88px] rounded-lg bg-white/5 border border-[#D8D9DD]/20" />
                <div>
                  <p className="text-sm font-semibold">{v.title}</p>
                  <p className="text-[11px] text-white/50">{v.subtitle}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </PageScaffold>
  );
}
