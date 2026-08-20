import { X509Certificate } from "node:crypto";
import { importX509, jwtVerify } from "jose";
import { GoogleAuth } from "google-auth-library";
import { AppError } from "../middleware/errors.js";
import { env } from "./env.js";

export type VerifiedPurchase = {
  providerTxnId: string;
  productId: string;
  coins: number;
};

/** Apple Root CA - G3 SHA-256 (Apple Support root store). */
const APPLE_ROOT_CA_G3_SHA256 =
  "63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179";

function expectedAppleEnvironment(): "Production" | "Sandbox" {
  return (process.env.APPLE_IAP_ENVIRONMENT || "Production").trim().toLowerCase() === "sandbox"
    ? "Sandbox"
    : "Production";
}

function derToPem(der: Buffer): string {
  const b64 = der.toString("base64").match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----`;
}

function fingerprint256(cert: X509Certificate): string {
  return cert.fingerprint256.replace(/:/g, "").toUpperCase();
}

function verifyX5cChain(x5c: string[]): X509Certificate {
  if (x5c.length < 2) {
    throw new AppError("payment_failed", "Apple certificate chain is incomplete", 400);
  }
  const certs = x5c.map((entry) => new X509Certificate(Buffer.from(entry, "base64")));
  for (let i = 0; i < certs.length - 1; i += 1) {
    const child = certs[i];
    const issuer = certs[i + 1];
    if (!child.verify(issuer.publicKey)) {
      throw new AppError("payment_failed", "Apple certificate chain is invalid", 400);
    }
  }
  const root = certs[certs.length - 1];
  if (fingerprint256(root) !== APPLE_ROOT_CA_G3_SHA256) {
    throw new AppError("payment_failed", "Apple certificate is not rooted at Apple Root CA G3", 400);
  }
  return certs[0];
}

export async function verifyAppleSignedJws(jws: string): Promise<Record<string, unknown>> {
  const parts = jws.split(".");
  if (parts.length !== 3) {
    throw new AppError("payment_failed", "Apple payload is not a signed JWS", 400);
  }
  const headerJson = Buffer.from(parts[0], "base64url").toString("utf8");
  const header = JSON.parse(headerJson) as { x5c?: string[]; alg?: string };
  if (!header.x5c?.length) {
    throw new AppError("payment_failed", "Apple payload is missing x5c", 400);
  }
  const leaf = verifyX5cChain(header.x5c);
  const pem = derToPem(leaf.raw);
  const key = await importX509(pem, header.alg === "ES256" ? "ES256" : "ES256");
  const { payload } = await jwtVerify(jws, key);
  return payload as Record<string, unknown>;
}

export async function verifyAppleJwsTransaction(jws: string): Promise<{
  transactionId: string;
  productId: string;
  bundleId: string;
  environment: string;
}> {
  const payload = await verifyAppleSignedJws(jws);
  const transactionId = typeof payload.transactionId === "string" ? payload.transactionId : "";
  const productId = typeof payload.productId === "string" ? payload.productId : "";
  const bundleId = typeof payload.bundleId === "string" ? payload.bundleId : "";
  const environment = typeof payload.environment === "string" ? payload.environment : "";
  if (!transactionId || !productId || !bundleId || !environment) {
    throw new AppError("payment_failed", "Apple transaction payload is incomplete", 400);
  }
  if (typeof payload.revocationDate === "number") {
    throw new AppError("payment_failed", "Apple transaction was revoked", 400);
  }
  if (bundleId !== env().APPLE_BUNDLE_ID) {
    throw new AppError("payment_failed", "Apple bundle mismatch", 400);
  }
  if (environment !== expectedAppleEnvironment()) {
    throw new AppError("payment_failed", "Apple environment mismatch", 400);
  }
  return { transactionId, productId, bundleId, environment };
}

export async function verifyAppleReceipt(
  receipt: string,
  productId: string,
  coins: number,
): Promise<VerifiedPurchase> {
  const verified = await verifyAppleJwsTransaction(receipt.trim());
  if (verified.productId !== productId) {
    throw new AppError("payment_failed", "Apple product mismatch", 400);
  }
  return { providerTxnId: verified.transactionId, productId: verified.productId, coins };
}

export async function verifyGooglePurchase(
  token: string,
  productId: string,
  coins: number,
): Promise<VerifiedPurchase> {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME?.trim() || "com.elixstarlive.app";
  if (!json) {
    throw new AppError("unavailable", "Google Play Billing is not configured", 503);
  }
  let credentials: object;
  try {
    credentials = JSON.parse(json) as object;
  } catch {
    throw new AppError("unavailable", "Google Play Billing is not configured", 503);
  }
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const client = await auth.getClient();
  const access = await client.getAccessToken();
  if (!access.token) {
    throw new AppError("unavailable", "Google Play auth failed", 503);
  }
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${access.token}` },
  });
  if (response.status === 404) {
    throw new AppError("payment_failed", "Google purchase not found", 400);
  }
  if (!response.ok) {
    throw new AppError("unavailable", "Google Play verification failed", 503);
  }
  const body = (await response.json()) as {
    purchaseState?: number;
    orderId?: string;
    consumptionState?: number;
  };
  if (body.purchaseState !== 0) {
    throw new AppError("payment_failed", "Google purchase is not completed", 400);
  }
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  if (!orderId) {
    throw new AppError("payment_failed", "Google purchase is missing order id", 400);
  }
  return { providerTxnId: orderId, productId, coins };
}
