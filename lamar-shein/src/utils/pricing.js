// Pricing platforms and formulas
export const PLATFORMS = [
  { key: 'shein',           label: 'SHEIN',         formula: (c) => c + c * 0.15 },
  { key: 'sheinPlus',       label: 'SHEIN+',         formula: (c) => (c + c * 0.20) * 1.15 },
  { key: 'marketplace',     label: 'Marketplace',    formula: (c) => c + c * 0.20 },
  { key: 'marketplacePlus', label: 'Marketplace+',   formula: (c) => c * 1.20 * 1.20 },
];

export function parsePrice(str) {
  if (!str) return null;
  const s = str.replace(/\s/g, '').replace(/\+$/, '');
  const parts = s.split('+').map(Number);
  if (parts.some(isNaN) || parts.length === 0) return null;
  const sum = parts.reduce((a, b) => a + b, 0);
  return sum > 0 ? sum : null;
}

export function calcPrice(platformKey, priceStr) {
  const cost = parsePrice(priceStr);
  if (cost === null) return null;
  const p = PLATFORMS.find(p => p.key === platformKey);
  return p ? p.formula(cost) : null;
}

export function calcTotal(pricingItems = []) {
  return PLATFORMS.reduce((sum, p) => {
    const item = pricingItems.find(it => it.platform === p.key);
    return sum + (calcPrice(p.key, item?.price) || 0);
  }, 0);
}

export function defaultPricingItems() {
  return PLATFORMS.map(p => ({ platform: p.key, price: '' }));
}

// Normalize phone for WhatsApp (Moroccan format)
export function normalizePhone(phone) {
  let p = phone.replace(/[\s\-().+]/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('06') || p.startsWith('07')) p = '212' + p.slice(1);
  return p;
}
