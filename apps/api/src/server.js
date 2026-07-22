import { createServer } from 'node:http';
import {
  assertSecureProductionConfig,
  getEnv,
  getSecurityWarnings,
} from './config/env.js';
import { applyHttpServerLimits } from './config/httpServer.js';
import { initDatabase } from './data/db.js';
import { withCors } from './middleware/cors.js';
import { attachRequestLogger } from './middleware/logger.js';
import { apiRoute } from './routes/api.js';
import { healthRoute } from './routes/health.js';
import { sendJson } from './utils/http.js';

const env = getEnv();
assertSecureProductionConfig(env);
const shouldLogRequests = env.nodeEnv !== 'production';
const securityWarnings = getSecurityWarnings(env);

await initDatabase(env);

const server = createServer(async (req, res) => {
  attachRequestLogger(req, res, { enabled: shouldLogRequests });

  try {
    if (withCors(req, res, env.corsOrigin)) {
      return;
    }

    if (healthRoute(req, res)) {
      return;
    }

    if (await apiRoute(req, res, env)) {
      return;
    }

    sendJson(res, 404, {
      ok: false,
      message: 'Route not found',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    sendJson(res, 500, {
      ok: false,
      message,
    });
  }
});
applyHttpServerLimits(server, env);

server.listen(env.port, env.host, () => {
  console.log(`[api] listening on http://${env.host}:${env.port}`);
  if (securityWarnings.length > 0) {
    console.warn('[api] Security warnings:');
    for (const warning of securityWarnings) {
      console.warn(`- ${warning}`);
    }
  }
});
