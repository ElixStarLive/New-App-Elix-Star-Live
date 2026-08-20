import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEYLEN, SCRYPT_OPTS, (error, derived) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(`${salt.toString("hex")}:${derived.toString("hex")}`);
    });
  });
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return Promise.resolve(false);
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
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
