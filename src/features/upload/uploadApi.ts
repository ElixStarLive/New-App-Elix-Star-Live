import { Capacitor } from "@capacitor/core";
import { apiUrl } from "@/lib/api";
import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { getSessionToken } from "@/lib/sessionToken";
import { normalizeUploadKind, type UploadKind } from "@shared/uploadContract";

export const UPLOAD_BYTES_TIMEOUT_MS = 10 * 60 * 1000;

export type CreateUploadSessionResponse = {
  sessionId: string;
  kind: UploadKind;
};

export type PublishUploadResponse = {
  id: string;
  kind: UploadKind;
  processingStatus: "ready";
};

function errorMessage(body: unknown, fallback: string): string {
  if (!isRecord(body)) return fallback;
  if (typeof body.message === "string" && body.message.trim()) return body.message;
  if (typeof body.error === "string" && body.error.trim()) return body.error;
  return fallback;
}

export async function apiCreateUploadSession(input: {
  idempotencyKey: string;
  kind: UploadKind;
  contentType: string;
  byteSize: number;
  filename?: string;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
}): Promise<{ data: CreateUploadSessionResponse | null; error: string | null; status: number }> {
  const { data, error } = await apiRequest<unknown>("/api/uploads/sessions", {
    method: "POST",
    body: JSON.stringify({
      idempotencyKey: input.idempotencyKey,
      kind: input.kind,
      contentType: input.contentType,
      byteSize: input.byteSize,
      filename: input.filename,
      durationMs: input.durationMs,
      width: input.width,
      height: input.height,
    }),
  });
  if (error) return { data: null, error: error.message, status: error.status };
  if (!isRecord(data) || typeof data.sessionId !== "string" || !data.sessionId.trim()) {
    return { data: null, error: "Upload session was not created", status: 0 };
  }
  return {
    data: { sessionId: data.sessionId, kind: normalizeUploadKind(data.kind) },
    error: null,
    status: 201,
  };
}

export async function apiPublishUploadSession(
  sessionId: string,
  input: { caption: string; extraHashtags: string; privacy: "public" | "private"; soundId: string | null },
): Promise<{ data: PublishUploadResponse | null; error: string | null; status: number }> {
  const { data, error } = await apiRequest<unknown>(`/api/uploads/sessions/${encodeURIComponent(sessionId)}/publish`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (error) return { data: null, error: error.message, status: error.status };
  if (!isRecord(data) || typeof data.id !== "string" || !data.id.trim()) {
    return { data: null, error: "Publish was not confirmed", status: 0 };
  }
  return {
    data: {
      id: data.id,
      kind: normalizeUploadKind(data.kind),
      processingStatus: "ready",
    },
    error: null,
    status: 201,
  };
}

export function putUploadBytes(
  sessionId: string,
  blob: Blob,
  contentType: string,
  opts: { onProgress?: (percent: number | null) => void; signal?: AbortSignal },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl(`/api/uploads/sessions/${encodeURIComponent(sessionId)}/bytes`));
    xhr.timeout = UPLOAD_BYTES_TIMEOUT_MS;
    const token = getSessionToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", contentType || "application/octet-stream");
    xhr.withCredentials = !Capacitor.isNativePlatform();
    xhr.upload.onprogress = (event) => {
      if (!opts.onProgress) return;
      if (event.lengthComputable && event.total > 0) {
        opts.onProgress(Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))));
      } else {
        opts.onProgress(null);
      }
    };
    const fail = (message: string) => reject(new Error(message));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      fail(errorMessage(body, `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => fail("Network error");
    xhr.ontimeout = () => fail("Upload timed out");
    xhr.onabort = () => fail("Upload cancelled");
    const onAbort = () => xhr.abort();
    if (opts.signal) {
      if (opts.signal.aborted) {
        xhr.abort();
        return;
      }
      opts.signal.addEventListener("abort", onAbort, { once: true });
    }
    xhr.send(blob);
  });
}
