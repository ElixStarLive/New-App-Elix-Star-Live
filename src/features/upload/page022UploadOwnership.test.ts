import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const uploadPage = readFileSync(resolve(root, "../../pages/Upload.tsx"), "utf8");
const session = readFileSync(resolve(root, "./uploadSession.ts"), "utf8");
const api = readFileSync(resolve(root, "./uploadApi.ts"), "utf8");
const hook = readFileSync(resolve(root, "./useUploadSession.ts"), "utf8");
const feedApi = readFileSync(resolve(root, "../feed/feedApi.ts"), "utf8");
const mediaUpload = readFileSync(resolve(root, "../../../server/modules/media/upload.ts"), "utf8");
const serverIndex = readFileSync(resolve(root, "../../../server/index.ts"), "utf8");
const bunny = readFileSync(resolve(root, "../../../server/infra/bunny.ts"), "utf8");
const uploadsSession = readFileSync(resolve(root, "../../../server/modules/uploads/session.ts"), "utf8");

describe("PAGE-022 upload ownership", () => {
  it("keeps a single session owner and does not start uploads from the page", () => {
    expect(uploadPage).toContain("useUploadPublishSession");
    expect(uploadPage).not.toMatch(/apiUploadVideo|apiUploadForm|\/api\/videos\/upload/);
    expect(uploadPage).not.toMatch(/XMLHttpRequest|fetch\(/);
    expect(session).toContain("takeCaptured");
    expect(hook).toContain("createUploadPublishSession");
    expect(session).toContain("createSession");
    expect(session).toContain("putBytes");
    expect(session).toContain("publish");
    expect(session).not.toMatch(/setTimeout\(/);
    expect(session).not.toMatch(/location\.reload/);
  });

  it("does not keep a second uploader or leftover Upload variants", () => {
    expect(uploadPage).not.toMatch(/UploadOld|UploadNew|UploadFixed|UploadV2/);
    expect(feedApi).not.toMatch(/apiUploadVideo|\/api\/videos\/upload/);
    expect(mediaUpload).not.toMatch(/handleVideoUpload|handleStoryUpload/);
    expect(serverIndex).not.toMatch(/\/api\/videos\/upload/);
    expect(serverIndex).toContain("/api/uploads/sessions/:sessionId/bytes");
    expect(api).toContain("/api/uploads/sessions");
    expect(api).not.toContain("BUNNY_STORAGE_API_KEY");
    expect(bunny).toContain("AccessKey");
    expect(uploadsSession).not.toMatch(/new Map\(/);
  });

  it("does not fake progress, CDN media, or feed injection", () => {
    expect(session).not.toMatch(/progress:\s*50/);
    expect(uploadPage).not.toMatch(/elixstarlive\.b-cdn\.net|static production/);
    expect(uploadPage).not.toMatch(/inject|setFeedItems/);
    expect(uploadsSession).toContain('processingStatus: "ready"');
    expect(uploadsSession).not.toMatch(/setTimeout\(/);
  });
});
