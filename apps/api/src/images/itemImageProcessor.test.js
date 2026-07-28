import { describe, expect, it } from 'vitest';
import { processItemImage } from './itemImageProcessor.js';

function expectWebpBuffer(buffer) {
  expect(Buffer.isBuffer(buffer)).toBe(true);
  expect(buffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
  expect(buffer.subarray(8, 12).toString('ascii')).toBe('WEBP');
}

describe('item image processor', () => {
  it('converts an uploaded image to lightweight WebP detail and thumbnail variants', async () => {
    const input = Buffer.from(`
      <svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
        <rect width="1200" height="900" fill="#f97316" />
        <circle cx="600" cy="450" r="260" fill="#0f766e" />
      </svg>
    `);

    const result = await processItemImage(input, {
      detailMaxWidth: 800,
      thumbnailMaxWidth: 320,
      quality: 55,
      maxInputPixels: 2_000_000,
    });

    expectWebpBuffer(result.detailBuffer);
    expectWebpBuffer(result.thumbnailBuffer);
    expect(result.metadata).toMatchObject({
      mimeType: 'image/webp',
      originalBytes: input.length,
      detail: { width: 800, height: 600 },
      thumbnail: { width: 320, height: 240 },
    });
    expect(result.metadata.detail.bytes).toBe(result.detailBuffer.length);
    expect(result.metadata.thumbnail.bytes).toBe(result.thumbnailBuffer.length);
  });

  it('does not upscale small images', async () => {
    const input = Buffer.from(`
      <svg width="120" height="80" xmlns="http://www.w3.org/2000/svg">
        <rect width="120" height="80" fill="#146c43" />
      </svg>
    `);

    const result = await processItemImage(input, {
      detailMaxWidth: 800,
      thumbnailMaxWidth: 320,
      quality: 55,
    });

    expect(result.metadata.detail).toMatchObject({ width: 120, height: 80 });
    expect(result.metadata.thumbnail).toMatchObject({ width: 120, height: 80 });
  });

  it('rejects invalid image data with a stable message', async () => {
    await expect(processItemImage(Buffer.from('not an image')))
      .rejects.toThrow('Invalid image file');
  });
});
