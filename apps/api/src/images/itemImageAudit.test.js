import { describe, expect, it } from 'vitest';
import {
  classifyItemImage,
  summarizeItemImages,
} from './itemImageAudit.js';

describe('item image audit', () => {
  it('classifies empty image values', () => {
    expect(classifyItemImage('')).toEqual({
      kind: 'empty',
      estimatedBytes: 0,
      mimeType: null,
      reason: 'empty',
    });
    expect(classifyItemImage(null)).toMatchObject({ kind: 'empty', estimatedBytes: 0 });
  });

  it('classifies remote URLs and existing local storage paths without estimating payload bytes', () => {
    expect(classifyItemImage('https://cdn.example.test/items/tenda.webp')).toEqual({
      kind: 'remote-url',
      estimatedBytes: 0,
      mimeType: null,
      reason: 'url-reference',
    });
    expect(classifyItemImage('/uploads/items/tenant-1/item-1/thumb.webp')).toEqual({
      kind: 'storage-path',
      estimatedBytes: 0,
      mimeType: 'image/webp',
      reason: 'storage-reference',
    });
  });

  it('classifies image data URLs and estimates decoded byte size', () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const result = classifyItemImage(`data:image/png;base64,${pngBytes.toString('base64')}`);

    expect(result).toEqual({
      kind: 'base64-image',
      estimatedBytes: 4,
      mimeType: 'image/png',
      reason: 'database-inline-image',
    });
  });

  it('classifies non-image base64 data URLs separately', () => {
    const textBytes = Buffer.from('hello');
    expect(classifyItemImage(`data:text/plain;base64,${textBytes.toString('base64')}`))
      .toEqual({
        kind: 'base64-non-image',
        estimatedBytes: 5,
        mimeType: 'text/plain',
        reason: 'database-inline-non-image',
      });
  });

  it('classifies malformed and unknown string values', () => {
    expect(classifyItemImage('data:image/png;base64,not valid base64!')).toMatchObject({
      kind: 'invalid-base64',
      estimatedBytes: 0,
      mimeType: 'image/png',
    });
    expect(classifyItemImage('gambar-tenda-lama')).toEqual({
      kind: 'unknown',
      estimatedBytes: 0,
      mimeType: null,
      reason: 'unrecognized-string',
    });
  });

  it('summarizes image records and returns largest inline images', () => {
    const largeJpeg = Buffer.alloc(12, 1).toString('base64');
    const smallPng = Buffer.alloc(3, 1).toString('base64');
    const summary = summarizeItemImages([
      {
        id: 'item-1',
        name: 'Tenda Besar',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        image: `data:image/jpeg;base64,${largeJpeg}`,
      },
      {
        id: 'item-2',
        name: 'Kompor',
        tenantId: 'tenant-1',
        branchId: null,
        image: `data:image/png;base64,${smallPng}`,
      },
      {
        id: 'item-3',
        name: 'Matras',
        tenantId: 'tenant-2',
        branchId: 'branch-2',
        image: 'https://example.test/matras.jpg',
      },
      {
        id: 'item-4',
        name: 'Carrier',
        tenantId: 'tenant-2',
        branchId: 'branch-2',
        image: '',
      },
    ], { largestLimit: 1 });

    expect(summary).toEqual({
      totalItems: 4,
      counts: {
        empty: 1,
        'remote-url': 1,
        'storage-path': 0,
        'base64-image': 2,
        'base64-non-image': 0,
        'invalid-base64': 0,
        unknown: 0,
      },
      inlineImageBytes: 15,
      inlineNonImageBytes: 0,
      largestInlineImages: [{
        id: 'item-1',
        name: 'Tenda Besar',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        estimatedBytes: 12,
        mimeType: 'image/jpeg',
      }],
    });
  });
});
