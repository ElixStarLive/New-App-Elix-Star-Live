import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { apiMusicTrackPreview } from "./musicApi";
import type { MusicTrack } from "./musicApi";
import { useSettingsStore } from "@/store/useSettingsStore";

export type MusicPreviewState = {
  playingId: string | null;
  loadingId: string | null;
};

type Listener = () => void;

const listeners = new Set<Listener>();
let state: MusicPreviewState = { playingId: null, loadingId: null };
let audio: HTMLAudioElement | null = null;
let generation = 0;
let clipEndSeconds: number | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(next: Partial<MusicPreviewState>): void {
  state = { ...state, ...next };
  emit();
}

function onTimeUpdate(this: HTMLAudioElement): void {
  if (this !== audio || clipEndSeconds == null) return;
  if (this.currentTime >= clipEndSeconds) stopMusicPreview();
}

function onEnded(): void {
  stopMusicPreview();
}

function discardAudio(): void {
  const el = audio;
  audio = null;
  clipEndSeconds = null;
  if (!el) return;
  el.removeEventListener("timeupdate", onTimeUpdate);
  el.removeEventListener("ended", onEnded);
  try {
    el.pause();
  } catch {
    /* ignore */
  }
  try {
    el.removeAttribute("src");
    el.src = "";
    el.load();
  } catch {
    /* ignore */
  }
}

export function getMusicPreviewState(): MusicPreviewState {
  return state;
}

export function subscribeMusicPreview(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function stopMusicPreview(): void {
  generation += 1;
  discardAudio();
  setState({ playingId: null, loadingId: null });
}

export async function toggleMusicPreview(track: MusicTrack): Promise<{ error: string | null }> {
  if (state.playingId === track.id) {
    stopMusicPreview();
    return { error: null };
  }
  if (useSettingsStore.getState().muteAllSounds) {
    return { error: "Sounds are muted in settings" };
  }

  const gen = ++generation;
  setState({ loadingId: track.id, playingId: null });
  const preview = await apiMusicTrackPreview(track.id);
  if (gen !== generation) return { error: null };
  if (preview.error || !preview.url) {
    setState({ loadingId: null, playingId: null });
    return { error: preview.error || "Preview is not available" };
  }

  discardAudio();
  const el = new Audio();
  el.preload = "auto";
  el.setAttribute("playsinline", "true");
  el.dataset.elixLibraryPreview = "1";
  el.addEventListener("timeupdate", onTimeUpdate);
  el.addEventListener("ended", onEnded);
  audio = el;
  clipEndSeconds = track.clipEndSeconds > track.clipStartSeconds ? track.clipEndSeconds : null;
  el.src = preview.url;

  try {
    if (track.clipStartSeconds > 0) el.currentTime = track.clipStartSeconds;
  } catch {
    /* ignore seek until metadata */
  }

  try {
    await el.play();
  } catch (error) {
    if (gen !== generation) {
      if (audio === el) discardAudio();
      return { error: null };
    }
    discardAudio();
    setState({ loadingId: null, playingId: null });
    return { error: error instanceof Error ? error.message : "Could not play preview" };
  }

  if (gen !== generation) {
    if (audio === el) discardAudio();
    return { error: null };
  }
  setState({ loadingId: null, playingId: track.id });
  return { error: null };
}

export function attachMusicPreviewLifecycle(): () => void {
  const onHidden = () => {
    if (typeof document !== "undefined" && document.hidden) stopMusicPreview();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onHidden);
  }
  let removeApp: { remove: () => Promise<void> } | null = null;
  if (Capacitor.isNativePlatform()) {
    void App.addListener("appStateChange", (state) => {
      if (!state.isActive) stopMusicPreview();
    }).then((handle) => {
      removeApp = handle;
    });
  }
  return () => {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onHidden);
    }
    void removeApp?.remove();
    stopMusicPreview();
  };
}
