import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { FeedVideo } from "@shared/contracts";
import { ForYouPlayer } from "@/components/ForYouPlayer";
import { RoyceBackIcon, RoyceCloseIcon } from "@/components/royce";
import { apiFetchVideoById } from "@/features/feed/feedApi";
import { VIDEO_EXIT_TO, returnToFromLocationState } from "@/lib/settingsNav";
import { useAuthStore } from "@/store/useAuthStore";

type LoadPhase = "idle" | "loading" | "ready" | "missing" | "failed";

function VideoViewChromeShell({
  onBack,
  children,
}: {
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[9990] bg-transparent flex justify-center">
      <div className="w-full max-w-[480px] relative overflow-hidden bg-transparent h-viewport" style={{ marginTop: 0 }}>
        <div
          className="absolute z-[250] pointer-events-auto"
          style={{
            top: "max(0.75rem, var(--safe-top))",
            right: "max(0.75rem, env(safe-area-inset-right, 0px))",
          }}
        >
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-full bg-transparent border border-transparent text-white"
            aria-label="Back"
          >
            <RoyceCloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function VideoView() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const viewerId = useAuthStore((s) => s.user?.id ?? null);
  const viewerRef = useRef<string | null>(viewerId);
  const loadSeq = useRef(0);
  const [item, setItem] = useState<FeedVideo | null>(null);
  const [phase, setPhase] = useState<LoadPhase>("idle");

  const goBack = useCallback(() => {
    navigate(returnToFromLocationState(location.state) || VIDEO_EXIT_TO, { replace: true });
  }, [navigate, location.state]);

  useEffect(() => {
    const switched = viewerRef.current !== viewerId;
    if (!switched) return;
    viewerRef.current = viewerId;
    loadSeq.current += 1;
    setItem(null);
    setPhase((videoId || "").trim() ? "loading" : "missing");
  }, [viewerId, videoId]);

  useEffect(() => {
    const id = (videoId || "").trim();
    if (!id) {
      setItem(null);
      setPhase("missing");
      return;
    }
    const seq = ++loadSeq.current;
    setItem(null);
    setPhase("loading");
    void apiFetchVideoById(id).then((res) => {
      if (seq !== loadSeq.current) return;
      if (res.video) {
        setItem(res.video);
        setPhase("ready");
        return;
      }
      setItem(null);
      setPhase(res.status === 404 ? "missing" : "failed");
    });
    return () => {
      loadSeq.current += 1;
    };
  }, [videoId, viewerId]);

  if (!(videoId || "").trim()) {
    return (
      <div className="min-h-[100dvh] bg-transparent text-white p-4">
        <button type="button" onClick={goBack} className="flex items-center gap-2 text-white/80">
          <RoyceBackIcon />
          Back
        </button>
        <div className="mt-6 text-white/70">Video not found.</div>
      </div>
    );
  }

  if (phase === "loading" || phase === "idle") {
    return (
      <VideoViewChromeShell onBack={goBack}>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-white/50 text-sm">Loading…</span>
        </div>
      </VideoViewChromeShell>
    );
  }

  if (phase === "failed") {
    return (
      <VideoViewChromeShell onBack={goBack}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
          <span className="text-white/70 text-sm text-center">Couldn&apos;t load this video.</span>
          <button type="button" onClick={goBack} className="text-[#F5F5F7] text-sm font-semibold">
            Go back
          </button>
        </div>
      </VideoViewChromeShell>
    );
  }

  if (phase !== "ready" || !item) {
    return (
      <VideoViewChromeShell onBack={goBack}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
          <span className="text-white/70 text-sm text-center">Video not found or unavailable.</span>
          <button type="button" onClick={goBack} className="text-[#F5F5F7] text-sm font-semibold">
            Go back
          </button>
        </div>
      </VideoViewChromeShell>
    );
  }

  return (
    <div className="page-above-bottom-nav z-[9990] bg-transparent">
      <div className="page-above-bottom-nav__inner relative bg-transparent">
        <div
          className="absolute z-[250] pointer-events-auto"
          style={{
            top: "max(0.75rem, var(--safe-top))",
            right: "max(0.75rem, env(safe-area-inset-right, 0px))",
          }}
        >
          <button
            type="button"
            onClick={goBack}
            className="p-2 rounded-full bg-transparent border border-transparent text-white"
            aria-label="Back"
          >
            <RoyceCloseIcon />
          </button>
        </div>
        <ForYouPlayer
          item={item}
          isActive
          creatorLive={false}
          onPatch={(patch) =>
            setItem((current) =>
              current
                ? {
                    ...current,
                    ...patch,
                    user: patch.user ? { ...current.user, ...patch.user } : current.user,
                    stats: patch.stats ? { ...current.stats, ...patch.stats } : current.stats,
                  }
                : current,
            )
          }
        />
      </div>
    </div>
  );
}
