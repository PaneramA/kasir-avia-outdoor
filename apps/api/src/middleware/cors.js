import { sendJson } from '../utils/http.js';

function parseAllowedOrigins(rawAllowedOrigin) {
  return String(rawAllowedOrigin || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin) {
    return false;
  }

  return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}

export function withCors(req, res, allowedOrigin) {
  const allowedOrigins = parseAllowedOrigins(allowedOrigin);
  const requestOrigin = req.headers.origin;

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (!requestOrigin) {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return true;
    }
    return false;
  }

  if (!isAllowedOrigin(requestOrigin, allowedOrigins)) {
    if (req.method === 'OPTIONS') {
      sendJson(res, 403, {
        ok: false,
        message: 'CORS origin is not allowed',
      });
      return true;
    }

    return false;
  }

  if (allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
  }

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }

  return false;
}
