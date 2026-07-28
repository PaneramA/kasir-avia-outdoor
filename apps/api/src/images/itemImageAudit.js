const IMAGE_KIND_KEYS = [
  'empty',
  'remote-url',
  'storage-path',
  'base64-image',
  'base64-non-image',
  'invalid-base64',
  'unknown',
];

const MIME_BY_EXTENSION = new Map([
  ['.webp', 'image/webp'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.gif', 'image/gif'],
  ['.avif', 'image/avif'],
]);

function createClassification(kind, {
  estimatedBytes = 0,
  mimeType = null,
  reason,
} = {}) {
  return {
    kind,
    estimatedBytes,
    mimeType,
    reason,
  };
}

function isRemoteUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function inferMimeFromPath(value) {
  const normalized = String(value || '').trim().toLowerCase();
  for (const [extension, mimeType] of MIME_BY_EXTENSION.entries()) {
    if (normalized.endsWith(extension)) {
      return mimeType;
    }
  }

  return null;
}

function isStoragePath(value) {
  const normalized = String(value || '').trim();
  return normalized.startsWith('/uploads/')
    || normalized.startsWith('uploads/')
    || normalized.startsWith('/item-images/')
    || normalized.startsWith('item-images/');
}

function decodeBase64(value) {
  const normalized = String(value || '').replace(/\s+/g, '');
  if (!normalized || normalized.length % 4 === 1 || /[^A-Za-z0-9+/=]/.test(normalized)) {
    return null;
  }

  try {
    const buffer = Buffer.from(normalized, 'base64');
    if (buffer.length === 0) {
      return null;
    }

    return buffer;
  } catch {
    return null;
  }
}

export function classifyItemImage(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return createClassification('empty', { reason: 'empty' });
  }

  const dataUrlMatch = rawValue.match(/^data:([^;,]+);base64,(.+)$/is);
  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1].trim().toLowerCase();
    const decoded = decodeBase64(dataUrlMatch[2]);
    if (!decoded) {
      return createClassification('invalid-base64', {
        mimeType,
        reason: 'invalid-data-url-base64',
      });
    }

    if (mimeType.startsWith('image/')) {
      return createClassification('base64-image', {
        estimatedBytes: decoded.length,
        mimeType,
        reason: 'database-inline-image',
      });
    }

    return createClassification('base64-non-image', {
      estimatedBytes: decoded.length,
      mimeType,
      reason: 'database-inline-non-image',
    });
  }

  if (isRemoteUrl(rawValue)) {
    return createClassification('remote-url', { reason: 'url-reference' });
  }

  if (isStoragePath(rawValue)) {
    return createClassification('storage-path', {
      mimeType: inferMimeFromPath(rawValue),
      reason: 'storage-reference',
    });
  }

  return createClassification('unknown', { reason: 'unrecognized-string' });
}

export function summarizeItemImages(items = [], { largestLimit = 20 } = {}) {
  const counts = Object.fromEntries(IMAGE_KIND_KEYS.map((key) => [key, 0]));
  const largestInlineImages = [];
  let inlineImageBytes = 0;
  let inlineNonImageBytes = 0;

  for (const item of Array.isArray(items) ? items : []) {
    const classification = classifyItemImage(item?.image);
    counts[classification.kind] += 1;

    if (classification.kind === 'base64-image') {
      inlineImageBytes += classification.estimatedBytes;
      largestInlineImages.push({
        id: item.id,
        name: item.name,
        tenantId: item.tenantId,
        branchId: item.branchId ?? null,
        estimatedBytes: classification.estimatedBytes,
        mimeType: classification.mimeType,
      });
    } else if (classification.kind === 'base64-non-image') {
      inlineNonImageBytes += classification.estimatedBytes;
    }
  }

  largestInlineImages.sort((left, right) => right.estimatedBytes - left.estimatedBytes);

  return {
    totalItems: Array.isArray(items) ? items.length : 0,
    counts,
    inlineImageBytes,
    inlineNonImageBytes,
    largestInlineImages: largestInlineImages.slice(0, Math.max(0, largestLimit)),
  };
}
