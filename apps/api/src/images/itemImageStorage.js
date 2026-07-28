import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

function sanitizePathSegment(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('-')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'unknown';
}

function joinPublicUrl(baseUrl, storageKey) {
  const normalizedBase = String(baseUrl || '').trim().replace(/\/+$/g, '');
  const normalizedKey = String(storageKey || '').replace(/^\/+/g, '');
  return `${normalizedBase}/${normalizedKey}`;
}

function assertInsideStorageDir(storageDir, filePath) {
  const root = resolve(storageDir);
  const target = resolve(filePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error('Item image path escaped storage directory');
  }
}

export async function saveItemImageSet({
  storageDir,
  publicBaseUrl,
  tenantId,
  itemId,
  detailBuffer,
  thumbnailBuffer,
} = {}) {
  if (!String(storageDir || '').trim()) {
    throw new Error('Item image storage directory is required');
  }
  if (!String(publicBaseUrl || '').trim()) {
    throw new Error('Public uploads base URL is required');
  }
  if (!Buffer.isBuffer(detailBuffer) || !Buffer.isBuffer(thumbnailBuffer)) {
    throw new Error('Item image buffers are required');
  }

  const safeTenantId = sanitizePathSegment(tenantId);
  const safeItemId = sanitizePathSegment(itemId);
  const itemDir = resolve(storageDir, safeTenantId, safeItemId);
  const detailStorageKey = `${safeTenantId}/${safeItemId}/detail.webp`;
  const thumbnailStorageKey = `${safeTenantId}/${safeItemId}/thumb.webp`;
  const detailPath = resolve(storageDir, detailStorageKey);
  const thumbnailPath = resolve(storageDir, thumbnailStorageKey);

  assertInsideStorageDir(storageDir, detailPath);
  assertInsideStorageDir(storageDir, thumbnailPath);

  await mkdir(itemDir, { recursive: true });
  await Promise.all([
    writeFile(detailPath, detailBuffer),
    writeFile(thumbnailPath, thumbnailBuffer),
  ]);

  return {
    detail: {
      storageKey: detailStorageKey,
      url: joinPublicUrl(publicBaseUrl, detailStorageKey),
      bytes: detailBuffer.length,
    },
    thumbnail: {
      storageKey: thumbnailStorageKey,
      url: joinPublicUrl(publicBaseUrl, thumbnailStorageKey),
      bytes: thumbnailBuffer.length,
    },
  };
}
