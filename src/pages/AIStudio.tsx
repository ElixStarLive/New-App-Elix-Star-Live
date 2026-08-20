import { useCallback, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Play, Share2, Sparkles, Upload, Wand2, X } from "lucide-react";
import { AI_STUDIO_EXIT_TO, exitToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";

const FILTERS = [
  { label: "None", css: "none" },
  { label: "Bright", css: "brightness(1.15) contrast(1.05)" },
  { label: "Warm", css: "sepia(0.25) saturate(1.2)" },
  { label: "Cool", css: "hue-rotate(15deg) saturate(1.1)" },
];

export default function AIStudio() {
  const navigate = useNavigate();
  const location = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [filterCss, setFilterCss] = useState("none");

  const goBack = useCallback(() => {
    navigate(exitToFromLocationState(location.state, AI_STUDIO_EXIT_TO), { replace: true });
  }, [navigate, location.state]);

  const exportFrame = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      showToast("Load a video first");
      return;
    }
    canvas.width = video.videoWidth || 1080;
    canvas.height = video.videoHeight || 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (filterCss !== "none") ctx.filter = filterCss;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.filter = "none";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    if (!blob) {
      showToast("Export failed");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `elix-ai-frame-${Date.now()}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Frame exported");
  };

  return (
    <div className="fixed top-0 bottom-0 left-1/2 -translate-x-1/2 z-[60] h-[100dvh] w-full max-w-[480px] elix-page-glass text-white flex flex-col overflow-hidden">
      <input ref={fileInputRef} type="file" accept="video/*" className="hidden" title="Select video" onChange={(e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        setVideoUrl(URL.createObjectURL(file));
        setIsPlaying(true);
        e.target.value = "";
      }} />
      <input ref={bgInputRef} type="file" accept="image/*" className="hidden" title="Select background" onChange={(e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (bgUrl) URL.revokeObjectURL(bgUrl);
        setBgUrl(URL.createObjectURL(file));
        e.target.value = "";
      }} />
      <canvas ref={canvasRef} className="hidden" />

      <header className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <button type="button" onClick={() => void exportFrame()} className="p-1" title="Export frame">
          <Download size={16} className="text-white/70" />
        </button>
        <div className="flex items-center gap-2">
          <Wand2 size={15} className="text-[#F5F5F7]" />
          <span className="text-white font-bold text-sm">AI Studio</span>
        </div>
        <button type="button" onClick={goBack} className="p-1" aria-label="Back">
          <X size={18} />
        </button>
      </header>

      <div className={`flex-1 relative flex items-center justify-center overflow-hidden ${videoUrl ? "bg-black" : ""}`}>
        {bgUrl ? <img src={bgUrl} alt="" className="absolute inset-0 w-full h-full object-cover z-0" draggable={false} /> : null}
        {videoUrl ? (
          <>
            <video
              ref={videoRef}
              src={videoUrl}
              className="relative z-[1] w-full h-full object-contain"
              autoPlay
              loop
              playsInline
              muted
              style={{ filter: filterCss === "none" ? undefined : filterCss }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
            <button
              type="button"
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                if (v.paused) void v.play();
                else v.pause();
              }}
              className="absolute inset-0 flex items-center justify-center z-10"
            >
              {!isPlaying ? (
                <div className="w-16 h-16 rounded-full bg-black/40 flex items-center justify-center">
                  <Play size={30} className="text-white ml-1" />
                </div>
              ) : null}
            </button>
          </>
        ) : (
          <div className="relative z-[1] flex flex-col items-center gap-4 p-8">
            <div className="w-24 h-24 rounded-2xl flex items-center justify-center">
              <Upload size={36} className="text-[#F5F5F7]" />
            </div>
            <p className="elix-silver-red-text text-sm text-center">Import a video to start editing with AI tools</p>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="px-6 py-3 rounded-full border border-white/30 font-bold text-sm flex items-center gap-2">
              <Upload size={16} className="text-[#F5F5F7]" />
              <span className="elix-silver-red-text">Select Video</span>
            </button>
            <button type="button" onClick={() => bgInputRef.current?.click()} className="px-6 py-3 rounded-full border border-white/30 font-bold text-sm">
              <span className="elix-silver-red-text">{bgUrl ? "Change background" : "Add background"}</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-around px-4 py-3 border-t border-white/5 flex-shrink-0">
        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-1">
          <Upload size={16} className="text-[#F5F5F7]" />
          <span className="elix-silver-red-text text-[10px]">Import</span>
        </button>
        <button type="button" onClick={() => bgInputRef.current?.click()} className="flex flex-col items-center gap-1">
          <Sparkles size={16} className="text-[#F5F5F7]" />
          <span className="elix-silver-red-text text-[10px]">Background</span>
        </button>
        <button type="button" onClick={() => setShowTools(true)} className="flex flex-col items-center gap-1">
          <Wand2 size={18} className="text-[#F5F5F7]" />
          <span className="elix-silver-red-text text-[10px]">AI Tools</span>
        </button>
        <button type="button" onClick={() => setFilterCss("none")} className="flex flex-col items-center gap-1">
          <ArrowLeft size={16} className="text-[#F5F5F7] rotate-[135deg]" />
          <span className="elix-silver-red-text text-[10px]">Reset</span>
        </button>
        <button type="button" onClick={() => void exportFrame()} className="flex flex-col items-center gap-1">
          <Share2 size={16} className="text-[#F5F5F7]" />
          <span className="elix-silver-red-text text-[10px]">Export</span>
        </button>
      </div>

      {showTools ? (
        <div className="absolute inset-x-0 bottom-0 z-20 rounded-t-2xl border-t border-white/10 p-4" style={{ backgroundColor: "var(--elix-bg)" }}>
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-bold">AI Tools</span>
            <button type="button" onClick={() => setShowTools(false)} aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {FILTERS.map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={() => setFilterCss(f.css)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border ${filterCss === f.css ? "border-white" : "border-white/20"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
