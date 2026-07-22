import { gzipSync } from 'node:zlib';

const JSON_COMPRESSION_THRESHOLD_BYTES = 1024;

function acceptsGzip(res) {
  const acceptedEncodings = String(res.__aviaAcceptEncoding || '').toLowerCase();
  return /(?:^|,)\s*gzip(?:\s*;|,|$)/.test(acceptedEncodings);
}

export function sendJson(res, statusCode, body) {
  if (statusCode === 204 || statusCode === 304) {
    res.__aviaResponseBytes = 0;
    res.writeHead(statusCode, { 'Cache-Control': 'no-store' });
    res.end();
    return;
  }

  const payload = JSON.stringify(body);
  const rawBytes = Buffer.byteLength(payload);
  const shouldCompress = rawBytes >= JSON_COMPRESSION_THRESHOLD_BYTES && acceptsGzip(res);
  const responseBody = shouldCompress ? gzipSync(payload) : payload;
  const responseBytes = Buffer.byteLength(responseBody);
  const startedAt = Number(res.__aviaRequestStartedAt || 0);
  const durationMs = startedAt > 0 ? Math.max(0, Date.now() - startedAt) : 0;

  res.__aviaResponseBytes = responseBytes;
  res.__aviaResponseUncompressedBytes = rawBytes;
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': String(responseBytes),
    ...(shouldCompress ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}),
    ...(startedAt > 0 ? { 'Server-Timing': `app;dur=${durationMs}` } : {}),
  });

  res.end(responseBody);
}

export function parsePath(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  return {
    pathname: url.pathname,
    searchParams: url.searchParams,
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function readJsonBody(req, {
  limitBytes = 1_048_576,
  timeoutMs = 10_000,
} = {}) {
  const chunks = [];
  let size = 0;
  let timeoutId;

  const read = (async () => {
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > limitBytes) {
        throw httpError(413, 'Request body too large');
      }
      chunks.push(buffer);
    }

    if (chunks.length === 0) {
      return {};
    }

    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) {
      return {};
    }

    try {
      return JSON.parse(raw);
    } catch {
      throw httpError(400, 'Invalid JSON body');
    }
  })();

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(httpError(408, 'Request body timeout'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([read, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}
