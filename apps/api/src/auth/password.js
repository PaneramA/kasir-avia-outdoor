import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_ALGO = 'scrypt';
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function deriveKey(password, pepper, saltBuffer, options) {
  return scryptSync(`${password}:${pepper}`, saltBuffer, SCRYPT_KEY_LENGTH, {
    cost: options.cost,
    blockSize: options.blockSize,
    parallelization: options.parallelization,
    maxmem: SCRYPT_MAXMEM,
  });
}

function hashLegacy(password, pepper) {
  return createHash('sha256').update(`${password}:${pepper}`).digest('hex');
}

function parseScryptHash(passwordHash) {
  const parts = String(passwordHash || '').split('$');
  if (parts.length !== 6 || parts[0] !== SCRYPT_ALGO) {
    return null;
  }

  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallelization = Number(parts[3]);
  const saltHex = parts[4];
  const keyHex = parts[5];

  if (
    !Number.isInteger(cost) || cost < 2 ||
    !Number.isInteger(blockSize) || blockSize < 1 ||
    !Number.isInteger(parallelization) || parallelization < 1 ||
    !saltHex ||
    !keyHex
  ) {
    return null;
  }

  try {
    const salt = Buffer.from(saltHex, 'hex');
    const key = Buffer.from(keyHex, 'hex');
    if (salt.length < 16 || key.length !== SCRYPT_KEY_LENGTH) {
      return null;
    }

    return {
      cost,
      blockSize,
      parallelization,
      salt,
      key,
    };
  } catch {
    return null;
  }
}

export function needsPasswordRehash(passwordHash) {
  const parsed = parseScryptHash(passwordHash);
  if (!parsed) {
    return true;
  }

  return (
    parsed.cost !== SCRYPT_COST ||
    parsed.blockSize !== SCRYPT_BLOCK_SIZE ||
    parsed.parallelization !== SCRYPT_PARALLELIZATION
  );
}

export function hashPassword(password, pepper) {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const key = deriveKey(password, pepper, salt, {
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLELIZATION,
  });

  return [
    SCRYPT_ALGO,
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString('hex'),
    key.toString('hex'),
  ].join('$');
}

export function verifyPassword(password, passwordHash, pepper) {
  const parsed = parseScryptHash(passwordHash);
  if (parsed) {
    const derived = deriveKey(password, pepper, parsed.salt, parsed);
    if (derived.length !== parsed.key.length) {
      return false;
    }

    return timingSafeEqual(derived, parsed.key);
  }

  return hashLegacy(password, pepper) === passwordHash;
}
