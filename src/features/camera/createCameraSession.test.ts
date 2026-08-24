import { describe, expect, it, vi } from "vitest";
import { createCameraSession, type MediaRecorderLike } from "./createCameraSession";

type FakeTrack = {
  kind: "video" | "audio";
  stop: ReturnType<typeof vi.fn>;
  getSettings: () => { width?: number; height?: number; facingMode?: string };
  getCapabilities: () => { torch?: boolean; zoom?: { min: number; max: number } };
  applyConstraints: ReturnType<typeof vi.fn>;
};

function fakeTrack(kind: "video" | "audio", extras?: Partial<FakeTrack>): FakeTrack {
  return {
    kind,
    stop: vi.fn(),
    getSettings: () => (kind === "video" ? { width: 720, height: 1280, facingMode: "user" } : {}),
    getCapabilities: () => ({}),
    applyConstraints: vi.fn(async () => undefined),
    ...extras,
  };
}

function fakeStream(tracks: FakeTrack[]): MediaStream {
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((track) => track.kind === "video"),
    getAudioTracks: () => tracks.filter((track) => track.kind === "audio"),
    addTrack: (track: FakeTrack) => {
      tracks.push(track);
    },
  } as unknown as MediaStream;
}

class FakeRecorder implements MediaRecorderLike {
  state = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onstart: (() => void) | null = null;
  onerror: ((event: { error?: unknown }) => void) | null = null;
  startCount = 0;
  stopCount = 0;
  emitChunk = true;

  start(): void {
    this.startCount += 1;
    this.state = "recording";
    this.onstart?.();
  }

  stop(): void {
    this.stopCount += 1;
    if (this.state === "inactive") return;
    this.state = "inactive";
    if (this.emitChunk) this.ondataavailable?.({ data: new Blob(["clip"], { type: "video/webm" }) });
    this.onstop?.();
  }
}

function videoEl(): HTMLVideoElement {
  return {
    srcObject: null,
    src: "",
    muted: false,
    playsInline: false,
    videoWidth: 720,
    videoHeight: 1280,
    style: { transform: "" },
    play: async () => undefined,
    load: () => undefined,
    removeAttribute: () => undefined,
  } as unknown as HTMLVideoElement;
}

describe("PAGE-021 createCameraSession", () => {
  it("opens one video stream and treats mic deny as optional", async () => {
    const video = fakeTrack("video");
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      if (constraints.audio && !constraints.video) {
        throw Object.assign(new Error("mic"), { name: "NotAllowedError" });
      }
      return fakeStream([video]);
    });
    const el = videoEl();
    const session = createCameraSession({
      getUserMedia,
      createRecorder: () => new FakeRecorder(),
      isTypeSupported: () => true,
      getVideoEl: () => el,
      isSecureContext: () => true,
    });
    await session.open();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(session.getState().error).toBeNull();
    expect(session.getState().micDenied).toBe(true);
    expect(session.getState().attaching).toBe(false);
    expect(el.srcObject).toBeTruthy();
    session.release();
    expect(video.stop).toHaveBeenCalled();
  });

  it("does not mark recording until the recorder starts, and double start/stop is ignored", async () => {
    const video = fakeTrack("video");
    const audio = fakeTrack("audio");
    const recorders: FakeRecorder[] = [];
    const session = createCameraSession({
      getUserMedia: async (constraints) => fakeStream(constraints.audio && !constraints.video ? [audio] : [video]),
      createRecorder: () => {
        const rec = new FakeRecorder();
        recorders.push(rec);
        return rec;
      },
      isTypeSupported: () => true,
      getVideoEl: () => videoEl(),
      isSecureContext: () => true,
    });
    await session.open();
    expect(session.getState().recording).toBe(false);
    session.shutter();
    expect(recorders).toHaveLength(1);
    expect(session.getState().recording).toBe(true);
    session.shutter();
    session.shutter();
    expect(recorders[0]?.startCount).toBe(1);
    expect(recorders[0]?.stopCount).toBe(1);
    expect(session.getState().recording).toBe(false);
    expect(session.getState().clip?.mimeType).toMatch(/^video\//);
    expect(session.getState().clip?.durationMs).toBeGreaterThanOrEqual(0);
    session.release();
  });

  it("does not finalize an empty recording as success", async () => {
    const video = fakeTrack("video");
    const rec = new FakeRecorder();
    rec.emitChunk = false;
    const session = createCameraSession({
      getUserMedia: async () => fakeStream([video]),
      createRecorder: () => rec,
      isTypeSupported: () => true,
      getVideoEl: () => videoEl(),
      isSecureContext: () => true,
    });
    await session.open();
    session.shutter();
    session.shutter();
    expect(session.getState().clip).toBeNull();
    expect(session.getState().error).toMatch(/no media/i);
    session.release();
  });

  it("stops the previous video track when flipping cameras", async () => {
    const first = fakeTrack("video");
    const second = fakeTrack("video");
    let round = 0;
    const session = createCameraSession({
      getUserMedia: async (constraints) => {
        if (constraints.audio && !constraints.video) return fakeStream([fakeTrack("audio")]);
        round += 1;
        return fakeStream([round === 1 ? first : second]);
      },
      createRecorder: () => new FakeRecorder(),
      isTypeSupported: () => true,
      getVideoEl: () => videoEl(),
      isSecureContext: () => true,
    });
    await session.open("user");
    await session.flip();
    expect(session.getState().facing).toBe("environment");
    expect(first.stop).toHaveBeenCalled();
    session.release();
    expect(second.stop).toHaveBeenCalled();
  });

  it("does not claim flash is on when torch is missing", async () => {
    const session = createCameraSession({
      getUserMedia: async (constraints) =>
        fakeStream(constraints.audio && !constraints.video ? [fakeTrack("audio")] : [fakeTrack("video")]),
      createRecorder: () => new FakeRecorder(),
      isTypeSupported: () => true,
      getVideoEl: () => videoEl(),
      isSecureContext: () => true,
    });
    await session.open();
    const ok = await session.toggleFlash();
    expect(ok).toBe(false);
    expect(session.getState().flashOn).toBe(false);
    session.release();
  });

  it("surfaces a real permission error and does not keep attaching", async () => {
    const session = createCameraSession({
      getUserMedia: async () => {
        throw Object.assign(new Error("no"), { name: "NotAllowedError" });
      },
      createRecorder: () => new FakeRecorder(),
      isTypeSupported: () => true,
      getVideoEl: () => videoEl(),
      isSecureContext: () => true,
    });
    await session.open();
    expect(session.getState().errorKind).toBe("permission");
    expect(session.getState().attaching).toBe(false);
    expect(session.getState().recording).toBe(false);
    session.release();
  });

  it("counts down then starts a real recorder", async () => {
    vi.useFakeTimers();
    const rec = new FakeRecorder();
    const session = createCameraSession({
      getUserMedia: async (constraints) =>
        fakeStream(constraints.audio && !constraints.video ? [fakeTrack("audio")] : [fakeTrack("video")]),
      createRecorder: () => rec,
      isTypeSupported: () => true,
      getVideoEl: () => videoEl(),
      isSecureContext: () => true,
      now: () => Date.now(),
    });
    await session.open();
    session.cycleTimer();
    expect(session.getState().timerSeconds).toBe(3);
    session.shutter();
    expect(session.getState().countdown).toBe(3);
    expect(rec.startCount).toBe(0);
    await vi.advanceTimersByTimeAsync(3200);
    expect(session.getState().countdown).toBeNull();
    expect(rec.startCount).toBe(1);
    expect(session.getState().recording).toBe(true);
    session.release();
    vi.useRealTimers();
  });
});
