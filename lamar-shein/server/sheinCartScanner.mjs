import { chromium, devices } from 'playwright';

const DEVICE_NAME = 'iPhone 13';
const MAX_ITEMS = 20;

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function validateSheinUrl(value) {
  const url = new URL(String(value || '').trim());

  if (url.protocol !== 'https:') {
    throw new Error('Only HTTPS SHEIN links are supported.');
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname !== 'shein.com' && !hostname.endsWith('.shein.com')) {
    throw new Error('Only SHEIN links can be scanned.');
  }

  return url.toString();
}

function normalizeShareJumpUrl(value) {
  const url = new URL(value);
  const isSharedLanding = /\/cart\/share\/landing$/i.test(url.pathname);
  const shc = url.searchParams.get('shc');

  if (!isSharedLanding || !shc) return value;

  const country = (
    url.searchParams.get('local_country')
    || url.searchParams.get('localcountry')
    || url.pathname.split('/').filter(Boolean)[0]
    || ''
  ).toUpperCase();
  const shortCode = shc.includes('_') ? shc.split('_').slice(1).join('_') : shc;
  const appJumpUrl = new URL('https://api-shein.shein.com/h5/sharejump/appjump');

  appJumpUrl.searchParams.set('link', `${shortCode}_b`);
  if (country) appJumpUrl.searchParams.set('localcountry', country);
  appJumpUrl.searchParams.set('shc', shc);
  if (url.searchParams.get('url_from')) {
    appJumpUrl.searchParams.set('url_from', url.searchParams.get('url_from'));
  }

  return appJumpUrl.toString();
}

function browserRegionFromUrl(value) {
  const url = new URL(value);
  const country = (
    url.searchParams.get('localcountry')
    || url.searchParams.get('local_country')
    || url.pathname.split('/').filter(Boolean)[0]
    || ''
  ).toUpperCase();

  if (country === 'ES') {
    return { locale: 'es-ES', timezoneId: 'Europe/Madrid' };
  }

  if (country === 'MA') {
    return { locale: 'fr-MA', timezoneId: 'Africa/Casablanca' };
  }

  return { locale: 'en-US', timezoneId: 'UTC' };
}

function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const match = String(value ?? '').match(/[0-9]+(?:[.,\s][0-9]{3})*(?:[.,][0-9]{1,2})?|[0-9]+/);
  if (!match) return null;

  let numeric = match[0].replace(/\s/g, '');
  const hasComma = numeric.includes(',');
  const hasDot = numeric.includes('.');

  if (hasComma && hasDot) {
    numeric = numeric.replace(/,/g, '');
  } else if (hasComma) {
    const parts = numeric.split(',');
    numeric = parts.at(-1)?.length === 3 ? numeric.replace(/,/g, '') : numeric.replace(',', '.');
  }

  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : null;
}

function detectCurrency(value) {
  const text = normalizeText(value).toUpperCase();
  if (!text) return '';
  if (text.includes('€') || /\bEUR\b/.test(text)) return 'EUR';
  if (/MAD|DHS?|د\.?م/.test(text)) return 'MAD';
  if (text.includes('$') || /\bUSD\b/.test(text)) return 'USD';
  return '';
}

function moneyFromValue(value) {
  const price = parseMoney(value);
  if (price === null || price <= 0) return null;
  return {
    price,
    priceText: typeof value === 'string' ? normalizeText(value) : '',
    currency: detectCurrency(value),
  };
}

function moneyFromObject(value) {
  if (!value || typeof value !== 'object') return null;

  for (const key of ['salePrice', 'retailPrice', 'price', 'unitPrice']) {
    const nested = value[key];
    if (nested && typeof nested === 'object') {
      const money = moneyFromValue(nested.amountWithSymbol ?? nested.priceShowStyle ?? nested.amount);
      if (money) return money;
    }
  }

  for (const key of ['amountWithSymbol', 'amount', 'priceShowStyle']) {
    const money = moneyFromValue(value[key]);
    if (money) return money;
  }

  return null;
}

function detectItemPlatform(value) {
  const imageUrl = `${value?.goods_img || ''} ${value?.goodsImgInfo?.originUrl || ''} ${value?.goodsImgInfo?.url || ''}`.toLowerCase();
  if (imageUrl.includes('/spmp/')) return 'marketplace';

  let isMarketplace = false;

  const visit = (item) => {
    if (isMarketplace || !item || typeof item !== 'object') return;
    for (const [rawKey, rawValue] of Object.entries(item)) {
      const key = rawKey.toLowerCase();
      const value = typeof rawValue === 'string' ? rawValue.toLowerCase() : rawValue;

      if (/market\s*place|marketplace|third[\s_-]*party|local[\s_-]*seller/.test(`${key} ${value ?? ''}`)) {
        isMarketplace = true;
        return;
      }

      if (/^(ismarketplace|is_marketplace|marketplaceflag|marketplace_flag)$/.test(key) && value) {
        isMarketplace = true;
        return;
      }

      if (rawValue && typeof rawValue === 'object') visit(rawValue);
    }
  };

  visit(value);
  return isMarketplace ? 'marketplace' : 'shein';
}

function findObjects(value, matcher, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item) => findObjects(item, matcher, seen));
  }

  const matches = matcher(value) ? [value] : [];
  return matches.concat(Object.values(value).flatMap((item) => findObjects(item, matcher, seen)));
}

function extractItemsFromJson(payloads) {
  const items = [];

  for (const payload of payloads) {
    const matches = findObjects(payload.json, (item) => (
      typeof item.goods_name === 'string'
      && (item.goodsAttr || item.salePrice || item.retailPrice || item.priceData)
    ));

    for (const item of matches) {
      const money = moneyFromObject(item) ?? moneyFromObject(item.priceData?.unitPrice?.price);
      if (!money) continue;

      items.push({
        sourceUrl: payload.url,
        name: normalizeText(item.goods_name),
        price: money.price,
        priceText: money.priceText,
        currency: money.currency,
        platform: detectItemPlatform(item),
        choices: [normalizeText(item.goodsAttr)].filter(Boolean),
      });
    }
  }

  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.name}|${item.price}|${item.choices.join('|')}`;
    if (!item.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_ITEMS);
}

async function clickPossibleConsent(page) {
  for (const label of ['Accept', 'Agree', 'Allow', 'OK', 'Got it', 'I agree']) {
    try {
      const button = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
      if (await button.isVisible({ timeout: 500 })) {
        await button.click({ timeout: 1500 });
        return;
      }
    } catch {
      // Keep checking the next label.
    }
  }
}

async function extractDomItems(page) {
  const cartItems = await page.evaluate(() => {
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    return Array.from(document.querySelectorAll('.bsc-cart-item-goods-title__content, .bsc-cart-item-share__title'))
      .map((titleNode) => {
        const root = titleNode.closest('.bsc-cart-item, .bsc-cart-item-share, [class*="cart-item"]') || titleNode.parentElement;
        const read = (selector) => clean(root?.querySelector(selector)?.textContent);
        return {
          name: clean(titleNode.textContent),
          choices: [
            read('.bsc-cart-item-goods-sale-attr__text'),
            read('.bsc-cart-item-goods-sale-attr'),
          ].filter(Boolean),
          priceText: read('.bsc-cart-item-goods-price__sale-price')
            || read('.bsc-cart-item-goods-price__main')
            || read('.bsc-cart-item-goods-price')
            || read('[class*="price"]'),
          platform: /market\s*place|marketplace/i.test(clean(root?.textContent)) ? 'marketplace' : 'shein',
        };
      })
      .filter((item, index, list) => item.name && list.findIndex((candidate) => candidate.name === item.name) === index);
  });

  return cartItems
    .map((item) => ({
      name: item.name,
      price: parseMoney(item.priceText),
      priceText: item.priceText,
      currency: detectCurrency(item.priceText),
      platform: item.platform,
      choices: item.choices,
    }))
    .filter((item) => item.name && item.price !== null)
    .slice(0, MAX_ITEMS);
}

function addDomPlatforms(jsonItems, domItems) {
  if (!jsonItems.length || !domItems.length) return jsonItems;

  return jsonItems.map((item) => {
    if (item.platform === 'marketplace') return item;
    const match = domItems.find((domItem) => (
      domItem.platform === 'marketplace'
      && (item.name === domItem.name || item.name.includes(domItem.name) || domItem.name.includes(item.name))
    ));
    return match ? { ...item, platform: 'marketplace' } : item;
  });
}

export async function scanSheinCart(targetUrl) {
  const device = devices[DEVICE_NAME];
  const region = browserRegionFromUrl(targetUrl);
  const browser = await chromium.launch({
    headless: true,
    channel: 'chromium',
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  try {
    const context = await browser.newContext({
      ...device,
      locale: region.locale,
      timezoneId: region.timezoneId,
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    const jsonPayloads = [];

    page.on('response', async (response) => {
      const contentType = response.headers()['content-type'] ?? '';
      if (!/json/i.test(contentType)) return;

      try {
        const body = await response.json();
        const text = JSON.stringify(body);
        if (/cart|checkout|goods|product|price|DH|MAD|EUR|€/i.test(`${response.url()} ${text}`)) {
          jsonPayloads.push({ url: response.url(), json: body });
        }
      } catch {
        // Ignore JSON-like responses that cannot be parsed.
      }
    });

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await clickPossibleConsent(page);
    await page.waitForTimeout(3000);

    const domItems = await extractDomItems(page);
    const jsonItems = extractItemsFromJson(jsonPayloads);
    const items = jsonItems.length ? addDomPlatforms(jsonItems, domItems) : domItems;

    return {
      ok: items.length > 0,
      finalUrl: page.url(),
      scannedAt: new Date().toISOString(),
      items,
    };
  } finally {
    await browser.close();
  }
}

export async function scanSheinCartUrl(url) {
  const targetUrl = normalizeShareJumpUrl(validateSheinUrl(url));
  const result = await scanSheinCart(targetUrl);

  if (!result.ok) {
    return {
      ...result,
      error: 'The link opened, but no shared cart product could be read.',
    };
  }

  return result;
}
