import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RFC 6238 TOTP over RFC 4648 base32 secrets — the only encoding authenticator
 * apps accept for a manually entered setup key.
 */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const SECRET_BYTES = 20;
const MIN_SECRET_BYTES = 10;
const STEP_MS = 30_000;
const SKEW_STEPS = 1;
const ISSUER = "Elix Star Live";

function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Null for anything that is not a valid base32 secret — never a silent wrong key. */
function base32Decode(secret: string): Buffer | null {
  const cleaned = secret.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  if (!cleaned) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const character of cleaned) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const bytes = Buffer.from(out);
  return bytes.length >= MIN_SECRET_BYTES ? bytes : null;
}

function hotp(secret: Buffer, counter: number): string {
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const truncated =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(truncated % 1_000_000).padStart(6, "0");
}

function counterAt(now: number): number {
  return Math.floor(now / STEP_MS);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

export function totpOtpauthUrl(account: string, secret: string): string {
  const label = encodeURIComponent(`${ISSUER}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=30`;
}

export function totpNow(secret: string, now = Date.now()): string {
  const key = base32Decode(secret);
  if (!key) return "";
  return hotp(key, counterAt(now));
}

/** The accepted time step, so a caller can burn that step and stop code replay. */
export function matchTotpCounter(secret: string, code: string, now = Date.now()): number | null {
  const cleaned = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return null;
  const key = base32Decode(secret);
  if (!key) return null;
  const provided = Buffer.from(cleaned, "utf8");
  const current = counterAt(now);
  for (let offset = -SKEW_STEPS; offset <= SKEW_STEPS; offset += 1) {
    const counter = current + offset;
    const expected = Buffer.from(hotp(key, counter), "utf8");
    if (expected.length === provided.length && timingSafeEqual(expected, provided)) return counter;
  }
  return null;
}

export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  return matchTotpCounter(secret, code, now) !== null;
}
