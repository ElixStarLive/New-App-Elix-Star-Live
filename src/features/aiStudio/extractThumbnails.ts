export type ThumbnailCandidate = {
  dataUrl: string;
  timestamp: number;
  score: number;
};

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("seek failed"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = time;
  });
}

function scoreFrame(ctx: CanvasRenderingContext2D, width: number, height: number): number {
  const sample = ctx.getImageData(0, 0, width, height).data;
  let lumSum = 0;
  let satSum = 0;
  const step = 16;
  let n = 0;
  for (let i = 0; i < sample.length; i += 4 * step) {
    const r = sample[i];
    const g = sample[i + 1];
    const b = sample[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    lumSum += 0.299 * r + 0.587 * g + 0.114 * b;
    satSum += max === 0 ? 0 : (max - min) / max;
    n += 1;
  }
  if (!n) return 0;
  const lum = lumSum / n / 255;
  const sat = satSum / n;
  const mid = 1 - Math.abs(lum - 0.5) * 2;
  return Math.max(0, Math.min(1, mid * 0.6 + sat * 0.4));
}

export async function extractThumbnails(videoUrl: string, count = 8): Promise<ThumbnailCandidate[]> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const finish = (rows: ThumbnailCandidate[]) => {
      video.removeAttribute("src");
      video.load();
      resolve(rows);
    };

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      if (!duration || !Number.isFinite(duration) || duration <= 0) {
        finish([]);
        return;
      }
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx || !video.videoWidth) {
        finish([]);
        return;
      }
      canvas.width = 320;
      canvas.height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * 320));
      const out: ThumbnailCandidate[] = [];
      for (let i = 0; i < count; i++) {
        const ts = (duration * (i + 0.5)) / count;
        try {
          await seekTo(video, ts);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          out.push({
            dataUrl: canvas.toDataURL("image/jpeg", 0.85),
            timestamp: ts,
            score: scoreFrame(ctx, canvas.width, canvas.height),
          });
        } catch {
          /* skip unreadable frame */
        }
      }
      finish(out.sort((a, b) => b.score - a.score));
    };

    video.onerror = () => finish([]);
    video.src = videoUrl;
  });
}
