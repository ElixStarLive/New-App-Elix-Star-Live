// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isNativePlatform, capacitorHttpRequest } = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
  capacitorHttpRequest: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform, getPlatform: () => "web" },
  CapacitorHttp: { request: capacitorHttpRequest },
}));

import { apiRequest, apiUploadForm } from "./apiClient";
import { setSessionToken } from "./sessionToken";

type FetchInit = RequestInit & { headers?: Record<string, string> };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(status: number, body = "<html>"): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html" } });
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: FetchInit) => Promise<Response>>();

function lastInit(): FetchInit {
  return (fetchMock.mock.calls.at(-1)?.[1] ?? {}) as FetchInit;
}

describe("apiRequest (browser fetch)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    capacitorHttpRequest.mockReset();
    isNativePlatform.mockReturnValue(false);
    setSessionToken(null);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed json for a 200 response", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "v1" }));
    await expect(apiRequest<{ id: string }>("/api/videos/v1")).resolves.toEqual({
      data: { id: "v1" },
      error: null,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/videos/v1");
  });

  it("sends json content type and the bearer token when a session exists", async () => {
    setSessionToken("tok-123");
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await apiRequest("/api/wallet", { method: "POST", headers: { "X-Trace": "abc" } });
    expect(lastInit().headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer tok-123",
      "X-Trace": "abc",
    });
    expect(lastInit().credentials).toBe("include");
  });

  it("normalizes Headers and header tuples", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await apiRequest("/api/a", { headers: new Headers({ "X-One": "1" }) });
    expect(lastInit().headers).toMatchObject({ "x-one": "1" });
    await apiRequest("/api/a", { headers: [["X-Two", "2"]] });
    expect(lastInit().headers).toMatchObject({ "X-Two": "2" });
  });

  it("maps an error body to message and code", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "invalid_credentials", message: "Nope" }));
    await expect(apiRequest("/api/auth/login", { method: "POST" })).resolves.toEqual({
      data: null,
      error: { message: "Nope", status: 401, code: "invalid_credentials" },
    });
  });

  it("falls back to the first validation detail, then the error code, then the status", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: "validation_error", details: [{ path: "email", message: "Invalid email" }] }),
    );
    await expect(apiRequest("/api/x")).resolves.toMatchObject({
      error: { message: "email: Invalid email", code: "validation_error" },
    });

    fetchMock.mockResolvedValue(jsonResponse(400, { error: "validation_error", details: [] }));
    await expect(apiRequest("/api/x")).resolves.toMatchObject({ error: { message: "validation_error" } });

    fetchMock.mockResolvedValue(jsonResponse(500, {}));
    await expect(apiRequest("/api/x")).resolves.toMatchObject({ error: { message: "HTTP_500" } });
  });

  it("uses the bare detail message when it carries no path", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { details: [{ message: "Too short" }] }));
    await expect(apiRequest("/api/x")).resolves.toMatchObject({ error: { message: "Too short" } });
  });

  it("reports a non-json success as RESPONSE_NOT_JSON", async () => {
    fetchMock.mockResolvedValue(textResponse(200));
    await expect(apiRequest("/api/x")).resolves.toEqual({
      data: null,
      error: { message: "RESPONSE_NOT_JSON", status: 200 },
    });
  });

  it("explains a 503 html response as a stopped api server", async () => {
    fetchMock.mockResolvedValue(textResponse(503));
    await expect(apiRequest("/api/x")).resolves.toMatchObject({
      error: { message: "API server is not running. Start it with npm run dev:server.", status: 503 },
    });
  });

  it("reports other non-json failures by status", async () => {
    fetchMock.mockResolvedValue(textResponse(502));
    await expect(apiRequest("/api/x")).resolves.toMatchObject({ error: { message: "HTTP_502", status: 502 } });
  });

  it("treats an empty json body as a non-json response", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(apiRequest("/api/x")).resolves.toMatchObject({ error: { message: "RESPONSE_NOT_JSON" } });
  });

  it("returns a status 0 network error instead of throwing", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(apiRequest("/api/x")).resolves.toEqual({
      data: null,
      error: { message: "Failed to fetch", status: 0 },
    });
  });

  it("reports a timeout when the request aborts", async () => {
    fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(apiRequest("/api/x")).resolves.toMatchObject({
      error: { message: "Request timed out", status: 0 },
    });
  });

  it("reports a non-Error rejection as a network error", async () => {
    fetchMock.mockRejectedValue("boom");
    await expect(apiRequest("/api/x")).resolves.toMatchObject({ error: { message: "Network error", status: 0 } });
  });

  it("keeps a caller supplied abort signal", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await apiRequest("/api/x", { signal: controller.signal });
    expect(lastInit().signal).toBe(controller.signal);
  });
});

describe("apiRequest (native CapacitorHttp)", () => {
  beforeEach(() => {
    capacitorHttpRequest.mockReset();
    isNativePlatform.mockReturnValue(true);
    setSessionToken("native-tok");
  });

  afterEach(() => {
    isNativePlatform.mockReturnValue(false);
    setSessionToken(null);
  });

  it("sends the parsed json body and the auth header", async () => {
    capacitorHttpRequest.mockResolvedValue({ status: 200, data: { ok: true } });
    await expect(apiRequest("/api/gifts", { method: "post", body: JSON.stringify({ giftId: "rose" }) })).resolves.toEqual(
      { data: { ok: true }, error: null },
    );
    expect(capacitorHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        data: { giftId: "rose" },
        headers: expect.objectContaining({ Authorization: "Bearer native-tok" }),
        responseType: "json",
      }),
    );
  });

  it("passes a non-json string body through unparsed", async () => {
    capacitorHttpRequest.mockResolvedValue({ status: 200, data: {} });
    await apiRequest("/api/x", { method: "PUT", body: "not-json" });
    expect(capacitorHttpRequest.mock.calls[0]?.[0]).toMatchObject({ data: "not-json" });
  });

  it("decodes a json string response body", async () => {
    capacitorHttpRequest.mockResolvedValue({ status: 200, data: '{"id":"v1"}' });
    await expect(apiRequest<{ id: string }>("/api/x")).resolves.toEqual({ data: { id: "v1" }, error: null });
  });

  it("maps a missing status to a status 0 error", async () => {
    capacitorHttpRequest.mockResolvedValue({ status: undefined, data: null });
    await expect(apiRequest("/api/x")).resolves.toMatchObject({ error: { status: 0 } });
  });

  it("returns an error instead of throwing when the native bridge fails", async () => {
    capacitorHttpRequest.mockRejectedValue(new Error("bridge down"));
    await expect(apiRequest("/api/x")).resolves.toEqual({
      data: null,
      error: { message: "bridge down", status: 0 },
    });
  });

  it("reports a non-Error native rejection", async () => {
    capacitorHttpRequest.mockRejectedValue("nope");
    await expect(apiRequest("/api/x")).resolves.toMatchObject({
      error: { message: "Native request failed", status: 0 },
    });
  });
});

describe("apiUploadForm", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    isNativePlatform.mockReturnValue(false);
    setSessionToken("upload-tok");
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setSessionToken(null);
  });

  it("posts the form without a json content type", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: "u1" }));
    const form = new FormData();
    form.append("caption", "hello");
    await expect(apiUploadForm<{ id: string }>("/api/videos", form)).resolves.toEqual({
      data: { id: "u1" },
      error: null,
    });
    const init = lastInit();
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer upload-tok" });
    expect(init.body).toBe(form);
  });

  it("omits cookie credentials on native platforms", async () => {
    isNativePlatform.mockReturnValue(true);
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await apiUploadForm("/api/videos", new FormData());
    expect(lastInit().credentials).toBe("omit");
    isNativePlatform.mockReturnValue(false);
  });

  it("sends no auth header when there is no session", async () => {
    setSessionToken(null);
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await apiUploadForm("/api/videos", new FormData());
    expect(lastInit().headers).toEqual({});
  });

  it("surfaces a non-json response and upload failures", async () => {
    fetchMock.mockResolvedValue(textResponse(413));
    await expect(apiUploadForm("/api/videos", new FormData())).resolves.toMatchObject({
      error: { message: "HTTP_413", status: 413 },
    });

    fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(apiUploadForm("/api/videos", new FormData())).resolves.toMatchObject({
      error: { message: "Request timed out", status: 0 },
    });

    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(apiUploadForm("/api/videos", new FormData())).resolves.toMatchObject({
      error: { message: "offline", status: 0 },
    });
  });
});
