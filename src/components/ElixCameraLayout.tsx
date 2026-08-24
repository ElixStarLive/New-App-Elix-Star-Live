import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Clock,
  Crosshair,
  Gauge,
  ImagePlus,
  Music,
  Palette,
  RotateCcw,
  Sparkles,
  Star,
  Type,
  User,
  Wand2,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
  RefreshCw,
} from "lucide-react";
import { CaptureShutterButton } from "@/components/CaptureShutterButton";
import { apiFetchCameraFilters, apiFetchSpeedOptions, apiFetchStickerOptions } from "@/features/camera/cameraOptionsApi";
import { platform } from "@/lib/platform";
import {
  CAMERA_FILTER_OPTIONS,
  CAMERA_SPEED_OPTIONS,
  CAMERA_STICKER_OPTIONS,
  type CameraFilterOption,
  type CameraSpeedOption,
} from "@shared/cameraOptions";

export type CreateTab = "post" | "create" | "live";
export type CameraDuration = "10m" | "60s" | "15s" | "PHOTO" | "TEXT";

type FilterSwatch = CameraFilterOption;

const DURATIONS: CameraDuration[] = ["10m", "60s", "15s", "PHOTO", "TEXT"];
const DURATION_CELL_PX = 64;

const FILTERS: FilterSwatch[] = CAMERA_FILTER_OPTIONS;
const SPEEDS: CameraSpeedOption[] = CAMERA_SPEED_OPTIONS;
const STICKERS = CAMERA_STICKER_OPTIONS.map((item) => item.emoji);

const ICON = "text-[#F5F5F7]";

function RailButton({
  title,
  onClick,
  onDoubleClick,
  active,
  badge,
  children,
}: {
  title: string;
  onClick: () => void;
  onDoubleClick?: () => void;
  active?: boolean;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className="w-8 h-8 camera-rail-disc flex-shrink-0 flex items-center justify-center relative self-center"
    >
      {children}
      {active ? (
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-white rounded-full flex items-center justify-center z-[4]">
          <Check size={6} className="text-white" strokeWidth={2.5} />
        </span>
      ) : null}
      {badge ? (
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-white rounded-full flex items-center justify-center z-[4]">
          <span className="text-[6px] text-[#F5F5F7] font-bold">{badge}</span>
        </span>
      ) : null}
    </button>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <button type="button" className="absolute inset-0 z-[59] pointer-events-auto" onClick={onClose} aria-label="Close panel" />
      <div className="absolute bottom-0 left-0 right-0 z-[60] pointer-events-auto">
        <div className="rounded-t-2xl overflow-hidden" style={{ backgroundColor: "#12141A" }}>
          <div className="flex flex-col px-4 pt-2 pb-3 border-b border-white/10">
            <div className="flex justify-center pb-2" aria-hidden>
              <div className="w-10 h-1 rounded-full bg-white/25" />
            </div>
            <span className="text-[#F5F5F7] font-bold text-sm text-center">{title}</span>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}

export type ElixCameraLayoutProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  recording: boolean;
  onShutter: () => void;
  onClose: () => void;
  onFlip: () => void;
  onAddSound: () => void;
  onUpload: () => void;
  onPostTab: () => void;
  onCreateTab: () => void;
  onLiveTab: () => void;
  tab: CreateTab;
  flashOn: boolean;
  onFlash: () => void;
  timerSeconds: 0 | 3 | 10;
  onTimer: () => void;
  speed: number;
  onSpeed: (value: number) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  duration: CameraDuration;
  onDuration: (value: CameraDuration) => void;
  hasClip: boolean;
  onRetake: () => void;
  onPostClip: () => void;
  onStoryClip: () => void;
  posting?: boolean;
  soundLabel?: string | null;
};

export function ElixCameraLayout({
  videoRef,
  recording,
  onShutter,
  onClose,
  onFlip,
  onAddSound,
  onUpload,
  onPostTab,
  onCreateTab,
  onLiveTab,
  tab,
  flashOn,
  onFlash,
  timerSeconds,
  onTimer,
  speed,
  onSpeed,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  duration,
  onDuration,
  hasClip,
  onRetake,
  onPostClip,
  onStoryClip,
  posting = false,
  soundLabel,
}: ElixCameraLayoutProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const durationRef = useRef<HTMLDivElement>(null);
  const textFieldRef = useRef<HTMLInputElement>(null);
  const [focusLock, setFocusLock] = useState(false);
  const [beautyOn, setBeautyOn] = useState(true);
  const [beauty, setBeauty] = useState(0.5);
  const [filterId, setFilterId] = useState("none");
  const [enhance, setEnhance] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [beautySlider, setBeautySlider] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [overlayText, setOverlayText] = useState("");
  const [stickers, setStickers] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterSwatch[]>(FILTERS);
  const [speeds, setSpeeds] = useState<CameraSpeedOption[]>(SPEEDS);
  const [stickerChoices, setStickerChoices] = useState<string[]>(STICKERS);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([apiFetchCameraFilters(), apiFetchSpeedOptions(), apiFetchStickerOptions()]).then(
      ([nextFilters, nextSpeeds, nextStickers]) => {
        if (cancelled) return;
        if (nextFilters.length) setFilters(nextFilters);
        if (nextSpeeds.length) setSpeeds(nextSpeeds);
        if (nextStickers.length) setStickerChoices(nextStickers.map((item) => item.emoji));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const closeSheets = useCallback(() => {
    setFiltersOpen(false);
    setToolsOpen(false);
    setBeautySlider(false);
    setStickersOpen(false);
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const parts: string[] = [];
    if (beautyOn) {
      parts.push(`brightness(${1 + beauty * 0.15}) contrast(${1 - beauty * 0.05}) saturate(${1 + beauty * 0.08})`);
    }
    const swatch = filters.find((item) => item.id === filterId);
    if (swatch && swatch.css !== "none") parts.push(swatch.css);
    if (enhance) parts.push("brightness(1.05) contrast(1.08) saturate(1.12)");
    el.style.filter = parts.length ? parts.join(" ") : "none";
    return () => {
      el.style.filter = "none";
    };
  }, [beautyOn, beauty, filterId, enhance, videoRef, filters]);

  useEffect(() => {
    if (textOpen) textFieldRef.current?.focus();
  }, [textOpen]);

  useEffect(() => {
    const idx = Math.max(0, DURATIONS.indexOf(duration));
    durationRef.current?.scrollTo?.({ left: idx * DURATION_CELL_PX, behavior: "auto" });
  }, [duration]);

  const toggleFocus = async () => {
    const stream = videoRef.current?.srcObject;
    if (!(stream instanceof MediaStream)) {
      setFocusLock((v) => !v);
      return;
    }
    const track = stream.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() as { focusMode?: string[] } | undefined;
    const next = !focusLock;
    if (caps?.focusMode?.length) {
      await track.applyConstraints({ advanced: [{ focusMode: next ? "manual" : "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
    }
    setFocusLock(next);
  };

  const onDurationScroll = () => {
    const el = durationRef.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(DURATIONS.length - 1, Math.round(el.scrollLeft / DURATION_CELL_PX)));
    const next = DURATIONS[idx];
    if (next && next !== duration) onDuration(next);
  };

  const bottomPad = platform.isAndroid
    ? "calc(max(3.5rem, env(safe-area-inset-bottom, 0px)) + 12mm)"
    : "calc(max(3.5rem, env(safe-area-inset-bottom, 0px)) + 8mm)";
  const tabBottom = platform.isAndroid ? "calc(1rem + 9mm)" : "calc(1rem + 5mm)";
  const sheetsOpen = filtersOpen || toolsOpen || stickersOpen;
  const activeFilter = filters.find((item) => item.id === filterId);

  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none">
      <div
        className="absolute top-0 left-0 right-0 z-50 pl-3 pr-2 grid grid-cols-3 items-center pointer-events-auto"
        style={{ paddingTop: "max(3rem, env(safe-area-inset-top))" }}
      >
        <div aria-hidden />
        <div className="flex justify-center items-center">
          <button
            type="button"
            onClick={onAddSound}
            className="elix-sound-pill flex items-center gap-1 h-6 px-2.5 rounded-full border border-[#D8D9DD]/40"
            style={{ background: "rgba(0, 0, 0, 0.55)" }}
            title="Add sound"
          >
            <Music size={10} className={ICON} strokeWidth={2} />
            <span className="elix-silver-red-text text-[10px] font-semibold whitespace-nowrap">
              {soundLabel ? soundLabel : "Add sound"}
            </span>
          </button>
        </div>
        <div className="flex justify-end items-center h-6">
          <button type="button" onClick={onClose} className="camera-rail-disc flex items-center justify-center mr-[1mm]" title="Close">
            <ChevronLeft size={16} strokeWidth={2.35} className={ICON} />
          </button>
        </div>
      </div>

      {filterId !== "none" && activeFilter ? (
        <div className="absolute left-3 z-50 pointer-events-auto" style={{ top: "max(5.5rem, calc(env(safe-area-inset-top) + 3rem))" }}>
          <div className="bg-[#09090B]/50 px-2 py-1 rounded-full flex items-center gap-1.5 border border-[#D8D9DD]/20">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeFilter.color }} />
            <span className="text-[#F5F5F7] text-[9px] font-semibold">{activeFilter.name}</span>
            <button type="button" onClick={() => setFilterId("none")} title="Remove filter">
              <X size={8} className="text-white/60" />
            </button>
          </div>
        </div>
      ) : null}

      {overlayText ? (
        <div className="absolute top-1/3 left-0 right-0 z-40 flex justify-center pointer-events-auto">
          <button type="button" onClick={() => setOverlayText("")} className="bg-[#09090B]/40 px-4 py-2 rounded-lg">
            <p className="text-white text-xl font-bold text-center drop-shadow-lg">{overlayText}</p>
          </button>
        </div>
      ) : null}

      {stickers.length > 0 ? (
        <div className="absolute top-[15%] right-12 z-40 flex flex-col gap-2 pointer-events-auto">
          {stickers.map((mark) => (
            <button key={mark} type="button" onClick={() => setStickers((cur) => cur.filter((item) => item !== mark))} className="text-3xl">
              {mark}
            </button>
          ))}
        </div>
      ) : null}

      <div
        ref={railRef}
        className="camera-right-rail absolute right-2 top-[calc(env(safe-area-inset-top)+4.5rem)] pt-[9mm] pb-4 z-50 flex flex-col items-center justify-start gap-2.5 pointer-events-auto max-h-[85vh] overflow-y-auto no-scrollbar"
      >
        <RailButton title="Flip Camera" onClick={onFlip}>
          <RefreshCw size={18} strokeWidth={1.5} className={ICON} />
        </RailButton>
        <RailButton title="Flash" onClick={onFlash} active={flashOn}>
          <Zap size={18} strokeWidth={1.5} className={ICON} fill={flashOn ? "#D8D9DD" : "none"} />
        </RailButton>
        <RailButton title="Focus Lock" onClick={() => void toggleFocus()} active={focusLock}>
          <Crosshair size={18} strokeWidth={1.5} className={ICON} />
        </RailButton>
        <div className="w-8 h-[1px] bg-[#E6E9EE]/25 rounded-full" />
        <RailButton title="Timer" onClick={onTimer} badge={timerSeconds > 0 ? `${timerSeconds}s` : undefined}>
          <Clock size={18} strokeWidth={1.5} className={ICON} />
        </RailButton>
        <RailButton
          title="Filters & Effects"
          onClick={() => {
            setFiltersOpen((v) => !v);
            setToolsOpen(false);
            setBeautySlider(false);
          }}
        >
          <Palette size={18} strokeWidth={1.5} className={ICON} />
        </RailButton>
        <RailButton
          title="Beauty"
          onClick={() => setBeautyOn((v) => !v)}
          onDoubleClick={() => {
            setBeautySlider((v) => !v);
            setFiltersOpen(false);
            setToolsOpen(false);
          }}
          active={beautyOn}
        >
          <User size={18} strokeWidth={1.5} className={ICON} />
        </RailButton>
        {beautySlider ? (
          <div className="bg-[#09090B]/60 rounded-full px-1 py-1.5 flex flex-col items-center gap-0.5 border border-[#D8D9DD]/20">
            <span className="text-[7px] text-[#F5F5F7] font-bold">{Math.round(beauty * 100)}%</span>
            <input
              type="range"
              min={0}
              max={100}
              value={beauty * 100}
              onChange={(e) => setBeauty(Number(e.target.value) / 100)}
              title="Beauty level"
              className="w-5 h-12 appearance-none cursor-pointer"
              style={{ writingMode: "vertical-lr", direction: "rtl", accentColor: "#FFFFFF" }}
            />
          </div>
        ) : null}
        <RailButton title="More options" onClick={() => railRef.current?.scrollBy({ top: 100, behavior: "smooth" })}>
          <ChevronDown size={18} strokeWidth={1.5} className={ICON} />
        </RailButton>
        <div className="w-8 h-[1.5px] bg-[#E6E9EE]/30 rounded-full my-0.5" />
        <RailButton title="Zoom In" onClick={onZoomIn}>
          <ZoomIn size={18} strokeWidth={1.5} className={ICON} />
        </RailButton>
        <RailButton title="Zoom Out" onClick={onZoomOut}>
          <ZoomOut size={18} strokeWidth={1.5} className={ICON} />
        </RailButton>
        <RailButton title="Reset zoom" onClick={onZoomReset}>
          <span className="text-[#F5F5F7] text-[9px] font-bold">{zoom.toFixed(1)}x</span>
        </RailButton>
        <RailButton
          title="Effects"
          onClick={() => {
            setFiltersOpen((v) => !v);
            setToolsOpen(false);
          }}
        >
          <Wand2 size={18} strokeWidth={1.5} className={ICON} />
        </RailButton>
        <RailButton
          title="Editor tools"
          onClick={() => {
            setToolsOpen((v) => !v);
            setFiltersOpen(false);
            setBeautySlider(false);
          }}
        >
          <Sparkles size={18} strokeWidth={1.5} className={ICON} />
        </RailButton>
      </div>

      {filtersOpen ? (
        <Sheet title="Filters & Effects" onClose={closeSheets}>
          <div className="px-3 pb-3 pt-3">
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {filters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilterId((cur) => (cur === item.id ? "none" : item.id))}
                  className={`flex flex-col items-center gap-0.5 flex-shrink-0 ${filterId === item.id ? "scale-105" : ""}`}
                >
                  <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: item.color }}>
                    {filterId === item.id ? <Check size={12} className="text-white" strokeWidth={3} /> : null}
                  </div>
                  <span className="text-[9px] font-semibold text-[#F5F5F7]">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 pb-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEnhance((v) => !v)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
                enhance ? "bg-[#0A0B0E] text-[#E6E9EE] border-[#F12C56]" : "bg-[#1A1C21] text-[#C8CDD5] border-[#D8D9DD]/35"
              }`}
            >
              <Star size={10} />
              Auto Enhance
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterId("none");
                setEnhance(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#1A1C21] text-[#C8CDD5] border border-[#D8D9DD]/35"
            >
              <RotateCcw size={10} />
              Reset All
            </button>
          </div>
        </Sheet>
      ) : null}

      {toolsOpen ? (
        <Sheet title="Editor tools" onClose={closeSheets}>
          <div className="px-4 pb-3 pt-3">
            <p className="text-[#F5F5F7] text-[9px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
              <Gauge size={9} />
              Recording Speed
            </p>
            <div className="flex items-center gap-2">
              {speeds.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onSpeed(opt.value)}
                  className={`flex-1 py-1.5 rounded-full text-xs font-bold border ${
                    speed === opt.value
                      ? "bg-[#0A0B0E] text-[#E6E9EE] border-[#F12C56]"
                      : "bg-[#1A1C21] text-[#C8CDD5] border-[#D8D9DD]/35"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 pb-4 grid grid-cols-4 gap-2">
            <button
              type="button"
              className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl bg-[#1A1C21] border border-[#D8D9DD]/35"
              onClick={() => {
                setTextOpen(true);
                setToolsOpen(false);
              }}
            >
              <Type size={18} className={ICON} />
              <span className="text-[#F5F5F7] text-[8px] font-medium">Text</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl bg-[#1A1C21] border border-[#D8D9DD]/35"
              onClick={() => {
                setStickersOpen(true);
                setToolsOpen(false);
              }}
            >
              <span className="text-sm">😂</span>
              <span className="text-[#F5F5F7] text-[8px] font-medium">Stickers</span>
            </button>
            <button
              type="button"
              className={`flex flex-col items-center gap-0.5 p-1.5 rounded-xl border ${
                enhance ? "bg-[#0A0B0E] border-[#F12C56]" : "bg-[#1A1C21] border-[#D8D9DD]/35"
              }`}
              onClick={() => setEnhance((v) => !v)}
            >
              <Star size={18} className={ICON} />
              <span className="text-[#F5F5F7] text-[8px] font-medium">Enhance</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl bg-[#1A1C21] border border-[#D8D9DD]/35"
              onClick={() => {
                setBeautySlider(true);
                setToolsOpen(false);
              }}
            >
              <User size={18} className={ICON} />
              <span className="text-[#F5F5F7] text-[8px] font-medium">Retouch</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl bg-[#1A1C21] border border-[#D8D9DD]/35"
              onClick={() => {
                setFiltersOpen(true);
                setToolsOpen(false);
              }}
            >
              <Palette size={18} className={ICON} />
              <span className="text-[#F5F5F7] text-[8px] font-medium">Filters</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl bg-[#1A1C21] border border-[#D8D9DD]/35"
              onClick={() => {
                onAddSound();
                setToolsOpen(false);
              }}
            >
              <Music size={18} className={ICON} />
              <span className="text-[#F5F5F7] text-[8px] font-medium">Music</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl bg-[#1A1C21] border border-[#D8D9DD]/35"
              onClick={() => {
                onFlip();
                setToolsOpen(false);
              }}
            >
              <RefreshCw size={18} className={ICON} />
              <span className="text-[#F5F5F7] text-[8px] font-medium">Flip</span>
            </button>
          </div>
        </Sheet>
      ) : null}

      {textOpen ? (
        <div className="absolute inset-0 z-[70] bg-[#09090B]/60 flex items-center justify-center pointer-events-auto" onClick={() => setTextOpen(false)}>
          <div className="w-[80%] max-w-xs bg-[#09090B]/90 rounded-2xl border border-[#D8D9DD]/20 p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[#F5F5F7] text-xs font-bold text-center mb-3">Add Text</h3>
            <input
              ref={textFieldRef}
              type="text"
              value={overlayText}
              onChange={(e) => setOverlayText(e.target.value)}
              placeholder="Type your text..."
              className="w-full bg-white/10 border border-[#D8D9DD]/20 rounded-xl px-3 py-2 text-white text-sm outline-none"
              maxLength={50}
            />
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => {
                  setOverlayText("");
                  setTextOpen(false);
                }}
                className="flex-1 py-2 rounded-xl bg-white/10 text-[#F5F5F7] text-xs font-semibold"
              >
                Clear
              </button>
              <button type="button" onClick={() => setTextOpen(false)} className="flex-1 py-2 rounded-xl bg-black/70 text-[#E6E9EE] border border-[#F12C56] text-xs font-bold">
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {stickersOpen ? (
        <>
          <button type="button" className="absolute inset-0 z-[69] pointer-events-auto" onClick={() => setStickersOpen(false)} aria-label="Close stickers" />
          <div className="absolute bottom-0 left-0 right-0 z-[70] pointer-events-auto">
            <div className="bg-[#09090B]/90 rounded-t-2xl">
              <h3 className="text-[#F5F5F7] text-xs font-bold text-center px-4 pt-3 pb-2">Stickers</h3>
              <div className="grid grid-cols-8 gap-2 px-4 pb-4">
                {stickerChoices.map((mark) => (
                  <button
                    key={mark}
                    type="button"
                    onClick={() => setStickers((cur) => (cur.includes(mark) ? cur.filter((item) => item !== mark) : [...cur, mark]))}
                    className={`text-2xl p-1.5 rounded-xl ${stickers.includes(mark) ? "bg-white/10 border border-[#D8D9DD]/40" : "bg-white/5"}`}
                  >
                    {mark}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {!sheetsOpen ? (
        <div className="absolute bottom-0 left-0 right-0 z-50 pointer-events-auto" style={{ paddingBottom: bottomPad }}>
          <div className="flex justify-center mb-4">
            <div className="overflow-hidden" style={{ width: DURATION_CELL_PX }}>
              <div
                ref={durationRef}
                onScroll={onDurationScroll}
                className="overflow-x-auto overflow-y-hidden snap-x snap-mandatory no-scrollbar touch-pan-x"
                style={{ width: DURATION_CELL_PX, maxWidth: DURATION_CELL_PX }}
                aria-label="Recording duration"
              >
                <div className="flex" style={{ width: DURATION_CELL_PX * DURATIONS.length }}>
                  {DURATIONS.map((item, index) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        onDuration(item);
                        durationRef.current?.scrollTo?.({ left: index * DURATION_CELL_PX, behavior: "smooth" });
                        if (item === "TEXT") setTextOpen(true);
                      }}
                      className={`flex-shrink-0 snap-center elix-silver-red-text text-xs font-bold py-1.5 text-center ${duration === item ? "" : "opacity-40"}`}
                      style={{ width: DURATION_CELL_PX }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center mb-4 px-4">
            {hasClip ? (
              <div className="flex items-center gap-10">
                <button type="button" onClick={onRetake} className="flex flex-col items-center gap-1" title="Retake">
                  <span className="w-9 h-9 royce-glow-disc flex items-center justify-center">
                    <RotateCcw size={16} className="royce-icon-gold" strokeWidth={2} />
                  </span>
                  <span className="text-[#F5F5F7] font-bold text-[9px]">Retake</span>
                </button>
                <button type="button" onClick={onStoryClip} className="flex flex-col items-center gap-1" title="Story">
                  <span className="w-9 h-9 royce-glow-disc flex items-center justify-center">
                    <Star size={16} className="royce-icon-gold" strokeWidth={2} />
                  </span>
                  <span className="text-[#F5F5F7] font-bold text-[9px]">Story</span>
                </button>
                <button type="button" onClick={onPostClip} disabled={posting} className="flex flex-col items-center gap-1 disabled:opacity-60" title="Post">
                  <span className="w-9 h-9 royce-glow-disc flex items-center justify-center">
                    <Check size={16} className="royce-icon-gold" strokeWidth={2.5} />
                  </span>
                  <span className="text-[#F5F5F7] font-bold text-[9px]">{posting ? "Posting" : "Post"}</span>
                </button>
              </div>
            ) : (
              <div className="relative flex items-center justify-center w-full px-4">
                <button type="button" onClick={onUpload} className="absolute left-4 flex flex-col items-center gap-1 z-10" title="Upload">
                  <span className="royce-glow-disc w-9 h-9">
                    <ImagePlus size={18} className="royce-icon-gold" strokeWidth={2} />
                  </span>
                  <span className="elix-silver-red-text text-[10px] font-bold">Upload</span>
                </button>
                <button type="button" onClick={onShutter} title={recording ? "Stop recording" : "Start recording"} className="flex items-center justify-center">
                  <CaptureShutterButton size={72} recording={recording} />
                </button>
              </div>
            )}
          </div>

          {speed !== 1 ? (
            <div className="flex justify-center mb-2">
              <div className="bg-white/10 px-3 py-0.5 rounded-full border border-[#D8D9DD]/30">
                <span className="text-[#F5F5F7] text-[10px] font-bold">Speed: {speed}x</span>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-center px-4 pb-0.5 w-full absolute" style={{ bottom: tabBottom }}>
            <div className="flex items-center gap-4">
              <button type="button" onClick={onPostTab} className="relative flex items-center justify-center h-10 px-4 min-w-[80px] rounded-full">
                <span className={`elix-silver-red-text text-sm font-semibold ${tab === "post" ? "" : "opacity-70"}`}>POST</span>
              </button>
              <button type="button" onClick={onCreateTab} className="relative flex items-center justify-center h-10 px-4 min-w-[80px] rounded-full">
                <span className={`elix-silver-red-text text-sm font-semibold ${tab === "create" ? "" : "opacity-70"}`}>CREATE</span>
              </button>
              <button type="button" onClick={onLiveTab} className="relative flex items-center justify-center h-10 px-6 min-w-[80px] rounded-full">
                <span className={`elix-silver-red-text text-sm font-semibold ${tab === "live" ? "" : "opacity-70"}`}>LIVE</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
