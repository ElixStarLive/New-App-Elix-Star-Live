import { describe, expect, it } from "vitest";
import { extractHashtags, mergeHashtags, normalizeHashtag, parseHashtagField } from "@shared/hashtag";
import {
  canonicalSoundId,
  ownedStoragePath,
  storagePathBelongsToUser,
  validateIncomingMedia,
  normalizeCaption,
  UPLOAD_MAX_BYTES,
} from "@shared/uploadContract";

describe("PAGE-022 hashtag contract", () => {
  it("normalizes, de-dupes, and keeps car distinct from carpet", () => {
    expect(normalizeHashtag("#Car")).toBe("car");
    expect(mergeHashtags("hello #Car #car #carpet", "#car, dance")).toEqual(["car", "carpet", "dance"]);
    expect(extractHashtags("a #café emoji #🔥no")).toContain("café");
    expect(parseHashtagField("#One two #Two")).toEqual(["one", "two"]);
    expect(mergeHashtags("#a #b #c #d #e #f #g #h #i #j #k #l #m #n #o #p #q #r #s #t #u #v").length).toBe(20);
  });
});

describe("PAGE-022 media validation", () => {
  it("rejects empty, oversized, and non-video posts", () => {
    expect(validateIncomingMedia({ kind: "video", contentType: "video/mp4", byteSize: 0 }).ok).toBe(false);
    expect(validateIncomingMedia({ kind: "video", contentType: "video/mp4", byteSize: UPLOAD_MAX_BYTES + 1 }).ok).toBe(false);
    expect(validateIncomingMedia({ kind: "video", contentType: "image/jpeg", byteSize: 12 }).ok).toBe(false);
    expect(validateIncomingMedia({ kind: "story", contentType: "image/jpeg", byteSize: 12 }).ok).toBe(true);
    expect(validateIncomingMedia({ kind: "video", contentType: "video/webm", byteSize: 12 }).ok).toBe(true);
  });

  it("does not treat titles or URLs as sound ids", () => {
    expect(canonicalSoundId("original")).toBeNull();
    expect(canonicalSoundId("https://cdn.example/track.mp3")).toBeNull();
    expect(canonicalSoundId("epidemic-1")).toBe("epidemic-1");
    expect(normalizeCaption("  hi  ")).toBe("hi");
  });

  it("builds owned storage paths and rejects traversal", () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const path = ownedStoragePath("video", userId, "22222222-2222-4222-8222-222222222222", "mp4");
    expect(path).toBe(`videos/${userId}/22222222-2222-4222-8222-222222222222/original.mp4`);
    expect(storagePathBelongsToUser(path, userId)).toBe(true);
    expect(storagePathBelongsToUser(`videos/other/${userId}/original.mp4`, userId)).toBe(false);
    expect(storagePathBelongsToUser(`videos/${userId}/../secrets`, userId)).toBe(false);
  });
});
