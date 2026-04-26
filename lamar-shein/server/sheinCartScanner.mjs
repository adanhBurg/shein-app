import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const DEVICE_NAME = 'iPhone 13';
const MAX_ITEMS = 20;
const DEFAULT_PROFILE_ROOT = process.env.SHEIN_PROFILE_ROOT || path.resolve('.cache/shein-playwright');
const DEFAULT_CACHE_DIR = process.env.SHEIN_SCAN_CACHE_DIR || path.join(DEFAULT_PROFILE_ROOT, 'cache');
const CACHE_TTL_MS = Number(process.env.SHEIN_SCAN_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const MIN_SCAN_INTERVAL_MS = Number(process.env.SHEIN_MIN_SCAN_INTERVAL_MS || 15_000);
const profileLocks = new Map();
const lastScanByKey = new Map();

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    return { country, locale: 'es-ES', timezoneId: 'Europe/Madrid' };
  }

  if (country === 'MA') {
    return { country, locale: 'fr-MA', timezoneId: 'Africa/Casablanca' };
  }

  return { country: country || 'GLOBAL', locale: 'en-US', timezoneId: 'UTC' };
}

function cacheKeyFromUrl(value) {
  const url = new URL(value);
  const relevant = new URL('https://shein-cache-key.local/');

  for (const key of ['link', 'shc', 'group_id', 'localcountry', 'local_country', 'url_from', 'cart_share']) {
    const current = url.searchParams.get(key);
    if (current) relevant.searchParams.set(key, current);
  }

  if ([...relevant.searchParams.keys()].length === 0) {
    relevant.searchParams.set('url', url.toString());
  }

  return crypto.createHash('sha256').update(relevant.toString()).digest('hex');
}

async function readCachedResult(key) {
  if (!CACHE_TTL_MS || CACHE_TTL_MS < 1) return null;

  try {
    const file = path.join(DEFAULT_CACHE_DIR, `${key}.json`);
    const cached = JSON.parse(await readFile(file, 'utf8'));
    const age = Date.now() - Date.parse(cached.cachedAt || '');

    if (Number.isFinite(age) && age >= 0 && age <= CACHE_TTL_MS && cached.result?.ok) {
      return { ...cached.result, cached: true, cachedAt: cached.cachedAt };
    }
  } catch {
    // Missing or invalid cache entries are treated as a normal cache miss.
  }

  return null;
}

async function writeCachedResult(key, result) {
  if (!result?.ok || !CACHE_TTL_MS || CACHE_TTL_MS < 1) return;

  await mkdir(DEFAULT_CACHE_DIR, { recursive: true });
  await writeFile(
    path.join(DEFAULT_CACHE_DIR, `${key}.json`),
    JSON.stringify({ cachedAt: new Date().toISOString(), result }, null, 2),
  );
}

async function throttleScan(key) {
  if (!MIN_SCAN_INTERVAL_MS || MIN_SCAN_INTERVAL_MS < 1) return;

  const lastScan = lastScanByKey.get(key) || 0;
  const waitMs = MIN_SCAN_INTERVAL_MS - (Date.now() - lastScan);

  if (waitMs > 0) {
    await sleep(waitMs);
  }

  lastScanByKey.set(key, Date.now());
}

async function withProfileLock(profileKey, task) {
  const previous = profileLocks.get(profileKey) || Promise.resolve();
  let release;
  const next = new Promise((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => next);

  profileLocks.set(profileKey, chained);

  await previous;

  try {
    return await task();
  } finally {
    release();
    if (profileLocks.get(profileKey) === chained) {
      profileLocks.delete(profileKey);
    }
  }
}

function profileDirForRegion(region) {
  const country = String(region.country || 'GLOBAL').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return path.join(DEFAULT_PROFILE_ROOT, `shein-${country || 'global'}-profile`);
}

async function waitForDebugEndpoint(port) {
  const deadline = Date.now() + 20_000;
  const url = `http://127.0.0.1:${port}/json/list`;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // Chromium is still starting.
    }
    await sleep(500);
  }

  return false;
}

function createTcpBridge({ listenPort, targetPort }) {
  const server = net.createServer((client) => {
    const upstream = net.connect(targetPort, '127.0.0.1');

    client.pipe(upstream);
    upstream.pipe(client);

    const close = () => {
      client.destroy();
      upstream.destroy();
    };

    client.on('error', close);
    upstream.on('error', close);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, '0.0.0.0', () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

async function openDirectDebugSession(targetUrl, region, options = {}) {
  const device = devices[DEVICE_NAME];
  const profileDir = profileDirForRegion(region);
  const externalPort = Number(options.remoteDebuggingPort);
  const chromeDebugPort = externalPort + 1;
  await mkdir(profileDir, { recursive: true });

  const executablePath = chromium.executablePath();
  const viewport = device.viewport || { width: 390, height: 844 };
  const args = [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${chromeDebugPort}`,
    `--user-agent=${device.userAgent}`,
    `--window-size=${viewport.width},${viewport.height}`,
    '--force-device-scale-factor=3',
    `--lang=${region.locale}`,
  ];

  if (options.headless) {
    args.push('--headless=new');
    args.push('--hide-scrollbars');
    args.push('--mute-audio');
  }

  args.push(targetUrl);

  const child = spawn(executablePath, args, {
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  child.on('exit', (code, signal) => {
    if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') {
      console.error(`Chromium debug session exited with code ${code ?? 'null'} signal ${signal ?? 'null'}.`);
    }
  });

  const bridge = await createTcpBridge({
    listenPort: externalPort,
    targetPort: chromeDebugPort,
  });
  const ready = await waitForDebugEndpoint(externalPort);

  console.log(`SHEIN ${region.country} debug session is ${ready ? 'ready' : 'starting slowly'}.`);
  console.log(`Profile: ${profileDir}`);
  console.log(`URL: ${targetUrl}`);
  console.log(`DevTools bridge: 0.0.0.0:${externalPort} -> 127.0.0.1:${chromeDebugPort}`);
  console.log(`DevTools list: http://127.0.0.1:${externalPort}/json/list`);
  console.log('Leave this process running while you solve verification. Press Ctrl+C when done.');

  await new Promise((resolve) => {
    const stop = () => {
      bridge.close();
      child.kill('SIGTERM');
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    child.once('exit', () => {
      bridge.close();
      resolve();
    });
  });
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

async function detectChallenge(page) {
  const details = await page.evaluate(() => {
    const text = document.body?.innerText || '';
    return {
      title: document.title || '',
      text: text.slice(0, 4000),
      url: location.href,
    };
  }).catch(() => ({ title: '', text: '', url: page.url() }));

  const haystack = `${details.title} ${details.text} ${details.url}`.toLowerCase();
  const challenged = /captcha|robot|verify|verification|unusual traffic|blocked|access denied|challenge|slider|puzzle/.test(haystack);

  return challenged ? details : null;
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

async function createSheinContext(targetUrl, options = {}) {
  const device = devices[DEVICE_NAME];
  const region = browserRegionFromUrl(targetUrl);
  const args = [
    '--no-sandbox',
    '--disable-blink-features=AutomationControlled',
  ];

  if (options.remoteDebuggingPort) {
    args.push('--remote-debugging-address=0.0.0.0');
    args.push(`--remote-debugging-port=${options.remoteDebuggingPort}`);
  }

  const context = await chromium.launchPersistentContext(profileDirForRegion(region), {
    ...device,
    headless: options.headless ?? true,
    channel: 'chromium',
    locale: region.locale,
    timezoneId: region.timezoneId,
    args,
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return { context, region };
}

export async function scanSheinCart(targetUrl) {
  const region = browserRegionFromUrl(targetUrl);

  return withProfileLock(region.country, async () => {
    const { context } = await createSheinContext(targetUrl, { headless: true });

    try {
    const page = await context.newPage();
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

    const challenge = await detectChallenge(page);
    if (challenge) {
      return {
        ok: false,
        status: 'needs_session_refresh',
        finalUrl: page.url(),
        scannedAt: new Date().toISOString(),
        items: [],
        error: 'SHEIN showed a verification or CAPTCHA page. Refresh the persistent SHEIN session, then retry.',
        challenge,
      };
    }

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
    await context.close();
  }
  });
}

export async function scanSheinCartUrl(url) {
  const targetUrl = normalizeShareJumpUrl(validateSheinUrl(url));
  const cacheKey = cacheKeyFromUrl(targetUrl);
  const cached = await readCachedResult(cacheKey);

  if (cached) return cached;

  await throttleScan(cacheKey);
  const result = await scanSheinCart(targetUrl);

  if (!result.ok) {
    return {
      ...result,
      error: result.error || 'The link opened, but no shared cart product could be read.',
    };
  }

  await writeCachedResult(cacheKey, result);
  return result;
}

export async function openSheinSession(options = {}) {
  const country = String(options.country || 'ES').toUpperCase();
  const countryPath = country.toLowerCase();
  const targetUrl = options.url || `https://m.shein.com/${countryPath}/`;
  const normalizedUrl = normalizeShareJumpUrl(validateSheinUrl(targetUrl));
  const region = browserRegionFromUrl(normalizedUrl);

  if (options.remoteDebuggingPort) {
    await openDirectDebugSession(normalizedUrl, region, options);
    return;
  }

  const { context, region: contextRegion } = await createSheinContext(normalizedUrl, {
    headless: Boolean(options.headless),
  });

  const page = await context.newPage();
  await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

  console.log(`SHEIN ${contextRegion.country} session is open.`);
  console.log(`Profile: ${profileDirForRegion(contextRegion)}`);
  console.log(`URL: ${page.url()}`);
  if (options.remoteDebuggingPort) {
    console.log(`Remote debugging: http://127.0.0.1:${options.remoteDebuggingPort}`);
  }
  console.log('Leave this process running while you solve verification. Press Ctrl+C when done.');

  await new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });

  await context.close();
}
