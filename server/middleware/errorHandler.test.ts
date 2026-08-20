import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import http from "node:http";
import express from "express";
import { z } from "zod";
import { errorHandler } from "./errorHandler.js";
import { AppError } from "./errors.js";

describe("errorHandler", () => {
  let server: http.Server;
  let base = "";

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.post("/echo", (req, res) => {
      res.json(req.body);
    });
    app.post("/validate", async (req, res) => {
      z.object({
        username: z.string().min(8, "Username too short"),
      }).parse(req.body);
      res.json({ ok: true });
    });
    app.post("/app-error", () => {
      throw new AppError("conflict", "Email or username already in use", 409);
    });
    app.use(errorHandler);
    server = await new Promise<http.Server>((resolve) => {
      const started = app.listen(0, "127.0.0.1");
      started.on("listening", () => resolve(started));
    });
    const addr = server.address() as AddressInfo;
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("maps invalid JSON to validation_error 400, not 500", async () => {
    const res = await fetch(`${base}/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toMatch(/json/);
    await expect(res.json()).resolves.toEqual({
      error: "validation_error",
      message: "Invalid JSON body",
    });
  });

  it("maps Zod 4 parse failures to validation_error 400", async () => {
    const res = await fetch(`${base}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "ab" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("validation_error");
    expect(body.message).toContain("too short");
  });

  it("maps AppError to its status and code", async () => {
    const res = await fetch(`${base}/app-error`, { method: "POST" });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "conflict",
      message: "Email or username already in use",
    });
  });
});
