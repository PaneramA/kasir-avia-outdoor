import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { saveItemImageSet } from './itemImageStorage.js';

const tempDirs = [];

async function createTempStorageDir() {
  const dir = await mkdtemp(join(tmpdir(), 'avia-item-images-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, {
    recursive: true,
    force: true,
  })));
});

describe('item image storage', () => {
  it('stores detail and thumbnail files under tenant and item scoped paths', async () => {
    const storageDir = await createTempStorageDir();
    const detailBuffer = Buffer.from('detail-webp');
    const thumbnailBuffer = Buffer.from('thumb-webp');

    const result = await saveItemImageSet({
      storageDir,
      publicBaseUrl: '/uploads/item-images',
      tenantId: 'tenant-1',
      itemId: 'item-1',
      detailBuffer,
      thumbnailBuffer,
    });

    expect(result).toEqual({
      detail: {
        storageKey: 'tenant-1/item-1/detail.webp',
        url: '/uploads/item-images/tenant-1/item-1/detail.webp',
        bytes: detailBuffer.length,
      },
      thumbnail: {
        storageKey: 'tenant-1/item-1/thumb.webp',
        url: '/uploads/item-images/tenant-1/item-1/thumb.webp',
        bytes: thumbnailBuffer.length,
      },
    });
    await expect(readFile(join(storageDir, 'tenant-1', 'item-1', 'detail.webp')))
      .resolves.toEqual(detailBuffer);
    await expect(readFile(join(storageDir, 'tenant-1', 'item-1', 'thumb.webp')))
      .resolves.toEqual(thumbnailBuffer);
  });

  it('sanitizes tenant and item identifiers before building storage paths', async () => {
    const storageDir = await createTempStorageDir();

    const result = await saveItemImageSet({
      storageDir,
      publicBaseUrl: 'https://cdn.example.test/items/',
      tenantId: '../tenant satu',
      itemId: '..\\item dua',
      detailBuffer: Buffer.from('a'),
      thumbnailBuffer: Buffer.from('b'),
    });

    expect(result.detail.storageKey).toBe('tenant-satu/item-dua/detail.webp');
    expect(result.detail.url).toBe('https://cdn.example.test/items/tenant-satu/item-dua/detail.webp');
    await expect(readFile(join(storageDir, 'tenant-satu', 'item-dua', 'detail.webp')))
      .resolves.toEqual(Buffer.from('a'));
  });

  it('rejects missing buffers and storage settings', async () => {
    await expect(saveItemImageSet({
      storageDir: '',
      publicBaseUrl: '/uploads/item-images',
      tenantId: 'tenant-1',
      itemId: 'item-1',
      detailBuffer: Buffer.from('a'),
      thumbnailBuffer: Buffer.from('b'),
    })).rejects.toThrow('Item image storage directory is required');

    await expect(saveItemImageSet({
      storageDir: await createTempStorageDir(),
      publicBaseUrl: '/uploads/item-images',
      tenantId: 'tenant-1',
      itemId: 'item-1',
      detailBuffer: null,
      thumbnailBuffer: Buffer.from('b'),
    })).rejects.toThrow('Item image buffers are required');
  });
});
