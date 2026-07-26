import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashPassword, needsPasswordRehash, verifyPassword } from './password.js';

describe('password security', () => {
  const pepper = 'test-pepper-with-enough-entropy';

  it('creates salted scrypt hashes and verifies the correct password asynchronously', async () => {
    const firstPromise = hashPassword('secret-password', pepper);
    expect(firstPromise).toBeInstanceOf(Promise);
    const first = await firstPromise;
    const second = await hashPassword('secret-password', pepper);

    expect(first).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(second).not.toBe(first);
    await expect(verifyPassword('secret-password', first, pepper)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', first, pepper)).resolves.toBe(false);
    await expect(verifyPassword('secret-password', first, 'wrong-pepper')).resolves.toBe(false);
    expect(needsPasswordRehash(first)).toBe(false);
  });

  it('supports legacy SHA-256 hashes and marks them for rehashing', async () => {
    const legacy = createHash('sha256').update(`legacy-password:${pepper}`).digest('hex');

    await expect(verifyPassword('legacy-password', legacy, pepper)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', legacy, pepper)).resolves.toBe(false);
    expect(needsPasswordRehash(legacy)).toBe(true);
  });

  it('rejects malformed scrypt hashes', async () => {
    const malformed = 'scrypt$16384$8$1$bad$bad';
    await expect(verifyPassword('anything', malformed, pepper)).resolves.toBe(false);
    expect(needsPasswordRehash(malformed)).toBe(true);
  });
});
