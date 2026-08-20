import { useCallback, useEffect, useRef } from "react";

const GIFT_SAFETY_MAX_MS = 30_000;

function isGiftVideoUrl(src: string): boolean {
  const path = src.split("?")[0].toLowerCase();
  return path.endsWith(".mp4") || path.endsWith(".webm") || path.endsWith(".mov");
}

export function GiftOverlay({
  videoSrc,
  onEnded,
  muted = true,
  zIndex = 100,
}: {
  videoSrc: string | null;
  onEnded: () => void;
  isBattleMode?: boolean;
  muted?: boolean;
  zIndex?: number;
}) {
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playSrc = videoSrc && isGiftVideoUrl(videoSrc) ? videoSrc : null;

  const armSafety = useCallback((ms: number) => {
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    safetyTimerRef.current = setTimeout(() => onEndedRef.current(), Math.min(ms, GIFT_SAFETY_MAX_MS));
  }, []);

  useEffect(() => {
    if (!videoSrc) return;
    if (!playSrc) {
      onEndedRef.current();
    }
  }, [videoSrc, playSrc]);

  useEffect(() => {
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    if (!playSrc) return;
    armSafety(8000);
    return () => {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    };
  }, [playSrc, armSafety]);

  if (!playSrc) return null;

  return (
    <div
      className="fixed left-0 right-0 mx-auto w-full max-w-[480px] pointer-events-none overflow-hidden"
      data-elix-gift-overlay="true"
      style={{
        bottom: 0,
        height: "calc(70% - 25mm)",
        zIndex,
        WebkitMaskImage: "linear-gradient(to top, black 0%, black 60%, transparent 100%)",
        maskImage: "linear-gradient(to top, black 0%, black 60%, transparent 100%)",
      }}
    >
      <div className="absolute inset-0">
        <video
          src={playSrc}
          className="absolute inset-0 w-full h-full object-cover drop-shadow-2xl"
          autoPlay
          muted={muted}
          playsInline
          onEnded={() => onEndedRef.current()}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) armSafety(Math.ceil(d * 1000) + 400);
          }}
        />
      </div>
    </div>
  );
}
