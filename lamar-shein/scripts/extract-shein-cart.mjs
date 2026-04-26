import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const DEFAULT_DEVICE = 'iPhone 13';
const DEFAULT_EXPECTED_TOTAL = 1123;
const DEFAULT_OUTPUT_DIR = path.resolve('output/shein-cart-extract/latest');

function printUsage() {
  console.log(`
Usage:
  npm run shein:extract -- <url> [--device "Pixel 5"] [--headed] [--expected-total 1123]
  npm run shein:extract -- --url-base64 <base64-url> [--device "Pixel 5"]

Example:
  npm run shein:extract -- "https://api-shein.shein.com/h5/sharejump/appjump?link=..."
`);
}

function parseArgs(argv) {
  const result = {
    device: DEFAULT_DEVICE,
    expectedTotal: DEFAULT_EXPECTED_TOTAL,
    headed: false,
    url: null,
  };

  const args = [...argv];

  while (args.length > 0) {
    const arg = args.shift();

    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }

    if (arg === '--device') {
      result.device = args.shift();
      continue;
    }

    if (arg === '--url-base64') {
      const encodedUrl = args.shift();
      result.url = Buffer.from(encodedUrl ?? '', 'base64').toString('utf8');
      continue;
    }

    if (arg === '--expected-total') {
      result.expectedTotal = Number(args.shift());
      continue;
    }

    if (arg === '--headed') {
      result.headed = true;
      continue;
    }

    if (!result.url) {
      result.url = arg;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  return result;
}

function validateUrl(value) {
  if (!value) {
    throw new Error('Missing URL.');
  }

  const parsed = new URL(value);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https links can be opened.');
  }

  return normalizeShareJumpUrl(parsed.toString());
}

function normalizeShareJumpUrl(value) {
  const parsed = new URL(value);
  const isSharedLanding = /\/cart\/share\/landing$/i.test(parsed.pathname);
  const shc = parsed.searchParams.get('shc');

  if (!isSharedLanding || !shc) return value;

  const country = (
    parsed.searchParams.get('local_country')
    || parsed.searchParams.get('localcountry')
    || parsed.pathname.split('/').filter(Boolean)[0]
    || ''
  ).toUpperCase();
  const shortCode = shc.includes('_') ? shc.split('_').slice(1).join('_') : shc;
  const appJumpUrl = new URL('https://api-shein.shein.com/h5/sharejump/appjump');

  appJumpUrl.searchParams.set('link', `${shortCode}_b`);
  if (country) appJumpUrl.searchParams.set('localcountry', country);
  appJumpUrl.searchParams.set('shc', shc);
  if (parsed.searchParams.get('url_from')) {
    appJumpUrl.searchParams.set('url_from', parsed.searchParams.get('url_from'));
  }

  return appJumpUrl.toString();
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMoney(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value ?? '').trim();

  if (!raw) {
    return null;
  }

  const numberMatch = raw.match(/[0-9]+(?:[.,\s][0-9]{3})*(?:[.,][0-9]{1,2})?|[0-9]+/);

  if (!numberMatch) {
    return null;
  }

  let numeric = numberMatch[0].replace(/\s/g, '');
  const hasComma = numeric.includes(',');
  const hasDot = numeric.includes('.');

  if (hasComma && hasDot) {
    numeric = numeric.replace(/,/g, '');
  } else if (hasComma) {
    const commaParts = numeric.split(',');
    const last = commaParts.at(-1);
    numeric = last && last.length === 3
      ? numeric.replace(/,/g, '')
      : numeric.replace(',', '.');
  }

  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : null;
}

function findPriceTokens(text) {
  const source = normalizeText(text);
  const tokens = [];
  const patterns = [
    /(?:MAD|DH|د\.?م\.?)\s*([0-9]+(?:[.,\s][0-9]{3})*(?:[.,][0-9]{1,2})?)/gi,
    /([0-9]+(?:[.,\s][0-9]{3})*(?:[.,][0-9]{1,2})?)\s*(?:MAD|DH|د\.?م\.?)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const value = parseMoney(match[1]);

      if (value !== null) {
        tokens.push({
          raw: match[0],
          value,
        });
      }
    }
  }

  return tokens;
}

function textHasExpectedTotal(text, expectedTotal) {
  return findPriceTokens(text).some((token) => Math.abs(token.value - expectedTotal) < 0.01);
}

function findObjectsByKeys(value, matcher, seen = new WeakSet()) {
  const results = [];

  if (!value || typeof value !== 'object') {
    return results;
  }

  if (seen.has(value)) {
    return results;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      results.push(...findObjectsByKeys(item, matcher, seen));
    }
    return results;
  }

  const keys = Object.keys(value);

  if (matcher(keys, value)) {
    results.push(value);
  }

  for (const nested of Object.values(value)) {
    results.push(...findObjectsByKeys(nested, matcher, seen));
  }

  return results;
}

function firstStringByKey(item, keys) {
  for (const key of keys) {
    const value = item[key];

    if (typeof value === 'string' && normalizeText(value)) {
      return normalizeText(value);
    }
  }

  return '';
}

function firstPriceValue(item) {
  const directKeys = [
    'salePrice',
    'retailPrice',
    'price',
    'amount',
    'subtotal',
    'totalPrice',
    'total_price',
    'mall_price',
  ];

  for (const key of directKeys) {
    const value = item[key];

    if (typeof value === 'number') {
      return parseMoney(value);
    }

    if (typeof value === 'string') {
      const token = findPriceTokens(value)[0];

      if (token) {
        return token.value;
      }

      const numeric = parseMoney(value);

      if (numeric !== null && numeric > 0) {
        return numeric;
      }
    }

    if (value && typeof value === 'object') {
      const nestedAmount = value.amountWithSymbol ?? value.amount ?? value.priceShowStyle;
      const numeric = parseMoney(nestedAmount);

      if (numeric !== null && numeric > 0) {
        return numeric;
      }
    }
  }

  for (const value of Object.values(item)) {
    if (typeof value === 'string') {
      const token = findPriceTokens(value)[0];

      if (token) {
        return token.value;
      }
    }
  }

  return null;
}

function extractItemsFromJson(jsonPayloads) {
  const candidates = [];

  for (const payload of jsonPayloads) {
    const matches = findObjectsByKeys(payload.json, (keys, value) => {
      const keyText = keys.join(' ').toLowerCase();
      const hasName = /(goods|product|item|sku).*(name|title)|\b(name|title|goods_name|product_name)\b/.test(keyText);
      const hasPrice = /price|amount|subtotal|mall_price/.test(keyText);
      const hasImage = /image|img|thumb|goods_img|product_img/.test(keyText);
      const text = normalizeText(JSON.stringify(value)).slice(0, 2500);

      return hasName && (hasPrice || hasImage || /MAD|DH|د\.?م\.?/i.test(text));
    });

    for (const match of matches) {
      candidates.push({
        sourceUrl: payload.url,
        name: firstStringByKey(match, [
          'goods_name',
          'product_name',
          'productName',
          'goodsName',
          'itemName',
          'name',
          'title',
        ]),
        price: firstPriceValue(match),
        choices: [
          firstStringByKey(match, ['size', 'size_name', 'sizeName']),
          firstStringByKey(match, ['color', 'color_name', 'colorName']),
          firstStringByKey(match, ['goodsAttr']),
          firstStringByKey(match, ['sku_sale_attr', 'saleAttr', 'attr_value', 'attrValue']),
        ].filter(Boolean),
        raw: match,
      });
    }
  }

  const seen = new Set();

  return candidates.filter((item) => {
    const key = `${item.name}|${item.price}|${item.choices.join('|')}`;

    if (!item.name || item.price === null || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 250);
    });
  });
}

async function clickPossibleConsent(page) {
  const labels = ['Accept', 'Agree', 'Allow', 'OK', 'Got it', 'I agree'];

  for (const label of labels) {
    const button = page.getByRole('button', { name: new RegExp(label, 'i') }).first();

    try {
      if (await button.isVisible({ timeout: 700 })) {
        await button.click({ timeout: 1500 });
        return;
      }
    } catch {
      // Keep trying other common consent labels.
    }
  }
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsage();
  process.exit(0);
}

let targetUrl;

try {
  targetUrl = validateUrl(args.url);

  if (!args.device) {
    throw new Error('Missing value after --device.');
  }

  if (!Number.isFinite(args.expectedTotal)) {
    throw new Error('Invalid --expected-total value.');
  }
} catch (error) {
  console.error(error.message);
  printUsage();
  process.exit(1);
}

const device = devices[args.device];

if (!device) {
  console.error(`Unknown Playwright device profile: ${args.device}`);
  console.error('Try "iPhone 13" or "Pixel 5".');
  process.exit(1);
}

await rm(DEFAULT_OUTPUT_DIR, { recursive: true, force: true });
await mkdir(DEFAULT_OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: !args.headed,
});

const context = await browser.newContext({
  ...device,
  locale: 'fr-MA',
  timezoneId: 'Africa/Casablanca',
});

const page = await context.newPage();
const jsonPayloads = [];
const responseSummaries = [];

page.on('response', async (response) => {
  const url = response.url();
  const contentType = response.headers()['content-type'] ?? '';

  if (!/json|javascript|text/i.test(contentType)) {
    return;
  }

  responseSummaries.push({
    status: response.status(),
    url,
    contentType,
  });

  if (!/json/i.test(contentType)) {
    return;
  }

  try {
    const json = await response.json();
    const haystack = JSON.stringify(json);

    if (/cart|checkout|goods|product|price|MAD|DH|د\.?م\.?/i.test(`${url} ${haystack}`)) {
      jsonPayloads.push({ url, json });
    }
  } catch {
    // Some JSON-like responses are not parseable after redirects or streaming.
  }
});

try {
  await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await clickPossibleConsent(page);
  await page.waitForTimeout(5000);
  await autoScroll(page).catch(() => {});
  await page.waitForTimeout(2000);

  const dom = await page.evaluate(() => {
    const visibleText = document.body.innerText;
    const products = Array.from(document.querySelectorAll('a, [class*="product"], [class*="goods"], [class*="cart"], [class*="item"]'))
      .map((node) => ({
        tag: node.tagName.toLowerCase(),
        text: node.innerText,
        href: node.href || '',
        className: node.className || '',
      }))
      .filter((item) => item.text && item.text.trim().length > 0)
      .slice(0, 300);
    const images = Array.from(document.images)
      .map((img) => ({
        src: img.currentSrc || img.src,
        alt: img.alt,
      }))
      .slice(0, 300);
    const cartItems = Array.from(document.querySelectorAll('.bsc-cart-item-goods-title__content, .bsc-cart-item-share__title'))
      .map((titleNode) => {
        const root = titleNode.closest('.bsc-cart-item, .bsc-cart-item-share, [class*="cart-item"]') || titleNode.parentElement;
        const read = (selector) => root?.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || '';
        const title = titleNode.textContent?.replace(/\s+/g, ' ').trim() || '';

        return {
          name: title,
          choices: [
            read('.bsc-cart-item-goods-sale-attr__text'),
            read('.bsc-cart-item-goods-sale-attr'),
          ].filter(Boolean),
          priceText: read('.bsc-cart-item-goods-price__sale-price')
            || read('.bsc-cart-item-goods-price__main')
            || read('.bsc-cart-item-goods-price')
            || read('[class*="price"]'),
        };
      })
      .filter((item, index, list) => {
        if (!item.name) {
          return false;
        }

        return list.findIndex((candidate) => candidate.name === item.name) === index;
      });

    return {
      title: document.title,
      url: location.href,
      visibleText,
      products,
      images,
      cartItems,
    };
  });

  const itemsFromJson = extractItemsFromJson(jsonPayloads);
  const itemsFromDom = dom.cartItems.map((item) => ({
    sourceUrl: dom.url,
    name: item.name,
    price: parseMoney(item.priceText),
    priceText: item.priceText,
    choices: item.choices,
  })).filter((item) => item.name && item.price !== null);
  const items = itemsFromDom.length > 0 ? itemsFromDom : itemsFromJson;
  const priceTokens = findPriceTokens(dom.visibleText);
  const expectedTotalFound = textHasExpectedTotal(dom.visibleText, args.expectedTotal)
    || jsonPayloads.some((payload) => textHasExpectedTotal(JSON.stringify(payload.json), args.expectedTotal));

  const report = {
    ok: items.length > 0 && expectedTotalFound,
    expectedTotal: args.expectedTotal,
    expectedTotalFound,
    finalUrl: dom.url,
    title: dom.title,
    itemCount: items.length,
    items: items.map(({ raw, ...item }) => item),
    priceTokens: priceTokens.slice(0, 80),
    artifactsDir: DEFAULT_OUTPUT_DIR,
  };

  await writeFile(path.join(DEFAULT_OUTPUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(DEFAULT_OUTPUT_DIR, 'dom-text.txt'), dom.visibleText);
  await writeFile(path.join(DEFAULT_OUTPUT_DIR, 'dom-products.json'), JSON.stringify(dom.products, null, 2));
  await writeFile(path.join(DEFAULT_OUTPUT_DIR, 'images.json'), JSON.stringify(dom.images, null, 2));
  await writeFile(path.join(DEFAULT_OUTPUT_DIR, 'network-json.json'), JSON.stringify(jsonPayloads, null, 2));
  await writeFile(path.join(DEFAULT_OUTPUT_DIR, 'responses.json'), JSON.stringify(responseSummaries, null, 2));
  await page.screenshot({ path: path.join(DEFAULT_OUTPUT_DIR, 'screenshot.png'), fullPage: true });

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
} finally {
  await browser.close();
}
