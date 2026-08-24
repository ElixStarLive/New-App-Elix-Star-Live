import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Eraser, Hash, Image, Mic, Sliders, Sparkles, Subtitles, Wand2 } from "lucide-react";
import {
  AI_FILTER_CATEGORIES,
  AI_FILTER_PRESETS,
  BACKGROUND_OPTIONS,
  DEFAULT_ENHANCE,
  SUBTITLE_LANGUAGES,
  SUBTITLE_STYLES,
  VOICE_EFFECTS,
  type AiFilterCategory,
  type AiFilterPreset,
  type AiStudioTab,
  type BackgroundOption,
  type EnhanceSettings,
} from "@/features/aiStudio/catalog";
import { extractThumbnails, type ThumbnailCandidate } from "@/features/aiStudio/extractThumbnails";
import { autoEnhanceFromFrame, enhanceToCss, scaleFilterCss } from "@/features/aiStudio/looks";
import { speechRecognitionSupported, StudioSpeechCapture } from "@/features/aiStudio/speechCapture";
import { suggestCaptions, suggestHashtags, type CaptionSuggestion } from "@/features/aiStudio/suggestCaptions";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string | null;
  videoEl: HTMLVideoElement | null;
  onFilterChange: (css: string) => void;
  onEnhanceChange: (css: string) => void;
  onBackgroundChange: (option: BackgroundOption | null) => void;
  onCaptionSelect: (caption: string, hashtags: string[]) => void;
  onThumbnailSelect: () => void;
  onVoiceEffectChange: () => void;
  onSpeechResult: (count: number) => void;
  onSpeechUnsupported: () => void;
  onSpeechEmpty: () => void;
  onThumbnailFail: () => void;
};

const TABS: { id: AiStudioTab; label: string; icon: typeof Sparkles }[] = [
  { id: "filters", label: "Filters", icon: Sparkles },
  { id: "enhance", label: "Enhance", icon: Sliders },
  { id: "captions", label: "Captions", icon: Hash },
  { id: "thumbnails", label: "Thumbnail", icon: Image },
  { id: "voice", label: "Voice FX", icon: Mic },
  { id: "subtitles", label: "Subtitles", icon: Subtitles },
  { id: "background", label: "Background", icon: Eraser },
];

const ENHANCE_SLIDERS: { key: keyof EnhanceSettings; label: string; min: number; max: number }[] = [
  { key: "brightness", label: "Brightness", min: -50, max: 50 },
  { key: "contrast", label: "Contrast", min: -50, max: 50 },
  { key: "saturation", label: "Saturation", min: -50, max: 50 },
  { key: "warmth", label: "Warmth", min: -50, max: 50 },
  { key: "sharpness", label: "Sharpness", min: 0, max: 100 },
  { key: "vignette", label: "Vignette", min: 0, max: 100 },
  { key: "grain", label: "Film Grain", min: 0, max: 100 },
  { key: "fade", label: "Fade", min: 0, max: 100 },
];

export default function AiStudioToolsSheet({
  isOpen,
  onClose,
  videoUrl,
  videoEl,
  onFilterChange,
  onEnhanceChange,
  onBackgroundChange,
  onCaptionSelect,
  onThumbnailSelect,
  onVoiceEffectChange,
  onSpeechResult,
  onSpeechUnsupported,
  onSpeechEmpty,
  onThumbnailFail,
}: Props) {
  const [activeTab, setActiveTab] = useState<AiStudioTab>("filters");
  const [selectedFilter, setSelectedFilter] = useState("none");
  const [filterIntensity, setFilterIntensity] = useState(100);
  const [filterCategory, setFilterCategory] = useState<AiFilterCategory>("cinematic");
  const [enhance, setEnhance] = useState<EnhanceSettings>(DEFAULT_ENHANCE);
  const [captionInput, setCaptionInput] = useState("");
  const [captionSuggestions, setCaptionSuggestions] = useState<CaptionSuggestion[]>([]);
  const [generatedHashtags, setGeneratedHashtags] = useState<string[]>([]);
  const [thumbnails, setThumbnails] = useState<ThumbnailCandidate[]>([]);
  const [loadingThumbs, setLoadingThumbs] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("none");
  const [selectedSubStyle, setSelectedSubStyle] = useState("classic");
  const [subLang, setSubLang] = useState("en-US");
  const [subtitling, setSubtitling] = useState(false);
  const [selectedBg, setSelectedBg] = useState("none");
  const speechRef = useRef<StudioSpeechCapture | null>(null);
  const thumbLock = useRef(false);

  const applyFilter = useCallback(
    (preset: AiFilterPreset, intensity: number) => {
      setSelectedFilter(preset.id);
      onFilterChange(preset.css === "none" ? "none" : scaleFilterCss(preset.css, intensity));
    },
    [onFilterChange],
  );

  const applyEnhance = useCallback(
    (next: EnhanceSettings) => {
      setEnhance(next);
      onEnhanceChange(enhanceToCss(next));
    },
    [onEnhanceChange],
  );

  const handleExtractThumbnails = useCallback(async () => {
    if (!videoUrl || thumbLock.current) return;
    thumbLock.current = true;
    setLoadingThumbs(true);
    try {
      const rows = await extractThumbnails(videoUrl, 8);
      setThumbnails(rows);
      if (rows.length === 0) onThumbnailFail();
    } catch {
      onThumbnailFail();
    } finally {
      thumbLock.current = false;
      setLoadingThumbs(false);
    }
  }, [videoUrl, onThumbnailFail]);

  useEffect(() => {
    if (!isOpen || activeTab !== "thumbnails" || !videoUrl || thumbnails.length > 0 || loadingThumbs) return;
    void handleExtractThumbnails();
  }, [isOpen, activeTab, videoUrl, thumbnails.length, loadingThumbs, handleExtractThumbnails]);

  useEffect(() => {
    return () => {
      speechRef.current?.stop();
    };
  }, []);

  const toggleSubtitles = () => {
    if (subtitling) {
      const segments = speechRef.current?.stop() ?? [];
      setSubtitling(false);
      if (segments.length > 0) {
        onCaptionSelect(segments.map((s) => s.text).join(" ").trim(), []);
        onSpeechResult(segments.length);
      } else {
        onSpeechEmpty();
      }
      return;
    }
    if (!speechRecognitionSupported()) {
      onSpeechUnsupported();
      return;
    }
    if (!speechRef.current) speechRef.current = new StudioSpeechCapture();
    const started = speechRef.current.start(subLang, () => undefined);
    if (!started) {
      onSpeechUnsupported();
      return;
    }
    setSubtitling(true);
  };

  if (!isOpen) return null;

  const presets = AI_FILTER_PRESETS.filter((f) => f.category === filterCategory || f.id === "none");

  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close AI tools" onClick={onClose} />
      <div className="relative w-full max-w-[480px] elix-more-options-sheet rounded-t-2xl overflow-hidden" style={{ maxHeight: "70dvh" }}>
        <div className="flex flex-col px-4 pt-2 pb-3 border-b border-white/10">
          <div className="flex justify-center pb-2" aria-hidden>
            <div className="w-10 h-1 rounded-full bg-white/25" />
          </div>
          <span className="text-[#F5F5F7] font-bold text-sm text-center">AI Studio</span>
        </div>

        <div className="flex overflow-x-auto no-scrollbar px-2 py-2 gap-1 border-b border-white/5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border border-transparent ${
                  activeTab === tab.id ? "opacity-100" : "opacity-45"
                }`}
              >
                <Icon size={16} />
                <span className="elix-silver-red-text">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="overflow-y-auto p-4" style={{ maxHeight: "calc(70dvh - 100px)" }}>
          {activeTab === "filters" ? (
            <div className="space-y-4">
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                {AI_FILTER_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setFilterCategory(cat.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border border-transparent ${
                      filterCategory === cat.id ? "opacity-100" : "opacity-45"
                    }`}
                  >
                    <span className="elix-silver-red-text">{cat.label}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {presets.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => applyFilter(filter, filterIntensity)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border border-transparent ${
                      selectedFilter === filter.id ? "opacity-100" : "opacity-45"
                    }`}
                  >
                    <span className="text-2xl">{filter.preview}</span>
                    <span className="elix-silver-red-text text-[10px] leading-tight text-center">{filter.name}</span>
                  </button>
                ))}
              </div>
              <div>
                <div className="flex justify-between text-xs text-white/50 mb-1">
                  <span>Intensity</span>
                  <span>{filterIntensity}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={filterIntensity}
                  title="Filter intensity"
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setFilterIntensity(next);
                    const preset = AI_FILTER_PRESETS.find((p) => p.id === selectedFilter);
                    if (preset) applyFilter(preset, next);
                  }}
                  className="w-full accent-[#FFFFFF] h-1"
                />
              </div>
            </div>
          ) : null}

          {activeTab === "enhance" ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!videoEl) return;
                    applyEnhance(autoEnhanceFromFrame(videoEl));
                  }}
                  className="flex-1 py-2 rounded-xl bg-transparent border border-white/30 text-xs font-bold flex items-center justify-center gap-1.5 active:opacity-70"
                >
                  <Wand2 size={14} className="text-[#F5F5F7]" />
                  <span className="elix-silver-red-text">Auto Enhance</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyEnhance({ ...DEFAULT_ENHANCE })}
                  className="flex-1 py-2 rounded-xl bg-transparent border border-white/15 text-xs font-bold active:opacity-70"
                >
                  <span className="elix-silver-red-text">Reset</span>
                </button>
              </div>
              {ENHANCE_SLIDERS.map((row) => (
                <div key={row.key}>
                  <div className="flex justify-between text-xs text-white/50 mb-1">
                    <span>{row.label}</span>
                    <span>{enhance[row.key]}</span>
                  </div>
                  <input
                    type="range"
                    min={row.min}
                    max={row.max}
                    value={enhance[row.key]}
                    title={row.label}
                    onChange={(e) => applyEnhance({ ...enhance, [row.key]: Number(e.target.value) })}
                    className="w-full accent-[#FFFFFF] h-1"
                  />
                </div>
              ))}
            </div>
          ) : null}

          {activeTab === "captions" ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/50 mb-1 block">Describe your video</label>
                <textarea
                  value={captionInput}
                  onChange={(e) => setCaptionInput(e.target.value)}
                  placeholder="Dance video with friends at sunset..."
                  className="w-full bg-[rgba(0,0,0,0.35)] text-white text-sm rounded-xl px-3 py-2 border border-white/10 resize-none h-20 outline-none focus:border-[#D8D9DD]/50"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setCaptionSuggestions(suggestCaptions(captionInput));
                  setGeneratedHashtags(suggestHashtags(captionInput, 10));
                }}
                className="w-full py-2.5 rounded-xl bg-transparent border border-white/30 text-xs font-bold flex items-center justify-center gap-1.5 active:opacity-70"
              >
                <Sparkles size={14} className="text-[#F5F5F7]" />
                <span className="elix-silver-red-text">Generate AI Captions & Hashtags</span>
              </button>
              {captionSuggestions.length > 0 ? (
                <div className="space-y-2">
                  <span className="text-xs text-white/50">AI Suggestions</span>
                  {captionSuggestions.map((s, i) => (
                    <button
                      key={`${s.caption}-${i}`}
                      type="button"
                      onClick={() => onCaptionSelect(s.caption, s.hashtags)}
                      className="w-full text-left p-3 rounded-xl bg-[rgba(0,0,0,0.35)]"
                    >
                      <p className="text-white text-sm mb-1">{s.caption}</p>
                      <p className="text-[#F5F5F7] text-xs">{s.hashtags.map((h) => `#${h}`).join(" ")}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-[#E6E9EE] elix-progress-fill" style={{ width: `${Math.round(s.score * 100)}%` }} />
                        </div>
                        <span className="text-[10px] text-white/30">{Math.round(s.score * 100)}%</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
              {generatedHashtags.length > 0 ? (
                <div>
                  <span className="text-xs text-white/50 block mb-2">Trending Hashtags</span>
                  <div className="flex flex-wrap gap-1.5">
                    {generatedHashtags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => onCaptionSelect("", [tag])}
                        className="px-2.5 py-1 rounded-full bg-transparent border border-transparent text-xs font-medium active:opacity-70"
                      >
                        <span className="elix-silver-red-text">#{tag}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTab === "thumbnails" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50">AI-ranked best frames</span>
                <button
                  type="button"
                  onClick={() => {
                    setThumbnails([]);
                    void handleExtractThumbnails();
                  }}
                  className="px-3 py-1 rounded-full bg-transparent border border-white/25 text-xs font-semibold active:opacity-70"
                >
                  <span className="elix-silver-red-text">Refresh</span>
                </button>
              </div>
              {loadingThumbs ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
                </div>
              ) : thumbnails.length === 0 ? (
                <div className="text-center py-8 text-white/30 text-sm">
                  {videoUrl ? "No frames extracted yet" : "Record or upload a video first"}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {thumbnails.map((thumb, i) => (
                    <button
                      key={`${thumb.timestamp}-${i}`}
                      type="button"
                      onClick={onThumbnailSelect}
                      className="relative rounded-xl overflow-hidden aspect-[9/16]"
                    >
                      <img src={thumb.dataUrl} alt="" className="w-full h-full object-cover" />
                      {i === 0 ? (
                        <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 border border-white/30 text-[8px] font-bold">
                          <span className="elix-silver-red-text">BEST</span>
                        </div>
                      ) : null}
                      <div className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/60 text-white text-[8px]">
                        {Math.round(thumb.score * 100)}%
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "voice" ? (
            <div className="space-y-4">
              <p className="text-xs text-white/50">Apply voice effects to your recording</p>
              <div className="grid grid-cols-3 gap-2">
                {VOICE_EFFECTS.map((effect) => (
                  <button
                    key={effect.id}
                    type="button"
                    onClick={() => {
                      setSelectedVoice(effect.id);
                      onVoiceEffectChange();
                    }}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border border-transparent ${
                      selectedVoice === effect.id ? "opacity-100" : "opacity-45"
                    }`}
                  >
                    <span className="text-xl">{effect.icon}</span>
                    <span className="elix-silver-red-text text-[10px] text-center leading-tight">{effect.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === "subtitles" ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/50 mb-1 block">Language</label>
                <div className="relative">
                  <select
                    value={subLang}
                    title="Subtitle language"
                    onChange={(e) => setSubLang(e.target.value)}
                    className="w-full bg-[rgba(0,0,0,0.35)] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 outline-none appearance-none"
                  >
                    {SUBTITLE_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                </div>
              </div>
              <button
                type="button"
                onClick={toggleSubtitles}
                className="w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-white/30 active:opacity-70 bg-transparent"
              >
                <Subtitles size={14} className="text-[#F5F5F7]" />
                <span className="elix-silver-red-text">{subtitling ? "Stop Auto-Subtitles" : "Start Auto-Subtitles"}</span>
              </button>
              <div>
                <span className="text-xs text-white/50 block mb-2">Subtitle Style</span>
                <div className="grid grid-cols-2 gap-2">
                  {SUBTITLE_STYLES.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setSelectedSubStyle(style.id)}
                      className={`p-3 rounded-xl text-left border border-transparent ${
                        selectedSubStyle === style.id ? "opacity-100" : "opacity-45"
                      }`}
                    >
                      <div className="elix-silver-red-text text-sm font-bold mb-0.5 truncate" style={{ fontFamily: style.fontFamily }}>
                        {style.name}
                      </div>
                      <div className="elix-silver-red-text text-[10px] opacity-70">
                        {style.animation} · {style.position}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "background" ? (
            <div className="space-y-4">
              <p className="text-xs text-white/50">Replace or blur your background</p>
              <div className="grid grid-cols-3 gap-2">
                {BACKGROUND_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSelectedBg(opt.id);
                      onBackgroundChange(opt.id === "none" ? null : opt);
                    }}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border border-transparent ${
                      selectedBg === opt.id ? "opacity-100" : "opacity-45"
                    }`}
                  >
                    <span className="text-xl">{opt.preview}</span>
                    <span className="elix-silver-red-text text-[10px] text-center leading-tight">{opt.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
