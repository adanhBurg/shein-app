# SHEIN Mobile Link Playbook

This flow is for shared SHEIN cart or checkout links that only need a mobile browser profile. It does not start your React app, does not require a backend, and does not attempt to reverse engineer the native SHEIN app.

## Goal

Open a shared link in a simulated mobile browser so the page behaves like it was opened from a phone.

## Command

From `lamar-shein`:

```bash
npm run shein:mobile -- "https://the-shared-link.example"
```

If the link contains `&` query parameters on Windows, pass it as base64 to avoid shell splitting:

```bash
npm run shein:mobile -- --url-base64 "<base64-url>"
```

Use a different device profile when needed:

```bash
npm run shein:mobile -- "https://the-shared-link.example" --device "Pixel 5"
```

The first run may install the Playwright CLI and its browser files through `npx`.

## Extract Product Data

Use the extractor when you need product name, price, and choices from the shared cart page:

```bash
npm run shein:extract -- --url-base64 "<base64-url>"
```

For the current sample link, the extraction result was:

```json
{
  "ok": true,
  "finalUrl": "https://m.shein.com/ma/cart/share/landing?shc=2_lDlKCDwcjN6&group_id=718911090&local_country=MA&url_from=&cart_share=1",
  "items": [
    {
      "name": "Bottes à plateforme pour femmes, automne/hiver. Nouvelles bottes de mode printemps automne 2025 avec lacets et fermeture éclair, cheville, hauteur augmentée. Bottes pour femmes",
      "price": 1123,
      "choices": ["Noir / CN38"]
    }
  ]
}
```

## Recommended Process

1. Open the customer-provided shared link with the default iPhone profile.
2. If the link redirects incorrectly, retry with an Android profile:

```bash
npm run shein:mobile -- "https://the-shared-link.example" --device "Pixel 5"
```

3. Confirm whether the link renders as a mobile web page or shows an app-only screen.
4. If the page renders, inspect the visible cart information manually or with Playwright tooling.
5. If the page is app-only, Playwright mobile browser simulation is not enough; the next tool would be Android Emulator plus Appium.

## What This Solves

- Opens the link with a mobile viewport.
- Uses a mobile user agent and touch-capable browser profile.
- Avoids adding scraping logic before seeing the real page structure.
- Keeps the React application untouched.

## What It Does Not Solve

- Native app-only deep links such as `shein://...` or Android `intent://...`.
- Login-protected or expired shared links.
- Anti-bot checks or region-specific flows.
- Native app checkout actions or ordering.

## How Extraction Works

The extractor reads:

1. JSON embedded in page scripts.
2. Cart-related network responses.
3. DOM text and image data.

It also writes debug artifacts to `output/shein-cart-extract/latest/`, including `report.json`, network JSON, DOM text, and a screenshot. This folder is ignored by git.

## App Integration

The customer order screen calls the scanner automatically while the order is being created:

```txt
POST /api/shein-cart-preview
```

The backend opens the submitted SHEIN link with Playwright mobile emulation and prefers cart data from SHEIN network JSON responses when available. Direct `m.shein.com/.../cart/share/landing` links are normalized through SHEIN's `api-shein...sharejump/appjump` URL first, because the direct mobile page can trigger a bot challenge before the cart JSON loads. `CustomerOrderPage.jsx` shows a loading bar while reading the link and saving the order. The order is saved with `sheinCart`, and the pricing rows receive the extracted totals split between SHEIN and Marketplace items.

`AdminDashboard.jsx` shows the extracted items in an expanded-by-default collapsible "Order items" section, plus the pricing table below it.

For local endpoint testing, use two terminals from `lamar-shein`:

```bash
npm run backend
```

```bash
npm run dev
```

Open `http://localhost:3000/fadwa/orders`. Vite proxies `/api` to the backend on port `8787`.
