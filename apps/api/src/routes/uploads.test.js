import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadRoute } from './uploads.js';

const tempDirs = [];

async function createTempStorageDir() {
  const dir = await mkdtemp(join(tmpdir(), 'avia-upload-route-'));
  tempDirs.push(dir);
  return dir;
}

function createResponse() {
  let status = 0;
  let rawBody = Buffer.alloc(0);
  const headers = new Map();

  return {
    headers,
    get status() {
      return status;
    },
    get body() {
      return rawBody;
    },
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    writeHead(nextStatus, nextHeaders = {}) {
      status = nextStatus;
      Object.entries(nextHeaders).forEach(([name, value]) => {
        headers.set(String(name).toLowerCase(), value);
      });
    },
    end(value = '') {
      rawBody = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
    },
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, {
    recursive: true,
    force: true,
  })));
});

describe('upload route', () => {
  it('serves optimized item images from configured storage directory', async () => {
    const storageDir = await createTempStorageDir();
    await mkdir(join(storageDir, 'tenant-1', 'item-1'), { recursive: true });
    await writeFile(join(storageDir, 'tenant-1', 'item-1', 'thumb.webp'), Buffer.from('webp-data'));

    const req = {
      method: 'GET',
      url: '/uploads/item-images/tenant-1/item-1/thumb.webp',
    };
    const res = createResponse();

    const handled = await uploadRoute(req, res, { itemImageStorageDir: storageDir });

    expect(handled).toBe(true);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toContain('max-age');
    expect(res.body).toEqual(Buffer.from('webp-data'));
  });

  it('does not serve paths outside the item image upload namespace', async () => {
    const res = createResponse();

    const handled = await uploadRoute(
      { method: 'GET', url: '/api/items' },
      res,
      { itemImageStorageDir: await createTempStorageDir() },
    );

    expect(handled).toBe(false);
    expect(res.status).toBe(0);
  });

  it('blocks traversal attempts inside upload paths', async () => {
    const storageDir = await createTempStorageDir();
    const req = {
      method: 'GET',
      url: '/uploads/item-images/%2e%2e/secret.webp',
    };
    const res = createResponse();

    const handled = await uploadRoute(req, res, { itemImageStorageDir: storageDir });

    expect(handled).toBe(true);
    expect(res.status).toBe(404);
  });
});
