import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { FeedVideo } from "@shared/contracts";
import { ForYouPlayer } from "@/components/ForYouPlayer";
import { RoyceBackIcon, RoyceCloseIcon } from "@/components/royce";
import { apiFetchVideoById } from "@/features/feed/feedApi";
import { VIDEO_EXIT_TO, returnToFromLocationState } from "@/lib/settingsNav";

type LoadPhase = "idle" | "loading" | "ready" | "missing" | "failed";

function VideoViewChrome({
  onBack,
  children,
}: {
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative h-full min-h-0 w-full elix-page-glass bg-transparent overflow-hidden">
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
  );
}

export default function VideoView() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [item, setItem] = useState<FeedVideo | null>(null);
  const [phase, setPhase] = useState<LoadPhase>("idle");

  const goBack = useCallback(() => {
    navigate(returnToFromLocationState(location.state) || VIDEO_EXIT_TO, { replace: true });
  }, [navigate, location.state]);

  useEffect(() => {
    const id = (videoId || "").trim();
    if (!id) {
      setItem(null);
      setPhase("missing");
      return;
    }
    let cancelled = false;
    setItem(null);
    setPhase("loading");
    void apiFetchVideoById(id).then((res) => {
      if (cancelled) return;
      if (res.video) {
        setItem(res.video);
        setPhase("ready");
        return;
      }
      setItem(null);
      setPhase(res.status === 404 ? "missing" : "failed");
    });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  if (!(videoId || "").trim()) {
    return (
      <div className="h-full min-h-0 elix-page-glass bg-transparent text-white p-4">
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
      <VideoViewChrome onBack={goBack}>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-white/50 text-sm">Loading…</span>
        </div>
      </VideoViewChrome>
    );
  }

  if (phase === "failed") {
    return (
      <VideoViewChrome onBack={goBack}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
          <span className="text-white/70 text-sm text-center">Couldn&apos;t load this video.</span>
          <button type="button" onClick={goBack} className="text-[#F5F5F7] text-sm font-semibold">
            Go back
          </button>
        </div>
      </VideoViewChrome>
    );
  }

  if (phase !== "ready" || !item) {
    return (
      <VideoViewChrome onBack={goBack}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
          <span className="text-white/70 text-sm text-center">Video not found or unavailable.</span>
          <button type="button" onClick={goBack} className="text-[#F5F5F7] text-sm font-semibold">
            Go back
          </button>
        </div>
      </VideoViewChrome>
    );
  }

  return (
    <VideoViewChrome onBack={goBack}>
      <div className="absolute inset-0">
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
    </VideoViewChrome>
  );
}
