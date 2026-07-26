import { describe, expect, it, vi } from 'vitest';
import { rotateAdminCredentials } from './rotate-admin-credentials.mjs';

describe('admin credential rotation', () => {
  it('upserts only the configured platform admin', async () => {
    const upsert = vi.fn().mockResolvedValue({
      id: 'admin-1',
      username: 'platform-admin@example.com',
      role: 'superuser',
    });
    const database = {
      user: { upsert },
      tenant: { upsert: vi.fn() },
      branch: { upsert: vi.fn() },
    };
    const hash = vi.fn().mockResolvedValue('hashed-password');

    await expect(rotateAdminCredentials({
      database,
      username: ' Platform-Admin@Example.COM ',
      password: 'a-secure-admin-password',
      pepper: 'a-secure-password-pepper',
      hash,
    })).resolves.toEqual({
      id: 'admin-1',
      username: 'platform-admin@example.com',
      role: 'superuser',
    });

    expect(hash).toHaveBeenCalledWith(
      'a-secure-admin-password',
      'a-secure-password-pepper',
    );
    expect(upsert).toHaveBeenCalledWith({
      where: { username: 'platform-admin@example.com' },
      update: { passwordHash: 'hashed-password', role: 'superuser' },
      create: {
        username: 'platform-admin@example.com',
        passwordHash: 'hashed-password',
        role: 'superuser',
      },
      select: { id: true, username: true, role: true },
    });
    expect(database.tenant.upsert).not.toHaveBeenCalled();
    expect(database.branch.upsert).not.toHaveBeenCalled();
  });

  it('rejects weak credentials before touching the database', async () => {
    const database = { user: { upsert: vi.fn() } };

    await expect(rotateAdminCredentials({
      database,
      username: 'platform-admin@example.com',
      password: 'too-short',
      pepper: 'a-secure-password-pepper',
    })).rejects.toThrow('at least 16 characters');
    expect(database.user.upsert).not.toHaveBeenCalled();
  });
});
