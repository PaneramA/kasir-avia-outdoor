import { sendJson } from '../utils/http.js';

export function withCors(req, res, allowedOrigin) {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }

  return false;
}