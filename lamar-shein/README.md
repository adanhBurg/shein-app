# Lamar SHEIN — React App

A mobile-first, multi-tenant SHEIN reseller order management system built with React + Vite.

## Quick Start

```bash
cd lamar-shein-react
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000)

---

## Routes

| URL | Screen |
|-----|--------|
| `/` | Public Storefront |
| `/:store/orders` | Customer Order Form |
| `/store/:store/orders` | Customer Order Form (alt) |
| `/:store/admin` | Admin Dashboard |
| `/store/:store/admin` | Admin Dashboard (alt) |
| `/owner` | Owner Setup |
| `/super-admin` | Super Admin Dashboard |
| `*` | 404 / Invalid Store |

**Example:** `http://localhost:3000/fadwa/orders`

---

## Project Structure

```
src/
├── App.jsx                  # React Router config
├── main.jsx                 # Entry point
├── themes.js                # 3 color themes (blush / dark / cream)
├── i18n.js                  # EN / FR / AR translations + useLang hook
├── context/
│   └── ThemeContext.jsx      # Global theme provider + useTheme hook
├── utils/
│   └── pricing.js           # Pricing formulas, parsePrice, calcTotal, normalizePhone
├── components/
│   └── LanguageSwitcher.jsx  # AR/FR/EN switcher button group
├── pages/
│   ├── CustomerOrderPage.jsx # 2-step order form (profile → order)
│   ├── AdminDashboard.jsx    # Full admin: login, orders, detail, invoice
│   ├── OwnerSetup.jsx        # Store creation + link generation
│   ├── SuperAdmin.jsx        # Cross-tenant stores + orders view
│   ├── Storefront.jsx        # Public product grid + cart + modal
│   └── NotFound.jsx          # 404 / invalid store page
└── assets/
    └── logo.jpeg             # SHEIN By Fadwa brand logo
```

---

## Connecting Firebase

All Firebase integration points are marked with `// TODO:` comments in the code.

### 1. Install Firebase

```bash
npm install firebase
```

### 2. Create `src/firebase.js`

```js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  // ... rest of config
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
```

### 3. Key integration points

| File | What to wire |
|------|-------------|
| `CustomerOrderPage.jsx` | Replace `console.log` submit with Firestore `addDoc` to `stores/{store}/orders` |
| `AdminDashboard.jsx` | Replace mock orders with `onSnapshot(collection(db, 'stores', store, 'orders'))` real-time listener |
| `AdminDashboard.jsx` | Replace mock login with `signInWithPopup(auth, googleProvider)` + ownership check |
| `OwnerSetup.jsx` | Replace mock login + store creation with real Google auth + Firestore `setDoc` |
| `SuperAdmin.jsx` | Replace mock data with Firestore queries across all stores (requires super-admin rule) |

### 4. Firestore Data Model

```
stores/{storeId}
  slug: string
  ownerUid: string
  ownerEmail: string
  displayName: string
  createdAt: Timestamp
  updatedAt: Timestamp

stores/{storeId}/orders/{orderId}
  name: string          # customer name
  phone: string
  link: string          # SHEIN product URL
  status: 'pending' | 'done'
  time: string          # ISO timestamp
  submittedByName: string
  pricing: { items: [{ platform: string, price: string }] }
  images: string[]      # base64 data URLs (use Cloud Storage in production)
```

---

## Pricing Formulas (`src/utils/pricing.js`)

| Platform | Formula |
|----------|---------|
| SHEIN | `cost × 1.15` |
| SHEIN+ | `(cost × 1.20) × 1.15` |
| Marketplace | `cost × 1.20` |
| Marketplace+ | `cost × 1.44` |

Price inputs support additive format: `12+4.5+8`

---

## Themes

Three built-in themes in `src/themes.js`:
- **blush** — Warm rose/pink (default)
- **dark** — Dark editorial
- **cream** — Ivory & gold

Switch theme: `const { setTheme } = useTheme(); setTheme('dark');`

---

## Internationalization

Three languages in `src/i18n.js`:
- **ar** — Arabic (RTL)
- **fr** — French
- **en** — English

Language is persisted in `localStorage` under `lamar_lang`.

```jsx
import { useLang } from '../i18n.js';
const { lang, setLang, t } = useLang();
// t.submitBtn, t.nameLabel, etc.
```

---

## Voice Pricing (Admin)

The voice pricing button (`🎤`) in AdminDashboard is currently simulated. To wire up real speech recognition:

```js
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.lang = 'ar-MA';
recognition.continuous = true;
recognition.interimResults = true;
recognition.onresult = (event) => { /* parse Arabic numbers */ };
recognition.start();
```

---

## Super Admin Email

The super-admin email is defined in `src/pages/SuperAdmin.jsx`:

```js
const SUPER_ADMIN_EMAIL = 'hnadamohamed18@gmail.com';
```

Change this to configure a different super-admin account.

---

## Build for Production

```bash
npm run build
# Output in dist/
```

Deploy `dist/` to any static host (Netlify, Vercel, Firebase Hosting).

### Netlify `_redirects`

Create `public/_redirects`:

```
/owner           /index.html  200
/super-admin     /index.html  200
/:store/admin    /index.html  200
/:store/orders   /index.html  200
/store/:store/*  /index.html  200
```

### Vercel `vercel.json`

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```
