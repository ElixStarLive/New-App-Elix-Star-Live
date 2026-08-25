import { JWT } from "google-auth-library";
import * as jose from "jose";
import http2 from "node:http2";
import { getPool } from "../../infra/postgres.js";
import { logger } from "../../infra/logger.js";

export type PushNotifyResult = {
  configured: boolean;
  sent: number;
  failed: number;
  reason?: "not_configured" | "no_tokens" | "delivered" | "provider_rejected" | "unavailable";
};

type ServiceAccount = {
  client_email?: string;
  private_key?: string;
  project_id?: string;
};

function loadFirebaseServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  const source = raw || (encoded ? Buffer.from(encoded, "base64").toString("utf8") : "");
  if (!source) return null;
  try {
    const parsed = JSON.parse(source) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

function apnsConfigured(): boolean {
  return Boolean(
    process.env.APNS_KEY_ID &&
      process.env.APNS_TEAM_ID &&
      process.env.APNS_PRIVATE_KEY &&
      process.env.APNS_BUNDLE_ID,
  );
}

export function isPushConfigured(): boolean {
  return Boolean(loadFirebaseServiceAccount() || apnsConfigured());
}

export function isUnregisteredPushError(status: number, bodyText: string): boolean {
  if (status === 404 || status === 410) return true;
  return /UNREGISTERED|NOT_FOUND|BadDeviceToken|Unregistered/i.test(bodyText);
}

async function sendFcm(token: string, title: string, body: string, data?: Record<string, string>): Promise<"sent" | "invalid" | "failed"> {
  const creds = loadFirebaseServiceAccount();
  if (!creds?.client_email || !creds.private_key) return "failed";
  const projectId = (process.env.FIREBASE_PROJECT_ID || creds.project_id || "").trim();
  if (!projectId) {
    logger.warn("push_notify FCM skipped: project id missing");
    return "failed";
  }
  const jwt = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });
  const access = await jwt.getAccessToken();
  if (!access.token) return "failed";
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data: data ?? {},
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.ok) return "sent";
  const text = await res.text();
  logger.warn({ status: res.status }, "push_notify FCM rejected");
  return isUnregisteredPushError(res.status, text) ? "invalid" : "failed";
}

function normalizeApnsKey(raw: string): string {
  return raw.replace(/\\n/g, "\n");
}

async function sendApns(token: string, title: string, body: string, data?: Record<string, string>): Promise<"sent" | "invalid" | "failed"> {
  const keyId = process.env.APNS_KEY_ID || "";
  const teamId = process.env.APNS_TEAM_ID || "";
  const bundleId = process.env.APNS_BUNDLE_ID || "";
  const privateKey = normalizeApnsKey(process.env.APNS_PRIVATE_KEY || "");
  if (!keyId || !teamId || !bundleId || !privateKey) return "failed";
  const host = process.env.APNS_PRODUCTION === "1" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
  const key = await jose.importPKCS8(privateKey, "ES256");
  const jwt = await new jose.SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime("20m")
    .sign(key);
  return new Promise((resolve) => {
    const client = http2.connect(`https://${host}`);
    let settled = false;
    let status = 0;
    let responseBody = "";
    const finish = (result: "sent" | "invalid" | "failed") => {
      if (settled) return;
      settled = true;
      try {
        client.close();
      } catch {
        /* already closed */
      }
      resolve(result);
    };
    const timer = setTimeout(() => finish("failed"), 10_000);
    client.on("error", () => {
      clearTimeout(timer);
      finish("failed");
    });
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      authorization: `bearer ${jwt}`,
      "content-type": "application/json",
    });
    req.on("response", (headers) => {
      status = Number(headers[":status"] || 0);
    });
    req.on("data", (chunk) => {
      responseBody += String(chunk);
    });
    req.on("error", () => {
      clearTimeout(timer);
      finish("failed");
    });
    req.on("end", () => {
      clearTimeout(timer);
      if (status >= 200 && status < 300) {
        finish("sent");
        return;
      }
      logger.warn({ status }, "push_notify APNs rejected");
      finish(isUnregisteredPushError(status, responseBody) ? "invalid" : "failed");
    });
    req.write(
      JSON.stringify({
        aps: { alert: { title, body }, sound: "default" },
        ...(data ?? {}),
      }),
    );
    req.end();
  });
}

export async function pushNotifyUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<PushNotifyResult> {
  if (!isPushConfigured()) {
    logger.warn("push_notify skipped: FCM/APNs not configured");
    return { configured: false, sent: 0, failed: 0, reason: "not_configured" };
  }
  const pool = getPool();
  const { rows } = await pool.query<{ platform: string; token: string }>(
    `SELECT platform, token FROM device_tokens WHERE user_id = $1`,
    [userId],
  );
  if (rows.length === 0) {
    return { configured: true, sent: 0, failed: 0, reason: "no_tokens" };
  }
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const platform = row.platform.toLowerCase();
    const result =
      platform === "ios" || platform === "iphone"
        ? await sendApns(row.token, title, body, data)
        : await sendFcm(row.token, title, body, data);
    if (result === "sent") {
      sent += 1;
      continue;
    }
    failed += 1;
    if (result === "invalid") {
      await pool.query(`DELETE FROM device_tokens WHERE user_id = $1 AND token = $2`, [userId, row.token]);
    }
  }
  return {
    configured: true,
    sent,
    failed,
    reason: sent > 0 ? "delivered" : "provider_rejected",
  };
}
