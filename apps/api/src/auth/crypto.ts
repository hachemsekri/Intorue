import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/** argon2id with OWASP-recommended parameters (19 MiB, t=2). */
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (pw: string) => hash(pw, ARGON);
export const verifyPassword = (hashStr: string, pw: string) => verify(hashStr, pw).catch(() => false);

/** A hash computed once so failed lookups take as long as real ones (no user enumeration by timing). */
let dummy: Promise<string> | undefined;
export const dummyVerify = async (pw: string) => {
  dummy ??= hashPassword('dummy-password-for-timing-1');
  await verifyPassword(await dummy, pw);
  return false;
};

/** Opaque random token (sent to the user) and its SHA-256 (stored). */
export function newOpaqueToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
}
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
