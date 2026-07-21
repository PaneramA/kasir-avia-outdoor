import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashPassword, needsPasswordRehash, verifyPassword } from './password.js';

describe('password security', () => {
  const pepper = 'test-pepper-with-enough-entropy';

  it('creates salted scrypt hashes and verifies the correct password', () => {
    const first = hashPassword('secret-password', pepper);
    const second = hashPassword('secret-password', pepper);

    expect(first).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(second).not.toBe(first);
    expect(verifyPassword('secret-password', first, pepper)).toBe(true);
    expect(verifyPassword('wrong-password', first, pepper)).toBe(false);
    expect(verifyPassword('secret-password', first, 'wrong-pepper')).toBe(false);
    expect(needsPasswordRehash(first)).toBe(false);
  });

  it('supports legacy SHA-256 hashes and marks them for rehashing', () => {
    const legacy = createHash('sha256').update(`legacy-password:${pepper}`).digest('hex');

    expect(verifyPassword('legacy-password', legacy, pepper)).toBe(true);
    expect(verifyPassword('wrong-password', legacy, pepper)).toBe(false);
    expect(needsPasswordRehash(legacy)).toBe(true);
  });

  it('rejects malformed scrypt hashes', () => {
    const malformed = 'scrypt$16384$8$1$bad$bad';
    expect(verifyPassword('anything', malformed, pepper)).toBe(false);
    expect(needsPasswordRehash(malformed)).toBe(true);
  });
});
