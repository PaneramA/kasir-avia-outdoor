import { classifyItemImage } from './itemImageAudit.js';
import { processItemImage as defaultProcessImage } from './itemImageProcessor.js';
import { saveItemImageSet as defaultSaveImageSet } from './itemImageStorage.js';

function toPositiveLimit(value, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function decodeDataUrlImage(value) {
  const match = String(value || '').trim().match(/^data:([^;,]+);base64,(.+)$/is);
  if (!match) {
    return null;
  }

  const mimeType = match[1].trim().toLowerCase();
  if (!mimeType.startsWith('image/')) {
    return null;
  }

  try {
    const buffer = Buffer.from(String(match[2] || '').replace(/\s+/g, ''), 'base64');
    if (buffer.byteLength === 0) {
      return null;
    }

    return { buffer, mimeType };
  } catch {
    return null;
  }
}

export function selectItemImageBackfillCandidates(items = [], {
  tenantId = '',
  limit = 50,
} = {}) {
  const normalizedTenantId = String(tenantId || '').trim();
  const safeLimit = toPositiveLimit(limit);
  const candidates = [];

  for (const item of Array.isArray(items) ? items : []) {
    if (normalizedTenantId && item?.tenantId !== normalizedTenantId) {
      continue;
    }

    if (classifyItemImage(item?.image).kind !== 'base64-image') {
      continue;
    }

    candidates.push(item);
    if (candidates.length >= safeLimit) {
      break;
    }
  }

  return candidates;
}

export async function backfillItemImages({
  database,
  apply = false,
  tenantId = '',
  limit = 50,
  storageDir,
  publicBaseUrl,
  processImage = defaultProcessImage,
  saveImageSet = defaultSaveImageSet,
} = {}) {
  if (!database?.item?.findMany) {
    throw new Error('Database client is required');
  }

  const normalizedTenantId = String(tenantId || '').trim();
  const safeLimit = toPositiveLimit(limit);
  const items = await database.item.findMany({
    select: {
      id: true,
      name: true,
      tenantId: true,
      branchId: true,
      image: true,
    },
    where: {
      image: { startsWith: 'data:image/' },
      ...(normalizedTenantId ? { tenantId: normalizedTenantId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: safeLimit,
  });
  const candidates = selectItemImageBackfillCandidates(items, {
    tenantId: normalizedTenantId,
    limit: safeLimit,
  });

  const result = {
    ok: true,
    mode: apply ? 'apply' : 'dry-run',
    scanned: Array.isArray(items) ? items.length : 0,
    candidates: candidates.length,
    converted: 0,
    failures: [],
    items: candidates.map((item) => ({
      id: item.id,
      name: item.name,
      tenantId: item.tenantId,
      branchId: item.branchId ?? null,
      estimatedBytes: classifyItemImage(item.image).estimatedBytes,
    })),
  };

  if (!apply) {
    return result;
  }

  for (const item of candidates) {
    try {
      const decoded = decodeDataUrlImage(item.image);
      if (!decoded) {
        throw new Error('Invalid image data URL');
      }

      const processed = await processImage(decoded.buffer);
      const savedImage = await saveImageSet({
        storageDir,
        publicBaseUrl,
        tenantId: item.tenantId,
        itemId: item.id,
        detailBuffer: processed.detailBuffer,
        thumbnailBuffer: processed.thumbnailBuffer,
      });

      await database.item.update({
        where: { id: item.id },
        data: { image: savedImage.thumbnail.url },
      });
      result.converted += 1;
    } catch (error) {
      result.failures.push({
        id: item.id,
        message: toErrorMessage(error),
      });
    }
  }

  result.ok = result.failures.length === 0;
  return result;
}
