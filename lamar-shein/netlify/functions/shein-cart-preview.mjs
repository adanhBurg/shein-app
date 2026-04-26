import { scanSheinCartUrl } from '../../server/sheinCartScanner.mjs';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed.' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const result = await scanSheinCartUrl(body.url);
    return json(result.ok ? 200 : 422, result);
  } catch (error) {
    return json(400, {
      ok: false,
      error: error?.message || String(error),
    });
  }
}
