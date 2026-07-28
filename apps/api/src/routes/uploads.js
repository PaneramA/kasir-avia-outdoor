import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const ITEM_IMAGE_UPLOAD_PREFIX = '/uploads/item-images/';

function sendUploadNotFound(res) {
  res.writeHead(404, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end('Not found');
}

function getSafeUploadFilePath(storageDir, pathname) {
  if (!pathname.startsWith(ITEM_IMAGE_UPLOAD_PREFIX)) {
    return '';
  }

  let relativePath = '';
  try {
    relativePath = decodeURIComponent(pathname.slice(ITEM_IMAGE_UPLOAD_PREFIX.length));
  } catch {
    return '';
  }

  const segments = relativePath
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);

  if (
    segments.length === 0
    || segments.some((segment) => segment === '..' || segment.includes('\0'))
    || !segments.at(-1)?.endsWith('.webp')
  ) {
    return '';
  }

  const root = resolve(storageDir);
  const target = resolve(root, ...segments);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    return '';
  }

  return target;
}

export async function uploadRoute(req, res, env) {
  const pathname = String(req.url || '/').split('?')[0];
  if (!pathname.startsWith(ITEM_IMAGE_UPLOAD_PREFIX)) {
    return false;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, {
      'Allow': 'GET, HEAD',
      'Cache-Control': 'no-store',
    });
    res.end();
    return true;
  }

  const filePath = getSafeUploadFilePath(env.itemImageStorageDir || 'uploads/item-images', pathname);
  if (!filePath) {
    sendUploadNotFound(res);
    return true;
  }

  try {
    const fileBuffer = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(fileBuffer.byteLength),
    });
    res.end(req.method === 'HEAD' ? '' : fileBuffer);
  } catch {
    sendUploadNotFound(res);
  }

  return true;
}
