import { describe, expect, it, vi } from "vitest";
import { createUploadPublishSession } from "./uploadSession";
import type { CapturedCreateMedia } from "@/features/camera/createCameraContract";

function clip(): CapturedCreateMedia {
  return {
    blob: new Blob(["mp4-bytes"], { type: "video/mp4" }),
    objectUrl: "blob:test",
    mimeType: "video/mp4",
    kind: "video",
    durationMs: 1500,
    width: 720,
    height: 1280,
    orientation: "portrait",
    facing: "user",
    soundId: "sound-1",
    source: "camera",
    originalVolume: 1,
    musicVolume: 0.7,
  };
}

describe("PAGE-022 upload session owner", () => {
  it("takes PAGE-021 media once and publishes a single session", async () => {
    const takeCaptured = vi.fn(() => clip());
    const createSession = vi.fn(async () => ({
      data: { sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "video" as const },
      error: null,
      status: 201,
    }));
    const putBytes = vi.fn(async () => undefined);
    const publish = vi.fn(async () => ({
      data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "video" as const, processingStatus: "ready" as const },
      error: null,
      status: 201,
    }));
    const session = createUploadPublishSession({
      kind: "video",
      takeCaptured,
      createObjectUrl: () => "blob:x",
      revokeObjectUrl: () => undefined,
      randomId: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      createSession,
      putBytes,
      publish,
    });
    session.intake(null);
    session.setCaption("hello #Car #car");
    session.setHashtagsText("#Dance");
    const first = session.post();
    const second = session.post();
    const [a, b] = await Promise.all([first, second]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(putBytes).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      expect.objectContaining({ caption: "hello #Car #car", extraHashtags: "#Dance", soundId: "sound-1" }),
    );
    expect(takeCaptured).toHaveBeenCalledTimes(1);
    expect(session.getState().publishedId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(session.getState().processingStatus).toBe("ready");
  });

  it("retries publish with the same idempotency key after a lost response", async () => {
    const takeCaptured = vi.fn(() => clip());
    let publishes = 0;
    const session = createUploadPublishSession({
      kind: "video",
      takeCaptured,
      createObjectUrl: () => "blob:x",
      revokeObjectUrl: () => undefined,
      randomId: () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      createSession: async (input) => ({
        data: { sessionId: input.idempotencyKey, kind: "video" },
        error: null,
        status: 201,
      }),
      putBytes: async () => undefined,
      publish: async () => {
        publishes += 1;
        if (publishes === 1) return { data: null, error: "Network error", status: 0 };
        return {
          data: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", kind: "video" as const, processingStatus: "ready" as const },
          error: null,
          status: 201,
        };
      },
    });
    session.intake(null);
    const failed = await session.post();
    expect(failed.ok).toBe(false);
    const retried = await session.retry();
    expect(retried.ok).toBe(true);
    expect(publishes).toBe(2);
  });
});
