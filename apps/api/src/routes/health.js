import { sendJson } from '../utils/http.js';

export function healthRoute(req, res) {
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'avia-api',
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  return false;
}