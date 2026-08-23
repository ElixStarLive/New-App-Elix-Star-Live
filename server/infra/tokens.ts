import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env.js";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(): string {
  return randomBytes(32).toString("hex");
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env().JWT_SECRET);
}

export async function signAccessToken(userId: string, sessionId: string, email = ""): Promise<string> {
  const { isLiveNeonSchema } = await import("./liveSchema.js");
  if (await isLiveNeonSchema()) {
    return new SignJWT({ email })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secretKey());
  }
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function verifyAccessToken(
  token: string,
): Promise<{ userId: string; sessionId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.purpose) return null;
    if (typeof payload.sub !== "string") return null;
    const { isLiveNeonSchema } = await import("./liveSchema.js");
    if (await isLiveNeonSchema()) {
      return { userId: payload.sub, sessionId: sha256(token) };
    }
    if (typeof payload.sid !== "string") return null;
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    return null;
  }
}

/** Purpose-bound JWT (email_verify / password_reset). Never a session token. */
export async function signPurposeToken(input: {
  sub: string;
  email: string;
  purpose: string;
  pv: string;
  expirySec: number;
}): Promise<string> {
  return new SignJWT({
    email: input.email,
    purpose: input.purpose,
    pv: input.pv,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.sub)
    .setIssuedAt()
    .setExpirationTime(`${input.expirySec}s`)
    .sign(secretKey());
}

export async function verifyPurposeToken(
  token: string,
  purpose: string,
): Promise<{ sub: string; email: string; pv: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.purpose !== purpose) return null;
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    const email = typeof payload.email === "string" ? payload.email : "";
    const pv = typeof payload.pv === "string" ? payload.pv : "";
    if (!pv) return null;
    return { sub: payload.sub, email, pv };
  } catch {
    return null;
  }
}
