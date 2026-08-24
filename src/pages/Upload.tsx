import { useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import { useUploadPublishSession } from "@/features/upload/useUploadSession";
import { FEED_HOME } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { canonicalSoundId, normalizeUploadKind } from "@shared/uploadContract";

const FRIENDS_HOME = "/friends";

export default function Upload() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const kind = normalizeUploadKind(params.get("type"));
  const querySound = canonicalSoundId(params.get("sound") || params.get("soundId"));
  const { state, session } = useUploadPublishSession(kind, querySound);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = state.phase === "uploading" || state.phase === "publishing";

  const goAfterSuccess = useCallback(
    (publishedKind: "video" | "story") => {
      navigate(publishedKind === "story" ? FRIENDS_HOME : FEED_HOME, { replace: true });
    },
    [navigate],
  );

  const onClose = useCallback(() => {
    if (busy) {
      session.cancelInFlight();
    }
    session.discard();
    navigate(FEED_HOME, { replace: true });
  }, [busy, navigate, session]);

  const onPost = useCallback(() => {
    void session.post().then((result) => {
      if (result.ok && result.id) {
        showToast(kind === "story" ? "Story posted!" : "Video posted!");
        goAfterSuccess(kind);
        return;
      }
      if (!result.ok && result.error === "busy") return;
      if (!result.ok && "status" in result && result.status === 401) {
        navigate("/login", { replace: true, state: { from: "/upload" } });
        return;
      }
      if (!result.ok && result.error && result.error !== "no-media") {
        showToast(result.error === "session" || result.error === "publish" ? "Upload failed" : result.error);
      }
    });
  }, [goAfterSuccess, kind, navigate, session]);

  return (
    <div className="page-above-bottom-nav text-white" data-elix-page="upload">
      <div className="page-above-bottom-nav__inner flex flex-col min-h-0">
        <header className="flex items-center justify-between px-4 pb-2" style={{ paddingTop: "var(--page-header-top)" }}>
          <button
            type="button"
            onClick={() => {
              session.discard();
              navigate("/create", { replace: true });
            }}
            className="p-1 text-xs font-semibold text-white/80"
            disabled={busy}
          >
            Retake
          </button>
          <h1 className="text-[16px] font-bold">{kind === "story" ? "Story" : "Upload"}</h1>
          <button type="button" onClick={onClose} className="p-1" aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 px-4 pb-6 space-y-3 min-h-0 overflow-y-auto">
          <div
            className="block w-full aspect-[9/16] max-h-[46vh] rounded-xl overflow-hidden bg-black border border-white/10"
            onClick={() => {
              if (!state.media) fileRef.current?.click();
            }}
          >
            {state.media ? (
              state.media.kind === "image" ? (
                <img src={state.media.objectUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <video
                  src={state.media.objectUrl}
                  className="w-full h-full object-cover"
                  muted={state.mutedPreview}
                  playsInline
                  loop
                  autoPlay
                  onClick={(event) => {
                    event.stopPropagation();
                    session.setMutedPreview(!state.mutedPreview);
                  }}
                />
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/40 text-sm">Tap to choose video</div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={kind === "story" ? "video/*,image/*" : "video/*"}
            className="hidden"
            onChange={(event) => {
              const next = event.target.files?.[0];
              event.target.value = "";
              if (next) session.acceptGalleryFile(next);
            }}
          />
          <button
            type="button"
            className="text-xs text-white/70"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {state.media ? "Replace media" : "Choose from gallery"}
          </button>
          {state.soundId ? <p className="text-xs text-white/70">Sound attached</p> : null}
          <input
            value={state.caption}
            onChange={(event) => session.setCaption(event.target.value)}
            placeholder="Caption…"
            className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-3"
            aria-label="Caption"
            disabled={busy}
          />
          <input
            value={state.hashtagsText}
            onChange={(event) => session.setHashtagsText(event.target.value)}
            placeholder="#hashtags"
            className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-3"
            aria-label="Hashtags"
            disabled={busy}
          />
          {state.error ? (
            <div className="w-full px-3 py-2 rounded-lg bg-red-600/80 text-white text-xs">
              {state.error}
              <button type="button" onClick={() => session.clearError()} className="ml-2 underline">
                ×
              </button>
            </div>
          ) : null}
          {busy ? (
            <div>
              <div className="flex items-center justify-between text-xs text-white mb-1">
                <span>{state.phase === "publishing" || state.progress === 100 ? "Finalizing…" : "Uploading…"}</span>
                <span>{state.progress == null ? "" : `${state.progress}%`}</span>
              </div>
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-[#E6E9EE] elix-progress-fill ${state.progress == null ? "animate-pulse w-1/3" : ""}`}
                  style={state.progress == null ? undefined : { width: `${state.progress}%` }}
                />
              </div>
            </div>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onPost}
            className="w-full border border-[#D8D9DD]/40 rounded-xl py-3 font-bold"
          >
            {busy ? "Posting…" : kind === "story" ? "Your Story" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
