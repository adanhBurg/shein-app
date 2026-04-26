export async function scanSheinCartLink(link) {
  const response = await fetch('/api/shein-cart-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: link }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || 'Unable to read the SHEIN cart link.');
  }

  return payload;
}
