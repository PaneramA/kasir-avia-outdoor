import { describe, expect, it, vi } from 'vitest';
import {
  backfillItemImages,
  decodeDataUrlImage,
  selectItemImageBackfillCandidates,
} from './itemImageBackfill.js';

function imageDataUrl(bytes = 'raw-image', mimeType = 'image/png') {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}

describe('item image backfill', () => {
  it('decodes data URL images into raw upload buffers', () => {
    expect(decodeDataUrlImage(imageDataUrl('abc'))).toEqual({
      buffer: Buffer.from('abc'),
      mimeType: 'image/png',
    });
    expect(decodeDataUrlImage('https://example.test/item.png')).toBeNull();
  });

  it('selects only base64 image candidates and respects tenant and limit filters', () => {
    const candidates = selectItemImageBackfillCandidates([
      { id: 'item-1', tenantId: 'tenant-1', image: imageDataUrl('one') },
      { id: 'item-2', tenantId: 'tenant-1', image: 'https://example.test/item.png' },
      { id: 'item-3', tenantId: 'tenant-2', image: imageDataUrl('two') },
      { id: 'item-4', tenantId: 'tenant-1', image: imageDataUrl('three') },
    ], {
      tenantId: 'tenant-1',
      limit: 1,
    });

    expect(candidates.map((item) => item.id)).toEqual(['item-1']);
  });

  it('dry-runs without processing, storing, or updating item rows', async () => {
    const database = {
      item: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'item-1', tenantId: 'tenant-1', branchId: 'branch-1', image: imageDataUrl('one') },
        ]),
        update: vi.fn(),
      },
    };
    const processImage = vi.fn();
    const saveImageSet = vi.fn();

    const result = await backfillItemImages({
      database,
      apply: false,
      limit: 10,
      storageDir: 'uploads/item-images',
      publicBaseUrl: '/uploads/item-images',
      processImage,
      saveImageSet,
    });

    expect(result).toMatchObject({
      ok: true,
      mode: 'dry-run',
      scanned: 1,
      candidates: 1,
      converted: 0,
    });
    expect(processImage).not.toHaveBeenCalled();
    expect(saveImageSet).not.toHaveBeenCalled();
    expect(database.item.update).not.toHaveBeenCalled();
  });

  it('writes optimized files before replacing legacy base64 item images', async () => {
    const database = {
      item: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'item-1', tenantId: 'tenant-1', branchId: 'branch-1', image: imageDataUrl('legacy') },
        ]),
        update: vi.fn().mockResolvedValue({ id: 'item-1' }),
      },
    };
    const processImage = vi.fn().mockResolvedValue({
      detailBuffer: Buffer.from('detail-webp'),
      thumbnailBuffer: Buffer.from('thumb-webp'),
      metadata: { originalBytes: 6 },
    });
    const saveImageSet = vi.fn().mockResolvedValue({
      detail: { url: '/uploads/item-images/tenant-1/item-1/detail.webp' },
      thumbnail: { url: '/uploads/item-images/tenant-1/item-1/thumb.webp' },
    });

    const result = await backfillItemImages({
      database,
      apply: true,
      limit: 10,
      storageDir: 'uploads/item-images',
      publicBaseUrl: '/uploads/item-images',
      processImage,
      saveImageSet,
    });

    expect(result).toMatchObject({
      ok: true,
      mode: 'apply',
      converted: 1,
      failures: [],
    });
    expect(processImage).toHaveBeenCalledWith(Buffer.from('legacy'));
    expect(saveImageSet).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      itemId: 'item-1',
      detailBuffer: Buffer.from('detail-webp'),
      thumbnailBuffer: Buffer.from('thumb-webp'),
    }));
    expect(database.item.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { image: '/uploads/item-images/tenant-1/item-1/thumb.webp' },
    });
  });

  it('does not update the database when optimized file storage fails', async () => {
    const database = {
      item: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'item-1', tenantId: 'tenant-1', branchId: 'branch-1', image: imageDataUrl('legacy') },
        ]),
        update: vi.fn(),
      },
    };
    const processImage = vi.fn().mockResolvedValue({
      detailBuffer: Buffer.from('detail-webp'),
      thumbnailBuffer: Buffer.from('thumb-webp'),
      metadata: { originalBytes: 6 },
    });
    const saveImageSet = vi.fn().mockRejectedValue(new Error('disk full'));

    const result = await backfillItemImages({
      database,
      apply: true,
      limit: 10,
      storageDir: 'uploads/item-images',
      publicBaseUrl: '/uploads/item-images',
      processImage,
      saveImageSet,
    });

    expect(result).toMatchObject({
      ok: false,
      converted: 0,
      failures: [{ id: 'item-1', message: 'disk full' }],
    });
    expect(database.item.update).not.toHaveBeenCalled();
  });
});
