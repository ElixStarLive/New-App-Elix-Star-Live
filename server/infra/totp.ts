import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

export function generateTotpSecret(): string {
  return randomBytes(20).toString("base64url");
}

export function totpNow(secretB64: string, now = Date.now()): string {
  const secret = Buffer.from(secretB64, "base64url");
  const counter = Math.floor(now / 30_000);
  return hotp(secret, counter);
}

export function verifyTotp(secretB64: string, code: string, now = Date.now()): boolean {
  const expected = totpNow(secretB64, now);
  const windowCodes = [expected, totpNow(secretB64, now - 30_000), totpNow(secretB64, now + 30_000)];
  const provided = Buffer.from(code.padStart(6, "0"));
  return windowCodes.some((item) => {
    const buf = Buffer.from(item);
    return buf.length === provided.length && timingSafeEqual(buf, provided);
  });
}
