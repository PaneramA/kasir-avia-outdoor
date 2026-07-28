import sharp from 'sharp';

const DEFAULT_DETAIL_MAX_WIDTH = 800;
const DEFAULT_THUMBNAIL_MAX_WIDTH = 320;
const DEFAULT_WEBP_QUALITY = 60;
const DEFAULT_MAX_INPUT_PIXELS = 40_000_000;

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}

async function createWebpVariant(inputBuffer, {
  maxWidth,
  quality,
  maxInputPixels,
}) {
  const buffer = await sharp(inputBuffer, {
    limitInputPixels: maxInputPixels,
  })
    .rotate()
    .resize({
      width: maxWidth,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality,
      effort: 4,
    })
    .toBuffer();

  const metadata = await sharp(buffer).metadata();
  return {
    buffer,
    width: metadata.width || null,
    height: metadata.height || null,
  };
}

export async function processItemImage(inputBuffer, options = {}) {
  if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
    throw new Error('Invalid image file');
  }

  const detailMaxWidth = normalizePositiveInteger(
    options.detailMaxWidth,
    DEFAULT_DETAIL_MAX_WIDTH,
  );
  const thumbnailMaxWidth = normalizePositiveInteger(
    options.thumbnailMaxWidth,
    DEFAULT_THUMBNAIL_MAX_WIDTH,
  );
  const quality = Math.min(
    100,
    normalizePositiveInteger(options.quality, DEFAULT_WEBP_QUALITY),
  );
  const maxInputPixels = normalizePositiveInteger(
    options.maxInputPixels,
    DEFAULT_MAX_INPUT_PIXELS,
  );

  try {
    await sharp(inputBuffer, {
      limitInputPixels: maxInputPixels,
    }).metadata();

    const [detail, thumbnail] = await Promise.all([
      createWebpVariant(inputBuffer, {
        maxWidth: detailMaxWidth,
        quality,
        maxInputPixels,
      }),
      createWebpVariant(inputBuffer, {
        maxWidth: thumbnailMaxWidth,
        quality,
        maxInputPixels,
      }),
    ]);

    return {
      detailBuffer: detail.buffer,
      thumbnailBuffer: thumbnail.buffer,
      metadata: {
        mimeType: 'image/webp',
        originalBytes: inputBuffer.length,
        detail: {
          width: detail.width,
          height: detail.height,
          bytes: detail.buffer.length,
        },
        thumbnail: {
          width: thumbnail.width,
          height: thumbnail.height,
          bytes: thumbnail.buffer.length,
        },
      },
    };
  } catch {
    throw new Error('Invalid image file');
  }
}
