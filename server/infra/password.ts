import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 } as const;

function encodingsFor(part: string): Buffer[] {
  const out: Buffer[] = [];
  const asB64 = Buffer.from(part, "base64");
  if (asB64.length > 0) out.push(asB64);
  if (/^[0-9a-f]+$/i.test(part) && part.length % 2 === 0 && part.length >= 16) {
    out.push(Buffer.from(part, "hex"));
  }
  return out;
}

function scryptVerify(password: string, salt: Buffer, expected: Buffer): Promise<boolean> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, expected.length, SCRYPT_OPTS, (error, derived) => {
      if (error) {
        reject(error);
        return;
      }
      if (derived.length !== expected.length) {
        resolve(false);
        return;
      }
      resolve(timingSafeEqual(derived, expected));
    });
  });
}

export function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEYLEN, SCRYPT_OPTS, (error, derived) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(`${salt.toString("base64")}:${derived.toString("base64")}`);
    });
  });
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltPart, hashPart] = stored.split(":");
  if (!saltPart || !hashPart) return false;
  const salts = encodingsFor(saltPart);
  const hashes = encodingsFor(hashPart);
  for (const salt of salts) {
    for (const expected of hashes) {
      if (expected.length === 0) continue;
      if (await scryptVerify(password, salt, expected)) return true;
    }
  }
  return false;
}
