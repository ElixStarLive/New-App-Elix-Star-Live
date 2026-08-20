import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { apiUrl } from "./api";
import { isRecord } from "./isRecord";
import { getSessionToken } from "./sessionToken";

export type ApiError = {
  message: string;
  status: number;
  code?: string;
};

export type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: ApiError };

const REQUEST_TIMEOUT_MS = 20_000;

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getSessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function requestCredentials(): RequestCredentials {
  return Capacitor.isNativePlatform() ? "omit" : "include";
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value;
    return out;
  }
  return { ...headers };
}

function parseJsonBody(body: BodyInit | null | undefined): unknown {
  if (body == null) return undefined;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return undefined;
}

function nonJsonHttpMessage(ok: boolean, status: number): string {
  if (ok) return "RESPONSE_NOT_JSON";
  if (status === 503) return "API server is not running. Start it with npm run dev:server.";
  return `HTTP_${status}`;
}

function firstDetailMessage(body: Record<string, unknown>): string | null {
  if (!Array.isArray(body.details) || body.details.length === 0) return null;
  const first = body.details[0];
  if (!isRecord(first) || typeof first.message !== "string" || !first.message.trim()) return null;
  const path = typeof first.path === "string" ? first.path.trim() : "";
  return path ? `${path}: ${first.message}` : first.message;
}

function errorFromBody(status: number, body: unknown): ApiError {
  if (isRecord(body)) {
    const code = typeof body.error === "string" ? body.error : undefined;
    const message =
      typeof body.message === "string"
        ? body.message
        : firstDetailMessage(body) || code || `HTTP_${status}`;
    return { message, status, code };
  }
  return { message: `HTTP_${status}`, status };
}

function decodeHttpBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  const trimmed = body.trim();
  if (!trimmed) return body;
  try {
    return JSON.parse(trimmed);
  } catch {
    return body;
  }
}

function toResult<T>(status: number, body: unknown): ApiResult<T> {
  const decoded = decodeHttpBody(body);
  if (status < 200 || status >= 300) {
    return { data: null, error: errorFromBody(status, decoded) };
  }
  if (decoded === undefined || decoded === null || typeof decoded === "string") {
    return { data: null, error: { message: "RESPONSE_NOT_JSON", status } };
  }
  return { data: decoded as T, error: null };
}

async function nativeCapacitorHttpRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const method = (init.method || "GET").toUpperCase();
  const response = await CapacitorHttp.request({
    url: apiUrl(path),
    method,
    headers: { ...authHeaders(), ...normalizeHeaders(init.headers) },
    data: parseJsonBody(init.body ?? undefined),
    connectTimeout: REQUEST_TIMEOUT_MS,
    readTimeout: REQUEST_TIMEOUT_MS,
    responseType: "json",
  });
  return toResult<T>(Number(response.status || 0), response.data);
}

async function browserFetchRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl(path), {
      ...init,
      headers: { ...authHeaders(), ...normalizeHeaders(init.headers) },
      credentials: requestCredentials(),
      signal: init.signal ?? controller.signal,
    });
    const ct = res.headers.get("content-type") || "";
    const isJson = ct.includes("application/json") || ct.includes("+json");
    if (!isJson) {
      return {
        data: null,
        error: {
          message: nonJsonHttpMessage(res.ok, res.status),
          status: res.status,
        },
      };
    }
    const body: unknown = await res.json().catch(() => null);
    return toResult<T>(res.status, body);
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    return {
      data: null,
      error: {
        message: aborted ? "Request timed out" : err instanceof Error ? err.message : "Network error",
        status: 0,
      },
    };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function apiUploadForm<T>(path: string, form: FormData): Promise<ApiResult<T>> {
  const token = getSessionToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(apiUrl(path), {
      method: "POST",
      headers,
      body: form,
      credentials: requestCredentials(),
      signal: controller.signal,
    });
    const ct = res.headers.get("content-type") || "";
    const isJson = ct.includes("application/json") || ct.includes("+json");
    if (!isJson) {
      return {
        data: null,
        error: {
          message: nonJsonHttpMessage(res.ok, res.status),
          status: res.status,
        },
      };
    }
    const body: unknown = await res.json().catch(() => null);
    return toResult<T>(res.status, body);
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    return {
      data: null,
      error: {
        message: aborted ? "Request timed out" : err instanceof Error ? err.message : "Network error",
        status: 0,
      },
    };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  if (Capacitor.isNativePlatform()) {
    try {
      return await nativeCapacitorHttpRequest<T>(path, init);
    } catch (err) {
      return {
        data: null,
        error: {
          message: err instanceof Error ? err.message : "Native request failed",
          status: 0,
        },
      };
    }
  }
  return browserFetchRequest<T>(path, init);
}
