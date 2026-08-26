import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Bookmark, Music, Pause, Play, Search } from "lucide-react";
import { RoyceBackIcon } from "@/components/royce";
import {
  apiFetchMusicPlaylists,
  apiSearchMusicTracks,
  type MusicPlaylist,
  type MusicTrack,
} from "@/features/music/musicApi";
import { createPathWithSound, isCreateSoundPick } from "@/features/camera/createCameraContract";
import {
  attachMusicPreviewLifecycle,
  getMusicPreviewState,
  stopMusicPreview,
  subscribeMusicPreview,
  toggleMusicPreview,
} from "@/features/music/previewPlayer";
import { isMusicTrackSaved, toggleSavedMusicTrack } from "@/features/music/savedSounds";
import {
  FEED_HOME,
  containerReturnState,
  exitToFromLocationState,
} from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

/** Create/Upload pick row — mic audio from the clip (not a licensed track). */
const ORIGINAL_SOUND_TRACK: MusicTrack = {
  id: "original",
  title: "Original Sound",
  artist: "Your recording",
  duration: "0:00",
  coverUrl: null,
  clipStartSeconds: 0,
  clipEndSeconds: 0,
};

function formatClip(start: number, end: number): string {
  const total = Math.max(0, Math.floor(end - start));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function MusicFeed() {
  const { songId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const viewerId = useAuthStore((state) => state.user?.id) ?? null;
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const playlistSeq = useRef(0);
  const searchSeq = useRef(0);
  const preview = useSyncExternalStore(subscribeMusicPreview, getMusicPreviewState);
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<MusicTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());

  const featuredTrackId = songId?.trim() || null;
  const pickForCreate = isCreateSoundPick(location.state);

  useEffect(() => attachMusicPreviewLifecycle(), []);

  useEffect(() => {
    stopMusicPreview();
  }, [viewerId]);

  useEffect(() => {
    const seq = ++playlistSeq.current;
    setLoading(true);
    void apiFetchMusicPlaylists().then((res) => {
      if (seq !== playlistSeq.current) return;
      if (res.error) {
        setPlaylists([]);
        setConfigured(res.status !== 503);
        setLoading(false);
        if (res.status && res.status >= 500) showToast("Couldn't load sounds.");
        return;
      }
      setPlaylists(res.playlists);
      setConfigured(res.configured);
      setActivePlaylistId((prev) => prev || res.playlists[0]?.id || null);
      setLoading(false);
    });
    return () => {
      playlistSeq.current += 1;
    };
  }, []);

  useEffect(() => {
    const term = search.trim();
    if (!term) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeq.current;
    const timer = window.setTimeout(() => {
      void apiSearchMusicTracks(term).then((res) => {
        if (seq !== searchSeq.current) return;
        setSearching(false);
        if (res.error) {
          showToast("Sound search failed. Try again.");
          return;
        }
        setSearchResults(res.tracks);
      });
    }, 300);
    return () => {
      searchSeq.current += 1;
      window.clearTimeout(timer);
    };
  }, [search]);

  const allTracks = useMemo(() => playlists.flatMap((playlist) => playlist.tracks), [playlists]);

  const visibleTracks = useMemo(() => {
    if (search.trim()) return searchResults;
    const playlist = playlists.find((row) => row.id === activePlaylistId);
    return playlist?.tracks ?? [];
  }, [search, searchResults, playlists, activePlaylistId]);

  const featuredTrack = useMemo(() => {
    const id = featuredTrackId || preview.playingId;
    if (id && id !== ORIGINAL_SOUND_TRACK.id) {
      const found =
        allTracks.find((track) => track.id === id) ||
        searchResults.find((track) => track.id === id) ||
        visibleTracks.find((track) => track.id === id) ||
        null;
      if (found) return found;
    }
    return visibleTracks[0] ?? null;
  }, [featuredTrackId, preview.playingId, allTracks, searchResults, visibleTracks]);

  const headerTitle = featuredTrack?.title || "Sound";
  const headerArtist = featuredTrack?.artist || "Licensed playlists";
  const trackIsSaved = Boolean(
    featuredTrack && (savedIds.has(featuredTrack.id) || isMusicTrackSaved(featuredTrack.id)),
  );

  useEffect(() => {
    if (!featuredTrack?.id) return;
    if (!isMusicTrackSaved(featuredTrack.id)) return;
    setSavedIds((prev) => {
      if (prev.has(featuredTrack.id)) return prev;
      const next = new Set(prev);
      next.add(featuredTrack.id);
      return next;
    });
  }, [featuredTrack?.id]);

  const goBack = useCallback(() => {
    stopMusicPreview();
    navigate(exitToFromLocationState(location.state, FEED_HOME), { replace: true });
  }, [navigate, location.state]);

  const goSearch = useCallback(() => {
    const path = `${location.pathname}${location.search}`;
    navigate("/search", { state: containerReturnState(path.startsWith("/music") ? path : "/music") });
  }, [navigate, location.pathname, location.search]);

  const openTrack = useCallback(
    (track: MusicTrack) => {
      if (pickForCreate) {
        stopMusicPreview();
        if (track.id === ORIGINAL_SOUND_TRACK.id) {
          navigate("/create", { replace: true });
          return;
        }
        const dest = createPathWithSound(track.id, track.title);
        navigate(`${dest.pathname}${dest.search}`, { replace: true, state: dest.state });
        return;
      }
      navigate(`/music/${encodeURIComponent(track.id)}`);
    },
    [navigate, pickForCreate],
  );

  const toggleSaveTrack = useCallback(() => {
    if (!featuredTrack || featuredTrack.id === ORIGINAL_SOUND_TRACK.id) {
      showToast("No track to save");
      return;
    }
    const nowSaved = toggleSavedMusicTrack(featuredTrack);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (nowSaved) next.add(featuredTrack.id);
      else next.delete(featuredTrack.id);
      return next;
    });
    showToast(nowSaved ? "Sound saved" : "Removed from saved");
  }, [featuredTrack]);

  const selectPlaylist = useCallback((playlistId: string) => {
    stopMusicPreview();
    setActivePlaylistId(playlistId);
  }, []);

  const onTogglePreview = useCallback(async (track: MusicTrack) => {
    const result = await toggleMusicPreview(track);
    if (result.error) {
      showToast(result.error === "Sounds are muted in settings" ? result.error : "Couldn't play this sound.");
    }
  }, []);

  return (
    <div
      className="page-above-bottom-nav bg-transparent text-white"
      style={{ bottom: "var(--bottom-nav-top)" }}
    >
      <div className="page-above-bottom-nav__inner bg-transparent flex flex-col min-h-0">
        <div className="elix-panel text-white flex flex-col min-h-0 flex-1 h-full">
          <div
            className="flex justify-center pt-0.5 pb-1 flex-shrink-0"
            aria-hidden
            style={{ transform: "translateY(0.6mm)" }}
          >
            <div className="w-10 h-1 rounded-full bg-white/25" />
          </div>

          <header className="w-full shrink-0 bg-transparent z-10 border-b border-white/[0.06]">
            <div className="px-3 pt-page-header pb-3 flex items-center justify-between relative">
              <button
                type="button"
                onClick={() => {
                  goSearch();
                }}
                className="p-1 z-10"
                aria-label="Search"
              >
                <Search className="w-4 h-4 text-[#F5F5F7]" />
              </button>
              <h1 className="text-sm font-bold text-gold-metallic absolute left-1/2 -translate-x-1/2">Sound</h1>
              <button type="button" onClick={goBack} className="p-1 z-10" title="Back" aria-label="Back">
                <RoyceBackIcon />
              </button>
            </div>

            <div className="px-3 pb-3">
              <div className="p-4 rounded-2xl bg-transparent flex gap-4 w-full">
                <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center shrink-0 royce-tile bg-[rgba(255,255,255,0.06)]">
                  {featuredTrack?.coverUrl ? (
                    <img src={featuredTrack.coverUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Music size={22} className="royce-icon-gold" strokeWidth={2.25} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold mb-0.5 truncate">{headerTitle}</h2>
                  <p className="text-white/60 text-xs mb-2 truncate">{headerArtist}</p>
                  <button
                    type="button"
                    disabled={!featuredTrack || featuredTrack.id === ORIGINAL_SOUND_TRACK.id}
                    onClick={toggleSaveTrack}
                    title={trackIsSaved ? "Saved" : "Save"}
                    aria-label={trackIsSaved ? "Saved" : "Save"}
                    className="h-7 px-5 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/15 active:scale-95 transition-transform disabled:opacity-50 border-0 shadow-none w-fit"
                  >
                    <Bookmark
                      size={14}
                      strokeWidth={2.25}
                      className={trackIsSaved ? "text-red-500 fill-red-500" : "text-[#F5F5F7]"}
                      style={
                        trackIsSaved
                          ? { color: "#D91F2D", fill: "#D91F2D", WebkitTextFillColor: "#D91F2D" }
                          : undefined
                      }
                    />
                  </button>
                </div>
              </div>
            </div>

            <div className="px-4 pb-1.5">
              <div className="flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-white/12 bg-white/[0.05]">
                <Search className="w-3 h-3 text-white/40 flex-shrink-0" strokeWidth={2} />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search songs"
                  className="flex-1 min-w-0 bg-transparent text-white text-[11px] leading-none outline-none placeholder:text-white/35"
                />
              </div>
            </div>

            {!search.trim() && playlists.length > 0 ? (
              <div className="px-3 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
                {playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    type="button"
                    onClick={() => selectPlaylist(playlist.id)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                      playlist.id === activePlaylistId
                        ? "bg-white/10 border-[#D8D9DD]/50 text-white"
                        : "border-[#D8D9DD]/35 text-white"
                    }`}
                  >
                    {playlist.name}
                  </button>
                ))}
              </div>
            ) : null}
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto w-full bg-transparent">
            <div className="px-2 pb-6">
              {pickForCreate && !search.trim() ? (
                <div className="w-full px-2 py-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openTrack(ORIGINAL_SOUND_TRACK)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    <div className="w-12 h-12 rounded-full flex-shrink-0 bg-[rgba(255,255,255,0.06)] border border-[#D8D9DD]/20 flex items-center justify-center">
                      <Music className="w-4 h-4 text-[#F5F5F7]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">Original Sound</p>
                      <p className="text-white/50 text-xs truncate">Use mic audio from your clip</p>
                    </div>
                  </button>
                </div>
              ) : null}
              {loading || searching ? (
                <p className="px-3 py-8 text-center text-white/40 text-xs">Loading tracks…</p>
              ) : null}
              {!loading && !searching && visibleTracks.length === 0 ? (
                <p className="px-3 py-8 text-center text-white/40 text-xs">
                  {configured ? "No tracks found" : "Licensed playlists unavailable"}
                </p>
              ) : null}
              {visibleTracks.map((track) => {
                const isPlaying = preview.playingId === track.id;
                const isLoading = preview.loadingId === track.id;
                const isSelected = featuredTrackId === track.id;
                return (
                  <div
                    key={track.id}
                    className={`w-full px-2 py-2 flex items-center gap-2 ${
                      isSelected ? "bg-white/5 rounded-lg" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openTrack(track)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-[rgba(255,255,255,0.06)] border border-[#D8D9DD]/20">
                        {track.coverUrl ? (
                          <img src={track.coverUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music className="w-4 h-4 text-white/40" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">{track.title}</p>
                        <p className="text-white/50 text-xs truncate">
                          {track.artist} • {formatClip(track.clipStartSeconds, track.clipEndSeconds)}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void onTogglePreview(track)}
                      disabled={isLoading}
                      className="w-9 h-9 royce-glow-disc flex items-center justify-center flex-shrink-0 disabled:opacity-50"
                      aria-label={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? (
                        <Pause className="w-3.5 h-3.5 text-white" />
                      ) : (
                        <Play className="w-3.5 h-3.5 text-white" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
