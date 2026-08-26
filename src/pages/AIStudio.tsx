import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Play, Share2, Sparkles, Upload, Wand2 } from "lucide-react";
import { RoyceBackIcon } from "@/components/royce";
import AiStudioToolsSheet from "@/components/AiStudioToolsSheet";
import { createAiStudioSession } from "@/features/aiStudio/aiStudioSession";
import { panelBackgroundBlur, panelBackgroundStyle } from "@/features/aiStudio/looks";
import { useAiStudioSession } from "@/features/aiStudio/useAiStudioSession";
import { AI_STUDIO_EXIT_TO, exitToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

function downloadJpeg(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `elix-ai-frame-${Date.now()}.jpg`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AIStudio() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const sessionRef = useRef(createAiStudioSession());
  const session = sessionRef.current;
  const snap = useAiStudioSession(session);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef(userId);

  useEffect(() => {
    const owned = sessionRef.current;
    return () => {
      owned.dispose();
    };
  }, []);

  useEffect(() => {
    if (accountRef.current === userId) return;
    accountRef.current = userId;
    sessionRef.current.dispose();
  }, [userId]);

  const goBack = useCallback(() => {
    session.dispose();
    navigate(exitToFromLocationState(location.state, AI_STUDIO_EXIT_TO), { replace: true });
  }, [navigate, location.state, session]);

  const exportFrame = useCallback(async () => {
    const result = await session.exportFrame();
    if (!result.ok) {
      if (result.reason === "busy") return;
      showToast(result.reason === "no-video" ? "Load a video first" : "Export failed");
      return;
    }
    downloadJpeg(result.blob);
    showToast("Frame exported");
  }, [session]);

  const onVideoFile = (file: File | undefined) => {
    if (!file) return;
    const out = session.importVideo(file);
    if (!out.ok) showToast("Choose a video file");
  };

  const onBgFile = (file: File | undefined) => {
    if (!file) return;
    const out = session.importBackground(file);
    if (!out.ok) showToast("Choose an image file");
    else showToast("Background added");
  };

  const bgStyle = panelBackgroundStyle(snap.panelBackground);
  const bgBlur = panelBackgroundBlur(snap.panelBackground);

  return (
    <div className="fixed top-0 bottom-0 left-1/2 -translate-x-1/2 z-[60] h-[100dvh] w-full max-w-[480px] elix-page-glass text-white flex flex-col overflow-hidden">
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        title="Select video"
        onChange={(e) => {
          onVideoFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={bgInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        title="Select background"
        onChange={(e) => {
          onBgFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <canvas
        ref={(el) => {
          session.attachCanvas(el);
        }}
        className="hidden"
      />

      <header className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <button type="button" onClick={() => void exportFrame()} className="p-1" title="Export frame">
          <Download size={16} className="text-white/70" />
        </button>
        <div className="flex items-center gap-2">
          <Wand2 size={15} className="text-[#F5F5F7]" />
          <span className="text-white font-bold text-sm">AI Studio</span>
        </div>
        <button type="button" onClick={goBack} className="p-1" aria-label="Back">
          <RoyceBackIcon />
        </button>
      </header>

      <div className={`flex-1 relative flex items-center justify-center overflow-hidden ${snap.videoUrl ? "bg-black" : ""}`}>
        {bgStyle ? <div className="absolute inset-0 z-0" style={bgStyle} /> : null}
        {snap.bgUrl ? (
          <img
            src={snap.bgUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover z-0"
            draggable={false}
            style={bgBlur ? { filter: bgBlur } : undefined}
          />
        ) : null}
        {snap.videoUrl ? (
          <>
            <video
              ref={(el) => {
                session.attachVideo(el);
              }}
              src={snap.videoUrl}
              className="relative z-[1] w-full h-full object-contain"
              autoPlay
              loop
              playsInline
              muted
              style={{ filter: snap.combinedFilter }}
              onPlay={() => session.setPlaying(true)}
              onPause={() => session.setPlaying(false)}
            />
            <button
              type="button"
              title={snap.playing ? "Pause" : "Play"}
              onClick={() => {
                const v = session.videoElement();
                if (!v) return;
                if (v.paused) void v.play();
                else v.pause();
              }}
              className="absolute inset-0 flex items-center justify-center z-10"
            >
              {!snap.playing ? (
                <div className="w-16 h-16 rounded-full bg-black/40 flex items-center justify-center">
                  <Play size={30} className="text-white ml-1" />
                </div>
              ) : null}
            </button>
          </>
        ) : (
          <div className="relative z-[1] flex flex-col items-center gap-4 p-8">
            <div className="w-24 h-24 rounded-2xl bg-transparent flex items-center justify-center">
              <Upload size={36} className="text-[#F5F5F7]" />
            </div>
            <p className="elix-silver-red-text text-sm text-center">Import a video to start editing with AI tools</p>
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="px-6 py-3 rounded-full bg-transparent border border-white/30 font-bold text-sm flex items-center gap-2 active:opacity-70"
            >
              <Upload size={16} className="text-[#F5F5F7]" />
              <span className="elix-silver-red-text">Select Video</span>
            </button>
            <button
              type="button"
              onClick={() => bgInputRef.current?.click()}
              className="px-6 py-3 rounded-full bg-transparent border border-white/30 font-bold text-sm flex items-center gap-2 active:opacity-70"
            >
              <span className="elix-silver-red-text">{snap.bgUrl ? "Change background" : "Add background"}</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-around px-4 py-3 border-t border-white/5 flex-shrink-0">
        <button type="button" onClick={() => videoInputRef.current?.click()} className="flex flex-col items-center gap-1 active:opacity-70">
          <Upload size={16} className="text-[#F5F5F7]" />
          <span className="elix-silver-red-text text-[10px]">Import</span>
        </button>
        <button type="button" onClick={() => bgInputRef.current?.click()} className="flex flex-col items-center gap-1 active:opacity-70" title="Add your own background">
          <Sparkles size={16} className="text-[#F5F5F7]" />
          <span className="elix-silver-red-text text-[10px]">Background</span>
        </button>
        <button type="button" onClick={() => session.setToolsOpen(true)} className="flex flex-col items-center gap-1 active:opacity-70">
          <Wand2 size={18} className="text-[#F5F5F7]" />
          <span className="elix-silver-red-text text-[10px]">AI Tools</span>
        </button>
        <button
          type="button"
          onClick={() => {
            session.resetLooks();
            showToast("Reset");
          }}
          className="flex flex-col items-center gap-1 active:opacity-70"
        >
          <ArrowLeft size={16} className="text-[#F5F5F7] rotate-[135deg]" />
          <span className="elix-silver-red-text text-[10px]">Reset</span>
        </button>
        <button type="button" onClick={() => void exportFrame()} className="flex flex-col items-center gap-1 active:opacity-70">
          <Share2 size={16} className="text-[#F5F5F7]" />
          <span className="elix-silver-red-text text-[10px]">Export</span>
        </button>
      </div>

      <AiStudioToolsSheet
        key={userId ?? "anon"}
        isOpen={snap.toolsOpen}
        onClose={() => session.setToolsOpen(false)}
        videoUrl={snap.videoUrl}
        videoEl={session.videoElement()}
        onFilterChange={(css) => session.setFilterCss(css)}
        onEnhanceChange={(css) => session.setEnhanceCss(css)}
        onBackgroundChange={(opt) => session.setPanelBackground(opt)}
        onCaptionSelect={(caption) => {
          if (caption) showToast("Caption ready — copy it from AI Tools");
        }}
        onThumbnailSelect={() => showToast("Thumbnail uses the filtered frame on export")}
        onVoiceEffectChange={() => showToast("Voice preview — AI Studio exports the filtered frame only")}
        onSpeechResult={(count) => showToast(`Captured ${count} subtitle segment${count === 1 ? "" : "s"}`)}
        onSpeechUnsupported={() => showToast("Speech recognition not supported on this device")}
        onSpeechEmpty={() => showToast("No speech detected")}
        onThumbnailFail={() => showToast("Could not extract thumbnails")}
      />
    </div>
  );
}
