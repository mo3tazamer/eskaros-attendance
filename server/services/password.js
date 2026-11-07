import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Salted scrypt hash stored as `scrypt$<salt>$<key>` (both base64). */
export async function hashPassword(plain) {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(plain, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, saltValue, keyValue] = stored.split('$');
  if (scheme !== 'scrypt' || !saltValue || !keyValue) return false;
  try {
    const salt = Buffer.from(saltValue, 'base64');
    const expected = Buffer.from(keyValue, 'base64');
    if (salt.length < 8 || expected.length !== KEY_LENGTH) return false;
    const actual = await scrypt(plain, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
