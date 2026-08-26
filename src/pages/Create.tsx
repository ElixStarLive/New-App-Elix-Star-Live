import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ElixCameraLayout, type CreateTab } from "@/components/ElixCameraLayout";
import SoundMixPanel from "@/components/SoundMixPanel";
import { discardCapturedCreateMedia, setCapturedCreateMedia } from "@/features/camera/capturedMediaCache";
import { createSoundPickState, parseCreateSoundSelection } from "@/features/camera/createCameraContract";
import { useCreateCameraSession } from "@/features/camera/useCreateCameraSession";
import { FEED_HOME } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export default function Create() {
  const navigate = useNavigate();
  const location = useLocation();
  const viewerId = useAuthStore((s) => s.user?.id ?? null);
  const viewerRef = useRef<string | null>(viewerId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pinchDistRef = useRef<number | null>(null);
  const pinchZoomRef = useRef(1);
  const { state, session } = useCreateCameraSession(videoRef);
  const [tab, setTab] = useState<CreateTab>("create");
  const [speed, setSpeed] = useState(1);
  const [soundMixOpen, setSoundMixOpen] = useState(false);
  const [originalVolume, setOriginalVolume] = useState(1);
  const [musicVolume, setMusicVolume] = useState(0.7);
  const sound = useMemo(
    () => parseCreateSoundSelection(location.search, location.state),
    [location.search, location.state],
  );

  useEffect(() => {
    const switched = viewerRef.current !== viewerId;
    if (!switched) return;
    viewerRef.current = viewerId;
    setSoundMixOpen(false);
    setOriginalVolume(1);
    setMusicVolume(0.7);
    setSpeed(1);
    setTab("create");
    discardCapturedCreateMedia();
    session.release();
    if (viewerId) void session.retry();
    else navigate(FEED_HOME, { replace: true });
  }, [viewerId, session, navigate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || state.clip) return;
    try {
      video.playbackRate = speed;
    } catch {
      /* ignore */
    }
  }, [speed, state.clip, state.attaching]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !state.clip || state.clip.kind !== "video") return;
    const vol = Math.max(0, Math.min(1, originalVolume));
    video.muted = vol <= 0.001;
    video.volume = vol <= 0.001 ? 0 : vol;
  }, [originalVolume, state.clip]);

  const handoff = useCallback(
    (path: string) => {
      const clip = session.markHandedOff();
      if (!clip) {
        showToast("Record or capture first");
        return;
      }
      setCapturedCreateMedia({
        ...clip,
        soundId: sound?.soundId ?? null,
        originalVolume: Math.max(0, Math.min(1, originalVolume)),
        musicVolume: Math.max(0, Math.min(1, musicVolume)),
      });
      navigate(path, { replace: true });
    },
    [navigate, session, sound, originalVolume, musicVolume],
  );

  const onClose = useCallback(() => {
    if (state.recording || state.countdown != null) {
      session.release();
      navigate(FEED_HOME, { replace: true });
      return;
    }
    if (state.clip) {
      setSoundMixOpen(false);
      session.retake();
      return;
    }
    navigate(FEED_HOME, { replace: true });
  }, [navigate, session, state.clip, state.countdown, state.recording]);

  const onShutter = useCallback(() => {
    if (tab === "live") {
      session.release();
      navigate("/live/broadcast", { replace: true });
      return;
    }
    session.shutter();
  }, [navigate, session, tab]);

  const onFlash = useCallback(async () => {
    const ok = await session.toggleFlash();
    if (!ok) showToast("Flash not available");
  }, [session]);

  useEffect(() => {
    if (state.micDeniedMessage) showToast(state.micDeniedMessage);
  }, [state.micDeniedMessage]);

  const openMusicPick = useCallback(() => {
    navigate("/music", { state: createSoundPickState() });
  }, [navigate]);

  const onAddSound = useCallback(() => {
    if (state.clip) {
      setSoundMixOpen(true);
      return;
    }
    openMusicPick();
  }, [state.clip, openMusicPick]);

  const clearSound = useCallback(() => {
    navigate({ pathname: "/create", search: "" }, { replace: true, state: {} });
    setMusicVolume(0.7);
  }, [navigate]);

  const onTouchStart = useCallback(
    (event: TouchEvent) => {
      if (event.touches.length !== 2 || state.clip) return;
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      pinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
      pinchZoomRef.current = state.zoom;
    },
    [state.clip, state.zoom],
  );

  const onTouchMove = useCallback(
    (event: TouchEvent) => {
      if (event.touches.length !== 2 || pinchDistRef.current == null || state.clip) return;
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const next = Math.max(1, Math.min(4, pinchZoomRef.current * (dist / pinchDistRef.current)));
      void session.applyZoom(Number(next.toFixed(1)));
    },
    [session, state.clip],
  );

  return (
    <div className="relative h-[100dvh] bg-black text-white overflow-hidden" data-elix-page="create">
      <div
        className="absolute inset-0"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={() => {
          pinchDistRef.current = null;
        }}
      >
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover bg-black" playsInline muted={!state.clip} />
        {state.clip?.kind === "image" ? (
          <img src={state.clip.objectUrl} alt="" className="absolute inset-0 w-full h-full object-cover bg-black" />
        ) : null}
      </div>
      {state.countdown != null ? (
        <div className="absolute inset-0 z-[80] flex items-center justify-center pointer-events-none">
          <span className="text-white text-7xl font-bold">{state.countdown}</span>
        </div>
      ) : null}
      {state.error ? (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 px-6">
          <div className="text-center max-w-[280px]">
            <p className="text-white text-sm font-semibold mb-2">
              {state.errorKind === "permission" ? "Camera Access Needed" : "Camera unavailable"}
            </p>
            <p className="text-white/70 text-xs mb-5 leading-relaxed">{state.error}</p>
            <button
              type="button"
              onClick={() => void session.retry()}
              className="px-6 py-2.5 rounded-full bg-[#E6E9EE] text-white text-sm font-semibold"
            >
              Try Again
            </button>
          </div>
        </div>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="video/*,image/*"
        className="hidden"
        aria-label="Select media file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          session.acceptGalleryFile(file);
        }}
      />
      <ElixCameraLayout
        videoRef={videoRef}
        recording={state.recording}
        onShutter={onShutter}
        onClose={onClose}
        onFlip={() => void session.flip()}
        onAddSound={onAddSound}
        onUpload={() => fileRef.current?.click()}
        onPostTab={() => {
          session.release();
          discardCapturedCreateMedia();
          navigate("/upload");
        }}
        onCreateTab={() => setTab("create")}
        onLiveTab={() => setTab("live")}
        tab={tab}
        flashOn={state.flashOn}
        onFlash={() => void onFlash()}
        timerSeconds={state.timerSeconds}
        onTimer={() => session.cycleTimer()}
        speed={speed}
        onSpeed={setSpeed}
        zoom={state.zoom}
        onZoomIn={() => void session.applyZoom(state.zoom + 0.5)}
        onZoomOut={() => void session.applyZoom(state.zoom - 0.5)}
        onZoomReset={() => void session.applyZoom(1)}
        duration={state.duration}
        onDuration={(value) => session.setDuration(value)}
        hasClip={Boolean(state.clip)}
        onRetake={() => {
          setSoundMixOpen(false);
          session.retake();
        }}
        onPostClip={() => handoff("/upload")}
        onStoryClip={() => handoff("/upload?type=story")}
        soundLabel={sound?.title ?? null}
      />
      <SoundMixPanel
        isOpen={soundMixOpen}
        onClose={() => setSoundMixOpen(false)}
        originalVolume={originalVolume}
        musicVolume={musicVolume}
        onOriginalVolumeChange={setOriginalVolume}
        onMusicVolumeChange={setMusicVolume}
        hasOriginalAudio={state.clip?.kind !== "image"}
        hasAddedSound={Boolean(sound)}
        addedSoundTitle={sound?.title ?? null}
        onChooseSound={openMusicPick}
        onClearSound={clearSound}
      />
    </div>
  );
}
