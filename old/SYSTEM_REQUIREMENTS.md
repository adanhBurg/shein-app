# Lamar SHEIN Ordering System Requirements

## 1. Purpose

This document describes the current Lamar/SHEIN ordering system in implementation-neutral terms so another AI agent or development team can rebuild it with a different technology stack.

The system is a lightweight multi-tenant order intake and management platform for SHEIN resellers. Each store owner creates a store link, shares a customer order page, receives customer product links, manages order status and pricing, and can generate invoice images. A single super-admin account can view all stores and all orders across tenants.

## 2. Current Technical Shape

The current implementation is a static frontend application with Firebase services:

- Static HTML pages:
  - `index.html`: public Lamar storefront mock/ecommerce page.
  - `shein-order.html`: tenant-aware customer order form.
  - `admin.html`: tenant-aware owner/admin order dashboard.
  - `owner.html`: owner onboarding and store creation.
  - `super-admin.html`: global super-admin dashboard.
  - `404.html`: invalid store-link message.
  - `owner/index.html` and `super-admin/index.html`: redirect wrappers.
- Shared JavaScript:
  - `assets/js/firebase-orders.js`: Firebase initialization, tenant routing, Firestore reads/writes, Google auth, store creation, and order serialization.
  - `script.js`: public storefront product/cart/wishlist behavior.
- Static assets:
  - `assets/images/brand/fadwa-logo.jpeg`: invoice/brand logo.
  - `assets/images/order/shein-by-fadwa.png`: customer order-page reveal image.
- Firebase:
  - Firestore stores and orders.
  - Firebase Authentication with Google popup sign-in.
  - Firestore security rules in `firestore.rules`.
- External browser libraries:
  - Firebase Web SDK version `12.7.0`.
  - `html2canvas@1.4.1` for invoice image rendering.
  - `tesseract.js@4` for OCR on uploaded product screenshots.

The rebuild does not need to stay static or use Firebase, but it must preserve the product behavior, data boundaries, roles, screens, and workflows described below.

## 3. User Roles

### 3.1 Customer

A customer uses a store-specific order link to submit a SHEIN product link to a specific owner/store.

Customer capabilities:

- Open only a valid tenant order URL.
- Choose interface language: English, French, or Arabic.
- Save a short local profile on first visit for the active tenant:
  - submitter name
  - phone number
- Submit one product order at a time:
  - customer name
  - SHEIN product link
- Reset local profile with the "Not you? Change" action.
- See a success state after submission.

Customer restrictions:

- Customers do not authenticate.
- Customers cannot read orders.
- Customers cannot edit or delete orders.
- Customers cannot submit to an invalid tenant route.
- Customers can create orders only for stores that exist.

### 3.2 Store Owner / Admin

A store owner is the Google-authenticated user who created a store. The owner operates that store's admin dashboard.

Owner/admin capabilities:

- Sign in with Google.
- Create a store from the owner setup page.
- Open the admin dashboard only for stores they own.
- View real-time orders for their own store.
- View aggregate stats for their own store.
- Mark orders done.
- Mark orders pending.
- Delete individual orders.
- Clear all orders for their store.
- Open an order detail panel.
- Add/edit order pricing by platform.
- Upload product screenshots/images to an order.
- Use OCR to extract prices from screenshots.
- Use voice input to fill pricing rows.
- Generate an invoice view.
- Print an invoice.
- Copy/download invoice image.
- Open WhatsApp to the customer's normalized phone number after invoice capture.
- Change UI language: English, French, Arabic.

Owner/admin restrictions:

- A signed-in owner can access only stores whose `ownerUid` matches their authenticated user ID.
- A signed-in owner cannot list all stores unless they are also the configured super-admin.
- A signed-in owner cannot read, edit, or delete other stores' orders.
- Store deletion is not supported.

### 3.3 Super Admin

The super-admin is a single hard-coded email in the current app:

```text
saidhnad7@gmail.com
```

Super-admin capabilities:

- Sign in with Google.
- Access `/super-admin` or `/super-admin.html`.
- List all stores.
- Search/filter stores.
- View all orders across all stores.
- Filter orders by selected store.
- View global counts:
  - stores
  - orders
  - pending orders
  - done orders
- See each order's store, customer, phone, product link, status, submitted-by name, and timestamp.

Super-admin restrictions:

- In the current UI, super-admin is read-only for order management. It can view stores and orders but does not edit or delete them.
- Only the exact configured email receives super-admin access.

## 4. Multi-Tenancy Model

### 4.1 Tenant Identifier

Each tenant is a store identified by a URL-safe slug.

Slug normalization rules:

- Convert to string.
- Trim whitespace.
- Lowercase.
- Replace every character that is not `a-z`, `0-9`, or `-` with `-`.
- Collapse multiple hyphens into one hyphen.
- Remove leading/trailing hyphens.
- If the result is empty, default to `fadwa`.

Valid created store/order slugs must match:

```text
^[a-z0-9-]{1,80}$
```

### 4.2 Tenant Routes

Production-style routes:

- `/:store/orders` -> customer order page for `store`.
- `/:store/admin` -> admin dashboard for `store`.
- `/store/:store/orders` -> alternate customer order route.
- `/store/:store/admin` -> alternate admin route.
- `/owner` -> owner setup.
- `/super-admin` -> super-admin dashboard.

Static fallback routes:

- `/shein-order.html`
- `/admin.html`
- `/owner.html`
- `/super-admin.html`

Localhost development supports a query-string tenant:

- `/shein-order.html?store=fadwa`
- `/admin.html?store=fadwa`

### 4.3 Tenant Resolution Priority

The current logic resolves the active tenant in this order:

1. Valid tenant route in the path.
2. Localhost-only `?store=` query parameter.
3. Last stored `localStorage` value under `lamar_store_slug`.
4. Default slug `fadwa`.

The resolved tenant is exposed to the frontend as a global tenant object. A rebuild should centralize equivalent tenant context:

```json
{
  "slug": "fadwa",
  "urlSlug": "fadwa",
  "hasUrlStore": true,
  "routePage": "orders",
  "hasValidOrderRoute": true,
  "hasValidAdminRoute": false,
  "ordersStorageKey": "lamar_orders_fadwa"
}
```

### 4.4 Tenant Data Isolation

Tenant data is stored under a store document and nested orders collection:

```text
stores/{storeId}
stores/{storeId}/orders/{orderId}
```

All owner/admin order operations must be scoped to the active `storeId`.

## 5. Data Model

### 5.1 Store

Collection/path:

```text
stores/{storeId}
```

Store fields:

```json
{
  "slug": "fadwa",
  "subdomain": "fadwa",
  "ownerUid": "firebase-auth-user-id",
  "ownerEmail": "owner@example.com",
  "displayName": "Fadwa SHEIN",
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

Field requirements:

- `slug`: string, must equal the document ID.
- `subdomain`: string, must equal the document ID.
- `ownerUid`: authenticated creator's user ID.
- `ownerEmail`: string or null.
- `displayName`: string, required, length 1 to 120.
- `createdAt`: server-side creation timestamp.
- `updatedAt`: server-side update timestamp.

Store creation behavior:

- User must be signed in.
- Slug is sanitized before creation.
- If a store with the same slug exists and is owned by the current user, return the existing store.
- If a store with the same slug exists and is owned by another user, reject with "store link already taken".
- Store deletion is disabled.

Store update behavior:

- Only owner can update.
- Only `displayName`, `ownerEmail`, and `updatedAt` are mutable.
- `ownerUid`, `slug`, and `subdomain` must remain unchanged.

### 5.2 Order

Collection/path:

```text
stores/{storeId}/orders/{orderId}
```

Order fields:

```json
{
  "name": "Customer Name",
  "phone": "+212 6XX XXX XXX",
  "link": "https://www.shein.com/product-page",
  "status": "pending",
  "time": "2026-04-25T20:10:00.000Z",
  "submittedByName": "Submitter Name",
  "pricing": {
    "items": [
      {
        "price": "10+15.50",
        "platform": "shein"
      }
    ]
  },
  "images": [
    "data:image/png;base64,..."
  ]
}
```

Order field requirements:

- `name`: customer name, required string, max 120 chars.
- `phone`: submitter phone, required string, max 40 chars.
- `link`: product URL, required string, must start with `http://` or `https://`.
- `status`: enum: `pending` or `done`; customer-created orders always start as `pending`.
- `time`: ISO string timestamp.
- `submittedByName`: string identifying the local profile submitter.
- `pricing.items`: list of pricing items.
- `images`: list of image strings. Customer-created orders must start with an empty image list.

Order creation behavior:

- Customers can create orders for an existing store without signing in if the payload passes validation.
- Owners can also create orders under their own store.
- The app normalizes missing protocol in a customer-entered product link by prepending `https://`.
- New orders are sorted newest first in real-time subscriptions.

Order update behavior:

- Owners can update their own store's orders.
- Owners can change `status`, `pricing`, and `images`.
- The shared serializer always persists the full normalized order object.
- Current admin UI debounces full-order saves for pricing/image edits by about 300 ms.

Order delete behavior:

- Owners can delete their own store's individual orders.
- Owners can clear all current orders for their store via batch delete.

### 5.3 Pricing Item

Pricing item fields:

```json
{
  "price": "10+15.50",
  "platform": "shein"
}
```

Supported `platform` values:

- `shein`
- `sheinPlus`
- `marketplace`
- `marketplacePlus`
- `null` for rows without selected platform

Price input format:

- String that may contain numbers, decimal points, and plus signs.
- Whitespace is removed.
- Trailing plus signs are removed.
- The system supports additive pricing such as `12+4.5+8`.
- Invalid input yields no calculated price.

Pricing formulas:

- `shein`: `cost + (cost * 0.15)`
- `sheinPlus`: `(cost + (cost * 0.20)) * 1.15`
- `marketplace`: `cost + (cost * 0.20)`
- `marketplacePlus`: `cost * 1.20 * 1.20`

Displayed calculated prices use two decimal places and a dollar sign in the admin and invoice UI. Purchase/cost values in the invoice are shown with euro symbol in the current UI.

Default pricing rows when an order has no pricing:

1. `SHEIN` mapped to `shein`
2. `SHEIN+` mapped to `sheinPlus`
3. `Marketplace` mapped to `marketplace`
4. `Marketplace+` mapped to `marketplacePlus`

Additional dynamic row support exists in code but is not exposed by the current visible HTML controls.

### 5.4 Local Storage Keys

The current browser app uses local storage for convenience and migration:

- `lamar_store_slug`: last resolved store slug.
- `lamar_profile_{storeSlug}`: customer profile `{ name, phone }` for one tenant.
- `lamar_lang`: selected language.
- `lamar_cart`: public storefront cart.
- `lamar_wishlist`: public storefront wishlist.
- `lamar_orders`: legacy non-tenant order storage.
- `lamar_orders_{storeSlug}`: legacy/temporary tenant order key.
- `lamar_firestore_orders_migrated_{storeSlug}`: migration flag from legacy local storage to Firestore.

A rebuild with server-side sessions or a database can replace local storage where appropriate, but should preserve the local profile and language behavior unless intentionally redesigned.

## 6. Authentication and Authorization

### 6.1 Authentication

Use Google sign-in for owner/admin and super-admin access.

Required auth behavior:

- Owner page shows "Continue with Google" until signed in.
- Admin page shows a login gate until signed in and store ownership is verified.
- Super-admin page shows a login gate until signed in and email is verified as the configured super-admin.
- Sign-out is available on owner/admin/super-admin pages.
- User-facing auth errors should distinguish:
  - auth not configured
  - Google provider disabled
  - unauthorized domain
  - generic sign-in failure

### 6.2 Firestore Rules Equivalent

If rebuilt outside Firestore, implement equivalent server-side authorization:

- Anyone can read a single store document by ID.
- Only super-admin can list all stores.
- Only signed-in users can create stores.
- Store creator must set `ownerUid` to their own user ID.
- Only store owner can update mutable store metadata.
- No one can delete stores through the app.
- Anyone can create a valid pending order under an existing store.
- Store owner can create/read/update/delete orders under their own store.
- Super-admin can read all orders.
- Customers cannot read, update, or delete any orders.

## 7. Pages and Functional Requirements

### 7.1 Public Storefront Page

Route:

```text
/
/index.html
```

Purpose:

- Present Lamar as a fashion storefront.
- Provide product browsing interactions.
- Link users to owner setup and order form.

Main sections:

- Sticky header:
  - logo
  - desktop search input
  - mobile search drawer
  - wishlist icon and count
  - cart icon and count
  - owner setup icon/link
  - SHEIN order icon/link
  - desktop navigation menu
  - mobile navigation drawer
- Categories:
  - Women
  - Men
  - Dresses
  - Shoes
  - Bags
  - Beauty
  - Kids
  - Home & Living
- Banner row:
  - Luxury Essentials
  - Summer Sale
  - Fresh Arrivals
- Trending products grid:
  - 16 hard-coded products.
  - Filters: All, Women, Men, Dresses, Shoes, Bags.
  - Initial visible count: 8.
  - Load more step: 4.
- Newsletter/promo form:
  - email input
  - subscribe button
  - success toast
- Footer:
  - brand copy
  - social links
  - shop/help/company links
  - payment labels
- Cart sidebar:
  - items
  - quantities
  - subtotal
  - checkout simulation
- Wishlist sidebar.
- Product detail modal:
  - image
  - brand
  - product name
  - rating
  - price
  - description
  - size selection
  - add-to-cart

Storefront product properties:

```json
{
  "id": 1,
  "name": "Floral Wrap Midi Dress",
  "brand": "Lamar Studio",
  "category": "Dresses",
  "price": 38.99,
  "original": 64.99,
  "discount": 40,
  "rating": 4.8,
  "reviews": 2341,
  "badge": "sale",
  "image": "https://...",
  "description": "..."
}
```

Storefront behavior:

- Search matches product name, category, or brand.
- Category cards activate the matching filter tab and scroll to products.
- Cart stores product, quantity, and selected size locally.
- Wishlist stores product objects locally.
- Checkout is simulated: after a short delay, cart is emptied and a toast is shown.
- This storefront is not currently tenant-specific and does not create backend ecommerce orders.

### 7.2 Owner Setup Page

Routes:

```text
/owner
/owner.html
```

Purpose:

- Let a store owner authenticate, create a store, and copy the generated order/admin links.

Fields and controls:

- Google sign-in button:
  - label: `Continue with Google`
- Signed-in user panel:
  - display name
  - email
  - sign-out button
- Store creation form:
  - `storeName`
    - label: Store name
    - required
    - autocomplete organization
    - placeholder: `Fadwa SHEIN`
  - `storeSlug`
    - label: Store link
    - required
    - sanitized slug
    - placeholder: `fadwa`
  - slug preview:
    - displays host/path of generated order link
  - submit button:
    - label: Create store
- Result section:
  - order link
  - admin link
  - copy button for each
- Footer nav:
  - Storefront
  - Current order page

Owner setup behavior:

- Before sign-in, only sign-in button is shown.
- After sign-in, show user panel and store form.
- Default store name may be populated from Google display name.
- If slug field is empty, preview uses the store name.
- On create:
  - sanitize slug
  - create store with current user as owner
  - show order/admin links
  - allow copying links to clipboard
- If slug exists and belongs to current user, treat as already ready.
- If slug exists and belongs to another owner, show an error.

Generated link behavior:

- On localhost:
  - order: `/shein-order.html?store={slug}`
  - admin: `/admin.html?store={slug}`
- On production:
  - order: `/{slug}/orders`
  - admin: `/{slug}/admin`

### 7.3 Customer Order Page

Routes:

```text
/:store/orders
/store/:store/orders
/shein-order.html?store=:store on localhost
```

Purpose:

- Let a customer or reseller submit a SHEIN product link to a specific store.

Language support:

- English
- French
- Arabic
- Arabic sets document direction to RTL.
- Language is persisted in `lamar_lang`.

Route validation:

- Page must be opened from a valid tenant route or localhost tenant query.
- Store must exist.
- If invalid, show a full-page unavailable message:
  - "Order link unavailable"
  - instructs user to use a link like `/store-name/orders`.

Step 0: local profile setup

Shown on first visit for this tenant or after profile reset.

Fields:

- `profileName`
  - label: Your Name
  - text input
  - autocomplete name
  - required by behavior
  - placeholder examples localized
- `profilePhone`
  - label: Phone Number
  - tel input
  - autocomplete tel
  - required by behavior
  - placeholder examples localized
- Continue button.

Profile behavior:

- Saves `{ name, phone }` in local storage key `lamar_profile_{storeSlug}`.
- Moves to order form after both fields are present.
- Focuses the next relevant field.

Step 1: order submission

Fields:

- `orderName`
  - label: Customer Name
  - text input
  - autocomplete name
  - required by behavior
  - example placeholder `e.g. Sara`
- `orderLink`
  - label: SHEIN Product Link
  - URL input
  - required by behavior
  - autocomplete off
  - placeholder `https://www.shein.com/...`
- Submit Order button.
- "Not {profile.name}? Change" link.

Submission behavior:

- Validate customer name exists.
- Validate link exists.
- Normalize missing `http://` or `https://` by prepending `https://`.
- Create order under active store:
  - `name`: order/customer name
  - `phone`: saved profile phone
  - `link`: normalized product link
  - `submittedByName`: saved profile name
  - `status`: `pending`
  - `time`: current ISO timestamp
  - `pricing.items`: empty array
  - `images`: empty array
- On success:
  - clear order name and order link
  - remove saved profile
  - show button text "Order Sent"
  - temporarily color submit button green
  - after about 2.2 seconds, reset profile fields and show Step 0 again
- On failure:
  - alert with active store slug and possible error code.

Special reveal behavior:

- If the `orderName` input exactly equals `fadwa.hn` case-insensitively:
  - show the `SHEIN By Fadwa` circular image
  - hide default card header
  - reveal an admin-dashboard link
- Otherwise hide the reveal and admin link.

### 7.4 Store Admin Dashboard

Routes:

```text
/:store/admin
/store/:store/admin
/admin.html?store=:store on localhost
```

Purpose:

- Let a store owner manage orders for one tenant.

Access flow:

- Show login gate by default.
- User signs in with Google.
- Verify the active admin route is valid.
- Verify the active store exists.
- Verify signed-in user owns the active store.
- If ownership passes, open dashboard and subscribe to store orders.
- If ownership fails, return to login gate and alert the user to create the store or sign in with the owner account.

Login gate:

- Title: Admin Login
- Subtitle: Lamar/Fadwa dashboard text
- Google sign-in button
- error/message line
- language switcher

Dashboard layout:

- Responsive app shell with sidebar on desktop.
- Mobile menu drawer and bottom nav.
- Topbar:
  - mobile menu button
  - title: Orders Dashboard
  - localized current date
  - language switcher
  - Clear All button
  - Sign Out button
- Sidebar:
  - brand: Lamar
  - nav Dashboard
  - nav Orders
  - nav Order Form
  - nav Back to Store
  - footer owner/avatar display

Stats cards:

- Total Orders
- Pending
- Completed
- Customers

Stats behavior:

- Total count = number of orders in active store.
- Pending count = orders where `status === "pending"`.
- Completed count = orders where `status === "done"`.
- Customer count = unique lowercased customer names.
- Clicking a stat expands an animated full-screen panel:
  - Total shows all orders.
  - Pending shows pending orders.
  - Completed shows done orders.
  - Customers shows grouped customers with order counts.
- Expanded order cards show customer, link, time, status, calculated total when present, and action buttons.
- Customer expanded view can drill into all orders for a customer.

Orders table:

Columns:

- `#`: display order number, newest order receives highest sequence based on current list length.
- Customer
- Product Link
- Status
- Time
- Actions

Ordering behavior:

- Orders are received from backend sorted by `time` descending.
- UI renders pending orders first, then done orders.

Row behavior:

- Clicking row opens order detail overlay.
- Done/pending action button changes status.
- Delete action removes order.
- Done rows are visually highlighted.

New order behavior:

- Real-time subscription compares previous order count with new count.
- If count increases, show a "New order received!" flash for about 3 seconds.

Clear all behavior:

- Ask localized confirmation.
- If confirmed, optimistically clear visible cache and batch-delete all active store orders.

Order detail overlay:

- Header:
  - back button
  - title: Order Details
  - order number
- Customer profile:
  - avatar initial
  - customer name
  - order time
- Phone card:
  - phone number
  - copy invoice image button
  - WhatsApp invoice button
- Link card:
  - product link as external link
- Pricing section:
  - voice-pricing microphone button
  - multiple image upload button
  - uploaded image thumbnails with delete controls
  - pricing rows
  - calculated order total
- Footer:
  - status badge
  - invoice button
  - Mark Done or Mark Pending button depending on current status
  - Delete button

Pricing row UI:

- The first four rows are fixed platform rows:
  - SHEIN
  - SHEIN+
  - Marketplace
  - Marketplace+
- Each row contains:
  - platform chip
  - price text input
  - calculated result display if valid
- Editing price auto-saves to the order.
- Order total appears only when at least one row has a valid calculated value.

Voice pricing:

- Uses browser `SpeechRecognition` or `webkitSpeechRecognition`.
- Recording language is `ar-MA`.
- Continuous interim results are supported.
- Voice can switch active pricing platform using platform keywords:
  - SHEIN
  - SHEIN+
  - Marketplace
  - Marketplace+
  - Arabic approximations of those words
- Voice number parsing supports:
  - Eastern Arabic numerals
  - Arabic/Darija number words
  - French number words
  - words for plus/addition
  - words for decimal point
- Recognized values append to the active platform's price string using `+`.
- Final utterances auto-save pricing.

Image upload and OCR:

- Admin can upload multiple images for an order.
- Images are read as data URLs and stored directly in the order's `images` list.
- Each image is displayed as a thumbnail with a delete button.
- For each image:
  - Render original to canvas.
  - Render inverted copy to canvas.
  - Run OCR on both with Tesseract English.
  - Combine text results.
  - Detect if image is marketplace by matching `market place`.
  - Extract price near euro symbol.
  - Prefer a price directly before an info-icon-like symbol.
  - Fallback to first remaining price after removing "Save X" and percentage discount noise.
  - Append extracted price to SHEIN row or Marketplace row.
  - Auto-save pricing.
- OCR failure is silent.

Status changes:

- Mark done:
  - optimistically set `status = "done"`
  - save locally/cache
  - re-render
  - play two-tone completion sound
  - update backend status to `done`
- Mark pending:
  - set `status = "pending"`
  - save/cache
  - re-render
  - current main and expanded UI update local/cache order; full save is triggered only through the active-detail save path in the current implementation, so a rebuild should persist pending status explicitly.

Invoice:

- Invoice can be opened from order detail.
- Invoice uses brand image `assets/images/brand/fadwa-logo.jpeg`.
- Brand text: `SHEIN By_Fadwa_Hn`.
- Tagline:
  - Arabic: delivery across Morocco in Arabic.
  - Non-Arabic: `Livraison partout au Maroc`.
- Invoice fields:
  - customer name
  - customer phone
  - order number
  - date
  - pricing item rows
  - total
  - thank-you footer
- Invoice table columns:
  - Platform
  - Cost
  - Sell
- Empty-pricing invoice shows a localized "No pricing entered" message.
- Invoice can be printed.
- Invoice image capture uses `html2canvas` at scale 2 with white background.
- Copy invoice:
  - render hidden invoice
  - copy PNG to clipboard with `ClipboardItem` if available
  - fallback to PNG download
  - show localized toast
- WhatsApp invoice:
  - render/download PNG invoice
  - normalize phone number:
    - strip spaces, punctuation, parentheses, hyphens, dots, and plus sign
    - Moroccan `06...` or `07...` becomes `2126...` or `2127...`
    - numbers starting with `00` drop the leading `00`
  - open `https://wa.me/{phone}` in a new tab

### 7.5 Super-Admin Dashboard

Routes:

```text
/super-admin
/super-admin.html
```

Purpose:

- Give one configured operator a cross-tenant view of stores and orders.

Access flow:

- Show gate by default.
- User signs in with Google.
- If not signed in, remain at gate.
- If signed in email does not equal the configured super-admin email, show access denied.
- If email matches, show dashboard and subscribe to all stores and all nested store order collections.

Dashboard layout:

- Topbar:
  - title: Super Admin
  - signed-in email
  - sign-out button
- Stats:
  - Stores count
  - Orders count
  - Pending count
  - Done count
- Left panel:
  - Stores heading
  - store search input
  - "All stores" row
  - store rows
- Right panel:
  - orders title
  - orders table
  - empty state

Store search:

- Search input filters stores by lowercased combined text of:
  - store id
  - slug
  - display name
  - owner email

Store list row:

- Display store display name or ID.
- Display store ID.
- Display owner email or "No owner email".
- Display order count for that store.
- Clicking a store filters the order table.
- Clicking "All stores" clears the filter.

Orders table columns:

- Store
- Customer
- Phone
- Link
- Status
- Submitted
- Time

Order row behavior:

- Link opens product URL in a new tab.
- Status uses a badge:
  - pending/unknown => amber
  - done => green
- Time is rendered with browser locale via `toLocaleString`.

## 8. Internationalization Requirements

Current supported languages:

- `en`: English
- `fr`: French
- `ar`: Arabic

Language behavior:

- Language is chosen through segmented buttons.
- Choice is saved to `lamar_lang`.
- Pages using i18n update text content and placeholders with `data-i18n` and `data-i18n-ph`-style keys.
- Arabic sets:
  - `document.documentElement.lang = "ar"`
  - `document.documentElement.dir = "rtl"`
- Dates are formatted with:
  - Arabic: `ar-MA`
  - French: `fr-FR`
  - English: `en-GB`

Rebuild recommendation:

- Use a centralized translation dictionary.
- Keep language selection consistent across order/admin pages.
- Preserve RTL layout behavior for Arabic.

## 9. Notifications and Feedback

Required feedback patterns:

- Store owner setup:
  - show progress while creating store
  - show error on sign-in or slug conflict
  - show success when links are ready
  - copy buttons change to "Copied" briefly
- Customer order:
  - focus missing fields
  - show success button state after submission
  - alert detailed failure including store slug
- Admin:
  - show auth/ownership progress
  - show alerts for ownership/order loading failures
  - flash new-order notification on real-time count increase
  - play completion sound when marking done
  - show localized invoice copy/download toast
- Super-admin:
  - show access denied message for non-super-admin users
  - show Firestore/rules load errors in gate message

## 10. Security and Validation Requirements

### 10.1 Client Validation

Client-side validation must:

- Prevent empty owner store name.
- Prevent empty customer profile name/phone.
- Prevent empty customer order name/link.
- Normalize product links to include HTTP(S).
- Prevent order submission from invalid tenant routes.
- Validate store existence before showing order form.
- Verify owner access before showing admin dashboard.

### 10.2 Server Validation

Server-side validation must not rely on client code. It must enforce:

- Store slug validity.
- Store ownership on admin operations.
- Customer order create shape and limits.
- Pending-only status at customer create.
- Empty images at customer create.
- Valid HTTP(S) order link.
- Super-admin global read access only for configured account.
- No public order reads.

### 10.3 Sensitive Data

Orders contain customer names, phone numbers, and product links. A rebuild should:

- Protect order reads behind owner/super-admin authorization.
- Avoid exposing all orders to unauthenticated users.
- Avoid storing images as large base64 strings in the main order document if using a database with document-size limits; use object storage and image references instead.

## 11. Real-Time Requirements

The current system uses real-time Firestore listeners.

Required behavior for a rebuild:

- Admin dashboard receives order changes without manual refresh.
- Super-admin dashboard receives store and order changes without manual refresh.
- New order notification appears when admin order count increases.
- Sorting remains newest-first by order timestamp.

Acceptable implementation alternatives:

- WebSockets.
- Server-sent events.
- Polling, if frequency is sufficient and UX remains near real-time.

## 12. Legacy Migration Requirement

The current app includes a one-time migration from legacy local storage key `lamar_orders` to Firestore for the active tenant.

Migration behavior:

- Check `lamar_firestore_orders_migrated_{storeSlug}`.
- If already true, do nothing.
- Read `lamar_orders`.
- If non-empty, batch write legacy orders into `stores/{storeSlug}/orders/{legacyId}`.
- Mark migration key true.

A rebuild may omit this only if there is no need to migrate existing browser-local orders.

## 13. Routing and Deployment Requirements

The current `_redirects` file defines rewrite routes:

```text
/owner /owner.html 200
/super-admin /super-admin.html 200
/:store/admin /admin.html 200
/:store/orders /shein-order.html 200
/store/:store/admin /admin.html 200
/store/:store/orders /shein-order.html 200
```

A rebuild should support equivalent friendly URLs. Invalid tenant links should show a clear unavailable page rather than a generic crash.

## 14. Non-Functional Requirements

### 14.1 Responsiveness

The app is designed for desktop and mobile:

- Public storefront has mobile nav, mobile search, side drawers, and responsive product grids.
- Customer order page is a centered full-height card.
- Admin dashboard has desktop sidebar, mobile menu, mobile bottom nav, and card-like mobile order rows.
- Super-admin dashboard collapses stats/layout to one column on smaller screens.

### 14.2 Accessibility Baseline

Current implementation has partial accessibility:

- Buttons have visible labels or titles in many places.
- Mobile nav uses `aria-expanded` and `aria-hidden`.
- Inputs are associated with labels on forms.

A rebuild should improve accessibility:

- Keyboard support for modals/drawers.
- Focus trapping in overlays.
- ARIA labels for icon-only buttons.
- Escape-to-close behavior for overlays.
- Better status announcements for async operations.

### 14.3 Performance

Important performance considerations:

- Admin order updates should avoid excessive backend writes; current pricing save is debounced.
- OCR and invoice rendering are browser-heavy and should show loading states in a rebuild.
- Storing images as base64 in order documents may not scale.
- Super-admin currently subscribes to every store and every store's orders; a scalable rebuild should provide a backend aggregate query or paginated API.

## 15. Known Current Limitations to Address in a Rebuild

- Super-admin email is hard-coded.
- Owner/admin UI is branded around Fadwa even though stores are multi-tenant.
- Public storefront is not tenant-specific.
- Cart/wishlist are local-only and not connected to checkout.
- Customer order form captures only one product link per order.
- Admin can upload images into order documents as base64 strings, which can hit database limits.
- Tesseract OCR is loaded globally and OCR failure is silent.
- Mark pending in the admin UI should be explicitly persisted to backend in all paths.
- Additional pricing row controls exist in script but are not clearly exposed in the current HTML.
- No explicit pagination for large order/store lists.
- No role management UI beyond owner ownership and one fixed super-admin email.

## 16. Acceptance Criteria for a Rebuild

A rebuilt system should be considered functionally equivalent when:

1. Owners can sign in with Google or equivalent OAuth and create stores with unique slugs.
2. The system generates tenant-specific order/admin links.
3. Customers can open valid tenant order links and submit orders without authentication.
4. Customer-created orders are stored under the correct tenant and start as pending.
5. Owners can access only their own store admin dashboard.
6. Owners see real-time orders, stats, pending/done state, unique-customer counts, and new-order flashes.
7. Owners can mark orders done/pending, delete one order, and clear all tenant orders.
8. Owners can open an order detail view, edit pricing rows, calculate totals using the exact formulas, upload/remove images, and persist those changes.
9. Owners can generate, print, copy/download, and WhatsApp invoice images.
10. Super-admin can sign in and view all stores/orders across tenants.
11. Firestore rules or backend authorization enforce the same read/write boundaries.
12. English, French, and Arabic language modes exist on order/admin surfaces, with RTL support for Arabic.
13. Invalid tenant links show a clear unavailable message.
14. Storefront product browsing, search, filters, cart, wishlist, newsletter toast, and modal behavior are preserved if the storefront is included in the rebuild.

