import { Readable } from "node:stream";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { parseMultipart, readRequestBuffer } from "./multipart.js";

function body(boundary: string, parts: string[]): Buffer {
  return Buffer.from(`${parts.map((part) => `--${boundary}\r\n${part}\r\n`).join("")}--${boundary}--\r\n`);
}

function streamRequest(chunks: (Buffer | string)[]): Request {
  return Readable.from(chunks.map((chunk) => (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))) as unknown as Request;
}

describe("readRequestBuffer", () => {
  it("returns an already buffered body untouched", async () => {
    const buffered = Buffer.from("cached");
    const req = { body: buffered } as unknown as Request;
    expect(await readRequestBuffer(req)).toBe(buffered);
  });

  it("concatenates streamed chunks", async () => {
    const req = streamRequest(["hello ", "world"]);
    expect((await readRequestBuffer(req)).toString("utf8")).toBe("hello world");
  });

  it("rejects payloads above the limit", async () => {
    const req = streamRequest([Buffer.alloc(6)]);
    await expect(readRequestBuffer(req, 4)).rejects.toMatchObject({
      code: "validation_error",
      status: 413,
      message: "File too large",
    });
  });
});

describe("parseMultipart", () => {
  it("parses fields and a file part", () => {
    const buffer = body("X-Bound", [
      'Content-Disposition: form-data; name="caption"\r\n\r\nhello #live',
      'Content-Disposition: form-data; name="visibility"\r\n\r\npublic',
      'Content-Disposition: form-data; name="file"; filename="clip.mp4"\r\nContent-Type: video/mp4\r\n\r\nBINARY-DATA',
    ]);
    const { fields, file } = parseMultipart(buffer, 'multipart/form-data; boundary="X-Bound"');
    expect(fields).toEqual({ caption: "hello #live", visibility: "public" });
    expect(file?.filename).toBe("clip.mp4");
    expect(file?.contentType).toBe("video/mp4");
    expect(file?.buffer.toString("utf8")).toBe("BINARY-DATA");
  });

  it("defaults the filename and content type of an unnamed file part", () => {
    const buffer = body("b1", ['Content-Disposition: form-data; name="file"; filename=""\r\n\r\nbytes']);
    const { file } = parseMultipart(buffer, "multipart/form-data; boundary=b1");
    expect(file?.filename).toBe("upload.bin");
    expect(file?.contentType).toBe("application/octet-stream");
  });

  it("returns no file when only fields are sent", () => {
    const buffer = body("b1", ['Content-Disposition: form-data; name="caption"\r\n\r\nonly text']);
    expect(parseMultipart(buffer, "multipart/form-data; boundary=b1")).toEqual({
      fields: { caption: "only text" },
      file: null,
    });
  });

  it("ignores parts with no headers and unnamed non-file parts", () => {
    const buffer = body("b1", ["stray-body-without-headers", 'Content-Disposition: form-data\r\n\r\nunnamed']);
    expect(parseMultipart(buffer, "multipart/form-data; boundary=b1")).toEqual({ fields: {}, file: null });
  });

  it("throws when the boundary is missing", () => {
    expect(() => parseMultipart(Buffer.from(""), "multipart/form-data")).toThrowError(
      /Multipart boundary missing/,
    );
  });
});
