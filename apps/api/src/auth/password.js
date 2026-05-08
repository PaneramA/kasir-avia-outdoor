import { createHash } from 'node:crypto';

export function hashPassword(password, pepper) {
  return createHash('sha256').update(`${password}:${pepper}`).digest('hex');
}

export function verifyPassword(password, passwordHash, pepper) {
  return hashPassword(password, pepper) === passwordHash;
}
