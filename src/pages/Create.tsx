import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ElixCameraLayout, type CameraDuration, type CreateTab } from "@/components/ElixCameraLayout";
import { apiUploadVideo } from "@/features/feed/feedApi";
import { apiRequest, apiUploadForm } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { FEED_HOME } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";

type DeviceCaps = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: { min?: number; max?: number };
};

function durationMs(value: CameraDuration): number | null {
  if (value === "15s") return 15_000;
  if (value === "60s") return 60_000;
  if (value === "10m") return 600_000;
  return null;
}

export default function Create() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<CreateTab>("create");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState<0 | 3 | 10>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [duration, setDuration] = useState<CameraDuration>("60s");
  const [clip, setClip] = useState<Blob | null>(null);
  const [clipKind, setClipKind] = useState<"video" | "image">("video");
  const [posting, setPosting] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const [sounds, setSounds] = useState<Array<{ id: string; title: string; artist: string; audioUrl?: string }>>([]);
  const [sound, setSound] = useState<{ id: string; title: string; audioUrl?: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const attachStream = useCallback(async (nextFacing: "user" | "environment") => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.style.transform = nextFacing === "user" ? "scaleX(-1)" : "none";
        await videoRef.current.play().catch(() => undefined);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Camera unavailable");
    }
  }, []);

  useEffect(() => {
    void attachStream(facing);
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (stopTimerRef.current != null) window.clearTimeout(stopTimerRef.current);
      audioRef.current?.pause();
    };
  }, [attachStream, facing]);

  const applyZoom = useCallback(async (level: number) => {
    const clamped = Math.max(1, Math.min(4, level));
    setZoom(clamped);
    const track = streamRef.current?.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() as DeviceCaps | undefined;
    if (track && caps?.zoom) {
      const min = caps.zoom.min ?? 1;
      const max = caps.zoom.max ?? 4;
      const mapped = min + ((clamped - 1) / 3) * (max - min);
      await track.applyConstraints({ advanced: [{ zoom: mapped } as MediaTrackConstraintSet] }).catch(() => undefined);
      return;
    }
    if (videoRef.current) {
      const mirror = facing === "user" ? "scaleX(-1) " : "";
      videoRef.current.style.transform = `${mirror}scale(${clamped})`;
    }
  }, [facing]);

  const stopRecorder = useCallback(() => {
    if (stopTimerRef.current != null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    audioRef.current?.pause();
  }, []);

  const startRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    setClip(null);
    const rec = new MediaRecorder(stream);
    recorderRef.current = rec;
    rec.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    rec.onstop = () => {
      if (chunksRef.current.length > 0) {
        setClip(new Blob(chunksRef.current, { type: "video/webm" }));
        setClipKind("video");
      }
    };
    rec.start();
    setRecording(true);
    if (sound?.audioUrl) {
      const audio = new Audio(sound.audioUrl);
      audio.loop = true;
      audio.play().catch(() => undefined);
      audioRef.current = audio;
    }
    const limit = durationMs(duration);
    if (limit) {
      stopTimerRef.current = window.setTimeout(() => stopRecorder(), limit);
    }
  }, [duration, sound, stopRecorder]);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setClip(blob);
      setClipKind("image");
    }, "image/jpeg", 0.92);
  }, []);

  const runShutter = useCallback(() => {
    if (recording) {
      stopRecorder();
      return;
    }
    if (duration === "PHOTO") {
      capturePhoto();
      return;
    }
    if (duration === "TEXT") return;
    startRecorder();
  }, [capturePhoto, duration, recording, startRecorder, stopRecorder]);

  const onShutter = useCallback(() => {
    if (recording) {
      runShutter();
      return;
    }
    if (timerSeconds === 0) {
      runShutter();
      return;
    }
    let left = timerSeconds;
    setCountdown(left);
    const tick = window.setInterval(() => {
      left -= 1;
      if (left <= 0) {
        window.clearInterval(tick);
        setCountdown(null);
        runShutter();
        return;
      }
      setCountdown(left);
    }, 1000);
  }, [recording, runShutter, timerSeconds]);

  const onFlash = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    const next = !flashOn;
    const caps = track?.getCapabilities?.() as DeviceCaps | undefined;
    if (track && caps?.torch) {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] }).catch(() => undefined);
    }
    setFlashOn(next);
  }, [flashOn]);

  const publish = useCallback(
    async (kind: "video" | "story") => {
      if (!clip) {
        showToast("Record or capture first");
        return;
      }
      setPosting(true);
      if (kind === "story") {
        const form = new FormData();
        form.append("file", clip, clipKind === "image" ? "story.jpg" : "story.webm");
        const result = await apiUploadForm<unknown>("/api/stories", form);
        setPosting(false);
        if (result.error) {
          showToast(result.error.message);
          return;
        }
        navigate(FEED_HOME, { replace: true });
        return;
      }
      const uploaded = await apiUploadVideo(clip, undefined, clipKind === "image" ? "photo.jpg" : "clip.webm", sound ? { soundId: sound.id } : undefined);
      setPosting(false);
      if (!uploaded.ok) {
        showToast(uploaded.error);
        return;
      }
      navigate(FEED_HOME, { replace: true });
    },
    [clip, clipKind, navigate, sound],
  );

  const openSounds = useCallback(() => {
    setSoundOpen(true);
    void apiRequest<unknown>("/api/music/search").then((res) => {
      if (res.error || !isRecord(res.data) || !Array.isArray(res.data.items)) return;
      const next: Array<{ id: string; title: string; artist: string; audioUrl?: string }> = [];
      for (const raw of res.data.items) {
        if (!isRecord(raw) || typeof raw.id !== "string") continue;
        next.push({
          id: raw.id,
          title: typeof raw.title === "string" ? raw.title : "Sound",
          artist: typeof raw.artist === "string" ? raw.artist : "",
          audioUrl: typeof raw.audio_url === "string" ? raw.audio_url : undefined,
        });
      }
      setSounds(next);
    });
  }, []);

  return (
    <div className="relative h-[100dvh] bg-black text-white overflow-hidden">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
      {countdown != null ? (
        <div className="absolute inset-0 z-[80] flex items-center justify-center pointer-events-none">
          <span className="text-white text-7xl font-bold">{countdown}</span>
        </div>
      ) : null}
      {error ? <p className="absolute left-3 right-3 top-1/2 z-20 text-center text-rose-300 text-sm">{error}</p> : null}
      <input
        ref={fileRef}
        type="file"
        accept="video/*,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setClip(file);
          setClipKind(file.type.startsWith("image/") ? "image" : "video");
        }}
      />
      <ElixCameraLayout
        videoRef={videoRef}
        recording={recording}
        onShutter={onShutter}
        onClose={() => navigate(FEED_HOME, { replace: true })}
        onFlip={() => setFacing((cur) => (cur === "user" ? "environment" : "user"))}
        onAddSound={openSounds}
        onUpload={() => fileRef.current?.click()}
        onPostTab={() => setTab("post")}
        onCreateTab={() => setTab("create")}
        onLiveTab={() => navigate("/live/broadcast")}
        tab={tab}
        flashOn={flashOn}
        onFlash={() => void onFlash()}
        timerSeconds={timerSeconds}
        onTimer={() => setTimerSeconds((cur) => (cur === 0 ? 3 : cur === 3 ? 10 : 0))}
        speed={speed}
        onSpeed={setSpeed}
        zoom={zoom}
        onZoomIn={() => void applyZoom(zoom + 0.5)}
        onZoomOut={() => void applyZoom(zoom - 0.5)}
        onZoomReset={() => void applyZoom(1)}
        duration={duration}
        onDuration={setDuration}
        hasClip={Boolean(clip)}
        onRetake={() => {
          setClip(null);
          chunksRef.current = [];
        }}
        onPostClip={() => void publish("video")}
        onStoryClip={() => void publish("story")}
        posting={posting}
        soundLabel={sound?.title ?? null}
      />
      {soundOpen ? (
        <div className="absolute inset-0 z-[90] bg-black/70 flex flex-col justify-end">
          <button type="button" className="flex-1" aria-label="Close sounds" onClick={() => setSoundOpen(false)} />
          <div className="rounded-t-2xl bg-[#12141A] max-h-[50vh] overflow-y-auto p-4">
            <p className="text-center font-bold text-sm mb-3">Add sound</p>
            {sounds.length === 0 ? <p className="text-white/50 text-sm text-center py-6">No sounds yet</p> : null}
            {sounds.map((row) => (
              <button
                key={row.id}
                type="button"
                className="w-full text-left border border-white/10 rounded-xl p-3 mb-2"
                onClick={() => {
                  setSound({ id: row.id, title: row.title, audioUrl: row.audioUrl });
                  setSoundOpen(false);
                }}
              >
                <p className="font-semibold text-sm">{row.title}</p>
                <p className="text-[12px] text-white/50">{row.artist}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
