import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FeedScreen } from "@/components/FeedScreen";
import { PageScaffold } from "@/components/PageScaffold";
import { apiFetchMusicFeed } from "@/features/feed/feedApi";
import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { FEED_HOME } from "@/lib/settingsNav";

export default function MusicFeed() {
  const { songId } = useParams();
  const navigate = useNavigate();
  const [sounds, setSounds] = useState<Array<{ id: string; title: string; artist: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    async (cursor?: string | null) => {
      if (!songId) return { page: { items: [], nextCursor: null }, error: null };
      return apiFetchMusicFeed(songId, cursor);
    },
    [songId],
  );

  useEffect(() => {
    if (songId) return;
    void apiRequest<unknown>("/api/music/search").then((res) => {
      if (res.error) {
        setError(res.error.message);
        return;
      }
      const list = isRecord(res.data) && Array.isArray(res.data.items) ? res.data.items : [];
      const next: Array<{ id: string; title: string; artist: string }> = [];
      for (const raw of list) {
        if (!isRecord(raw) || typeof raw.id !== "string") continue;
        next.push({
          id: raw.id,
          title: typeof raw.title === "string" ? raw.title : "Sound",
          artist: typeof raw.artist === "string" ? raw.artist : "",
        });
      }
      setSounds(next);
    });
  }, [songId]);

  if (!songId) {
    return (
      <PageScaffold title="Music" onClose={() => navigate(FEED_HOME, { replace: true })}>
        {error ? <p className="px-4 text-rose-300 text-sm">{error}</p> : null}
        <div className="px-3 py-2 space-y-2">
          {sounds.map((row) => (
            <button
              key={row.id}
              type="button"
              className="w-full flex items-center gap-3 text-left px-1 py-2.5"
              onClick={() => navigate(`/music/${encodeURIComponent(row.id)}`)}
            >
              <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">♪</div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{row.title}</p>
                <p className="text-[12px] text-white/50 truncate">{row.artist}</p>
              </div>
            </button>
          ))}
          {sounds.length === 0 && !error ? <p className="text-white/40 text-sm text-center py-8">No sounds yet</p> : null}
        </div>
      </PageScaffold>
    );
  }

  return <FeedScreen load={load} emptyLabel="No music videos yet" />;
}
