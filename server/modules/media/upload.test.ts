import { describe, expect, it } from "vitest";
import { AppError } from "../../middleware/errors.js";
import { assertUploadType } from "./upload.js";

describe("upload type validation", () => {
  it("accepts JPEG avatars and maps them to the safe extension", () => {
    expect(assertUploadType("image/jpeg", "avatar")).toEqual({
      contentType: "image/jpeg",
      extension: ".jpg",
    });
  });

  it("rejects non-media content types with a 415 AppError", () => {
    for (const contentType of ["text/html", "application/octet-stream"]) {
      expect(() => assertUploadType(contentType, "story")).toThrowError(AppError);
      try {
        assertUploadType(contentType, "story");
      } catch (error) {
        expect(error).toMatchObject({ code: "unsupported_media_type", status: 415 });
      }
    }
  });

  it("rejects videos for avatars", () => {
    expect(() => assertUploadType("video/mp4", "avatar")).toThrowError(AppError);
  });

  it("accepts QuickTime videos", () => {
    expect(assertUploadType("video/quicktime", "video")).toEqual({
      contentType: "video/quicktime",
      extension: ".mov",
    });
  });

  it("normalizes case and content type parameters", () => {
    expect(assertUploadType(" IMAGE/JPEG; charset=binary ", "avatar")).toEqual({
      contentType: "image/jpeg",
      extension: ".jpg",
    });
  });
});
