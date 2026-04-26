import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { scanSheinCartUrl } from './sheinCartScanner.mjs';

const PORT = Number(process.env.PORT || 8787);
const MAX_BODY_BYTES = 20_000;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://localhost:3000',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('Request body too large.'));
        request.destroy();
      }
    });

    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

export function createSheinScannerServer() {
  return http.createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      sendJson(response, 204, {});
      return;
    }

    if (request.method === 'GET' && request.url === '/health') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method !== 'POST' || request.url !== '/api/shein-cart-preview') {
      sendJson(response, 404, { ok: false, error: 'Not found.' });
      return;
    }

    try {
      const body = JSON.parse(await readBody(request) || '{}');
      const result = await scanSheinCartUrl(body.url);
      sendJson(response, result.ok ? 200 : 422, result);
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        error: error?.message || String(error),
      });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createSheinScannerServer().listen(PORT, () => {
    console.log(`SHEIN scanner backend listening on http://localhost:${PORT}`);
  });
}
