/* ─── CONSTANTS ─── */
const INITIAL_VISIBLE = 8;
const LOAD_MORE_STEP  = 4;
const SLIDER_INTERVAL = 5000;
const CHECKOUT_DELAY  = 1500;

/* ─── PRODUCT DATA ─── */
const products = [
  { id:1,  name:"Floral Wrap Midi Dress",       brand:"Lamar Studio",  category:"Dresses", price:38.99,  original:64.99, discount:40, rating:4.8, reviews:2341, badge:"sale",  image:"https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400&h=533&fit=crop", description:"A beautiful wrap-style midi dress with a floral pattern, perfect for summer days and garden parties." },
  { id:2,  name:"Oversized Linen Blazer",        brand:"Lamar Men",     category:"Men",     price:72.50,  original:null,  discount:0,  rating:4.6, reviews:892,  badge:"new",   image:"https://images.unsplash.com/photo-1617137968427-85924c800a22?w=400&h=533&fit=crop", description:"A sophisticated oversized linen blazer that brings effortless style to any outfit." },
  { id:3,  name:"Chain Strap Mini Bag",          brand:"Lamar Bags",    category:"Bags",    price:49.99,  original:79.99, discount:37, rating:4.9, reviews:3102, badge:"hot",   image:"https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&h=533&fit=crop", description:"A sleek mini bag with a gold chain strap, ideal for evenings out." },
  { id:4,  name:"High-Waist Flare Jeans",        brand:"Lamar Denim",   category:"Women",   price:56.00,  original:null,  discount:0,  rating:4.7, reviews:1567, badge:"new",   image:"https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&h=533&fit=crop", description:"Flattering high-waist flare jeans that elongate your silhouette with a retro-modern twist." },
  { id:5,  name:"Platform Mule Sandals",         brand:"Lamar Shoes",   category:"Shoes",   price:62.00,  original:89.00, discount:30, rating:4.5, reviews:743,  badge:"sale",  image:"https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400&h=533&fit=crop", description:"Chic platform mule sandals with a cushioned footbed for all-day comfort." },
  { id:6,  name:"Silk Slip Evening Dress",       brand:"Lamar Studio",  category:"Dresses", price:94.00,  original:145.0, discount:35, rating:4.9, reviews:2089, badge:"sale",  image:"https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=400&h=533&fit=crop", description:"An elegant silk-feel slip dress with adjustable spaghetti straps, perfect for special evenings." },
  { id:7,  name:"Cargo Utility Trousers",        brand:"Lamar Men",     category:"Men",     price:48.99,  original:null,  discount:0,  rating:4.4, reviews:621,  badge:null,    image:"https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400&h=533&fit=crop", description:"Functional yet stylish cargo trousers with multiple pockets and a relaxed fit." },
  { id:8,  name:"Knit Cardigan Co-Ord Set",      brand:"Lamar Knitwear",category:"Women",   price:67.50,  original:99.00, discount:32, rating:4.8, reviews:1834, badge:"hot",   image:"https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=533&fit=crop", description:"A cozy co-ord set featuring a chunky knit cardigan and matching shorts, perfect for autumn." },
  { id:9,  name:"Leather Ankle Boots",           brand:"Lamar Shoes",   category:"Shoes",   price:118.00, original:168.0, discount:30, rating:4.7, reviews:956,  badge:"sale",  image:"https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=533&fit=crop", description:"Classic leather ankle boots with a block heel and side zipper for easy wear." },
  { id:10, name:"Ruched Bodycon Mini Dress",     brand:"Lamar Studio",  category:"Dresses", price:34.99,  original:55.00, discount:36, rating:4.6, reviews:2267, badge:"hot",   image:"https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=400&h=533&fit=crop", description:"A figure-hugging ruched mini dress that transitions effortlessly from day to night." },
  { id:11, name:"Wide Brim Sun Hat",             brand:"Lamar Acc.",    category:"Women",   price:27.99,  original:null,  discount:0,  rating:4.5, reviews:489,  badge:"new",   image:"https://images.unsplash.com/photo-1521369909029-2afed882baee?w=400&h=533&fit=crop", description:"A stylish wide brim hat crafted from natural straw, perfect for beach days and festivals." },
  { id:12, name:"Slim Fit Oxford Shirt",         brand:"Lamar Men",     category:"Men",     price:44.00,  original:65.00, discount:32, rating:4.6, reviews:1123, badge:"sale",  image:"https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&h=533&fit=crop", description:"A crisp slim-fit oxford shirt that's versatile enough for the office or a casual weekend look." },
  { id:13, name:"Quilted Shoulder Bag",          brand:"Lamar Bags",    category:"Bags",    price:84.00,  original:120.0, discount:30, rating:4.8, reviews:1756, badge:"hot",   image:"https://images.unsplash.com/photo-1594938298603-c8148c4b4571?w=400&h=533&fit=crop", description:"A luxe quilted shoulder bag with gold-tone hardware and a detachable chain strap." },
  { id:14, name:"Ribbed Crop Tank Top",          brand:"Lamar Basics",  category:"Women",   price:18.99,  original:null,  discount:0,  rating:4.7, reviews:3841, badge:"new",   image:"https://images.unsplash.com/photo-1503342394128-c104d54dba01?w=400&h=533&fit=crop", description:"A wardrobe-essential ribbed crop tank in a soft stretch fabric. Pairs with everything." },
  { id:15, name:"Chunky Sneakers",               brand:"Lamar Shoes",   category:"Shoes",   price:88.00,  original:125.0, discount:30, rating:4.5, reviews:2034, badge:"sale",  image:"https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=533&fit=crop&crop=left", description:"Bold chunky-sole sneakers with a retro aesthetic and premium cushioning for all-day wear." },
  { id:16, name:"Lace Trim Slip Skirt",          brand:"Lamar Studio",  category:"Dresses", price:42.00,  original:68.00, discount:38, rating:4.9, reviews:1203, badge:"sale",  image:"https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=400&h=533&fit=crop", description:"A delicate satin slip skirt with lace trim detailing, effortlessly elegant and feminine." },
];

const sizes = ["XS", "S", "M", "L", "XL", "XXL"];

/* ─── STATE ─── */
let cart     = JSON.parse(localStorage.getItem('lamar_cart')     || '[]');
let wishlist = JSON.parse(localStorage.getItem('lamar_wishlist') || '[]');
let visibleCount  = INITIAL_VISIBLE;
let currentFilter = 'all';
let currentSlide  = 0;
let slideInterval;

/* cached slider DOM nodes — populated in initSlider */
let sliderSlides = [];
let sliderDots   = [];

/* ─── SHARED HELPERS ─── */
function formatStars(rating) {
  const n = Math.round(rating);
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function formatPriceHtml(p) {
  if (!p.original) return `<span class="price-current">$${p.price.toFixed(2)}</span>`;
  return `<span class="price-current">$${p.price.toFixed(2)}</span>
          <span class="price-original">$${p.original.toFixed(2)}</span>
          <span class="price-discount">-${p.discount}%</span>`;
}

function persist(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ─── INIT ─── */
document.addEventListener('DOMContentLoaded', () => {
  renderProducts();
  initSlider();
  updateBadges();

  const header = document.getElementById('header');
  let lastScrollY = window.scrollY;

  /* throttled scroll — fires at most once per animation frame */
  window.addEventListener('scroll', () => {
    if (Math.abs(window.scrollY - lastScrollY) < 1) return;
    lastScrollY = window.scrollY;
    header.style.boxShadow = lastScrollY > 10
      ? '0 4px 24px rgba(0,0,0,.1)'
      : '0 2px 16px rgba(0,0,0,.06)';
  }, { passive: true });

  document.getElementById('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSearch();
  });

  /* mobile search Enter */
  const msi = document.getElementById('mobileSearchInput');
  if (msi) msi.addEventListener('keydown', e => { if (e.key === 'Enter') handleMobileSearch(); });

  /* pause slider when tab is hidden */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearInterval(slideInterval);
    } else {
      startAutoSlide();
    }
  });
});

/* ─── RENDER PRODUCTS ─── */
function renderProducts() {
  const grid = document.getElementById('productsGrid');
  const filtered = currentFilter === 'all'
    ? products
    : products.filter(p => p.category === currentFilter);

  grid.innerHTML = filtered.slice(0, visibleCount).map(productCard).join('');

  const btn = document.querySelector('.load-more');
  if (btn) btn.style.display = filtered.length > visibleCount ? 'inline-flex' : 'none';
}

function productCard(p) {
  const inWishlist = wishlist.some(w => w.id === p.id);
  const badgeHtml = p.badge
    ? `<span class="product-badge ${p.badge}-badge">${p.badge === 'sale' ? '-'+p.discount+'%' : p.badge.toUpperCase()}</span>`
    : '';

  return `
    <div class="product-card" id="product-${p.id}">
      <div class="product-img-wrapper" onclick="openModal(${p.id})">
        ${badgeHtml}
        <img src="${p.image}" alt="${p.name}" loading="lazy" />
        <div class="product-actions-overlay">
          <button class="quick-add-btn" onclick="event.stopPropagation(); addToCart(${p.id})">
            + Add to Cart
          </button>
          <button class="wishlist-toggle ${inWishlist ? 'active' : ''}" onclick="event.stopPropagation(); toggleWishlistItem(${p.id})" title="Wishlist">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${inWishlist ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="product-info">
        <p class="product-brand">${p.brand}</p>
        <p class="product-name" onclick="openModal(${p.id})">${p.name}</p>
        <div class="product-rating">
          <span class="stars">${formatStars(p.rating)}</span>
          <span class="rating-count">(${p.reviews.toLocaleString()})</span>
        </div>
        <div class="product-price">${formatPriceHtml(p)}</div>
        <button class="add-to-cart-btn" onclick="addToCart(${p.id})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
          Add to Cart
        </button>
      </div>
    </div>
  `;
}

/* ─── FILTER ─── */
function filterProducts(category, btn) {
  currentFilter = category;
  visibleCount  = INITIAL_VISIBLE;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderProducts();
}

/* category circles use text-match to activate the correct tab */
function filterByCategory(category) {
  const matchingTab = [...document.querySelectorAll('.filter-tab')]
    .find(t => t.textContent === category) || null;
  filterProducts(category, matchingTab);
  document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
}

function loadMore() {
  visibleCount += LOAD_MORE_STEP;
  renderProducts();
}

/* ─── SEARCH ─── */
function handleSearch() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  if (!q) { currentFilter = 'all'; renderProducts(); return; }
  const grid    = document.getElementById('productsGrid');
  const results = products.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.category.toLowerCase().includes(q) ||
    p.brand.toLowerCase().includes(q)
  );
  grid.innerHTML = results.length
    ? results.map(productCard).join('')
    : `<div style="grid-column:1/-1;text-align:center;padding:60px 0;color:#888">
        <p style="font-size:18px;margin-bottom:8px">No results for "<strong>${q}</strong>"</p>
        <p style="font-size:14px">Try a different search term or browse our categories.</p>
       </div>`;
  document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
}

/* ─── CART ─── */
let badgeAnimTimer;

function addToCart(id, size = 'M') {
  const product  = products.find(p => p.id === id);
  const existing = cart.find(c => c.id === id && c.size === size);
  if (existing) { existing.qty += 1; } else { cart.push({ ...product, qty: 1, size }); }
  persist('lamar_cart', cart);
  updateBadges();

  /* only re-render cart list if sidebar is already open */
  if (document.getElementById('cartSidebar').classList.contains('open')) renderCartItems();

  toast(`✓ "${product.name}" added to cart`, 'success');

  /* guard against rapid-click animation jank */
  const badge = document.getElementById('cartBadge');
  if (!badgeAnimTimer) {
    badge.style.transform = 'scale(1.4)';
    badgeAnimTimer = setTimeout(() => { badge.style.transform = ''; badgeAnimTimer = null; }, 200);
  }
}

function removeFromCart(id, size) {
  cart = cart.filter(c => !(c.id === id && c.size === size));
  persist('lamar_cart', cart);
  updateBadges();
  renderCartItems();
}

function updateQty(id, size, delta) {
  const item = cart.find(c => c.id === id && c.size === size);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  persist('lamar_cart', cart);
  updateBadges();
  renderCartItems();
}

function renderCartItems() {
  const container = document.getElementById('cartItems');
  const footer    = document.getElementById('cartFooter');

  if (!cart.length) {
    footer.style.display = 'none';
    container.innerHTML = `
      <div class="cart-empty">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <p>Your cart is empty</p>
        <a href="#products" class="btn btn-primary btn-sm" onclick="toggleCart()">Start Shopping</a>
      </div>`;
    return;
  }

  footer.style.display = 'block';
  const subtotal = cart.reduce((sum, c) => sum + c.price * c.qty, 0);
  document.getElementById('cartSubtotal').textContent = '$' + subtotal.toFixed(2);

  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-img">
        <img src="${item.image}" alt="${item.name}" loading="lazy" />
      </div>
      <div class="cart-item-details">
        <p class="cart-item-name">${item.name}</p>
        <p class="cart-item-variant">Size: ${item.size}</p>
        <p class="cart-item-price">$${(item.price * item.qty).toFixed(2)}</p>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="updateQty(${item.id},'${item.size}',-1)">−</button>
          <span class="qty-value">${item.qty}</span>
          <button class="qty-btn" onclick="updateQty(${item.id},'${item.size}',1)">+</button>
        </div>
        <p class="remove-btn" onclick="removeFromCart(${item.id},'${item.size}')">Remove</p>
      </div>
    </div>
  `).join('');
}

function toggleCart() {
  const sidebar = document.getElementById('cartSidebar');
  const overlay = document.getElementById('cartOverlay');
  const isOpen  = sidebar.classList.contains('open');
  closeMobileNav();
  document.getElementById('wishlistSidebar').classList.remove('open');
  document.getElementById('wishlistOverlay').classList.remove('open');
  sidebar.classList.toggle('open', !isOpen);
  overlay.classList.toggle('open', !isOpen);
  document.body.style.overflow = !isOpen ? 'hidden' : '';
  if (!isOpen) renderCartItems();
}

function checkout() {
  toast('Redirecting to checkout…', 'info');
  setTimeout(() => {
    cart = [];
    persist('lamar_cart', cart);
    updateBadges();
    renderCartItems();
    toggleCart();
    toast('Thank you for shopping with Lamar! 🎉', 'success');
  }, CHECKOUT_DELAY);
}

/* ─── WISHLIST ─── */
function toggleWishlistItem(id) {
  const idx = wishlist.findIndex(w => w.id === id);
  if (idx >= 0) {
    wishlist.splice(idx, 1);
    toast('Removed from wishlist', 'info');
  } else {
    wishlist.push(products.find(p => p.id === id));
    toast('♥ Added to wishlist', 'info');
  }
  persist('lamar_wishlist', wishlist);
  updateBadges();
  renderWishlistItems();

  /* patch only the affected product card's heart — avoid full grid re-render */
  const card = document.getElementById(`product-${id}`);
  if (card) {
    const btn = card.querySelector('.wishlist-toggle');
    const svg = btn?.querySelector('svg');
    const inWishlist = wishlist.some(w => w.id === id);
    btn?.classList.toggle('active', inWishlist);
    if (svg) svg.setAttribute('fill', inWishlist ? 'currentColor' : 'none');
  }
}

function renderWishlistItems() {
  const container = document.getElementById('wishlistItems');
  document.getElementById('wishlistCount').textContent = wishlist.length;

  if (!wishlist.length) {
    container.innerHTML = `
      <div class="cart-empty">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <p>Your wishlist is empty</p>
      </div>`;
    return;
  }

  container.innerHTML = wishlist.map(item => `
    <div class="cart-item">
      <div class="cart-item-img">
        <img src="${item.image}" alt="${item.name}" loading="lazy" />
      </div>
      <div class="cart-item-details">
        <p class="cart-item-name">${item.name}</p>
        <p class="cart-item-price">$${item.price.toFixed(2)}</p>
        <button class="add-to-cart-btn wishlist-atc-btn" onclick="addToCart(${item.id}); toggleWishlist()">
          Add to Cart
        </button>
        <p class="remove-btn" onclick="toggleWishlistItem(${item.id})">Remove</p>
      </div>
    </div>
  `).join('');
}

function toggleWishlist() {
  const sidebar = document.getElementById('wishlistSidebar');
  const overlay = document.getElementById('wishlistOverlay');
  const isOpen  = sidebar.classList.contains('open');
  closeMobileNav();
  document.getElementById('cartSidebar').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('open');
  sidebar.classList.toggle('open', !isOpen);
  overlay.classList.toggle('open', !isOpen);
  document.body.style.overflow = !isOpen ? 'hidden' : '';
  if (!isOpen) renderWishlistItems();
}

/* ─── BADGES ─── */
function updateBadges() {
  const cartTotal = cart.reduce((s, c) => s + c.qty, 0);
  document.getElementById('cartBadge').textContent  = cartTotal;
  document.getElementById('cartCount').textContent  = cartTotal;
  document.getElementById('wishlistBadge').textContent = wishlist.length;
}

/* ─── PRODUCT MODAL ─── */
function openModal(id) {
  const p = products.find(p => p.id === id);
  document.getElementById('modalContent').innerHTML = `
    <div class="modal-img">
      <img src="${p.image}" alt="${p.name}" />
    </div>
    <div class="modal-details">
      <p class="product-brand">${p.brand}</p>
      <p class="product-name">${p.name}</p>
      <div class="product-rating" style="margin:10px 0">
        <span class="stars">${formatStars(p.rating)}</span>
        <span class="rating-count">(${p.reviews.toLocaleString()} reviews)</span>
      </div>
      <div class="product-price">${formatPriceHtml(p)}</div>
      <p class="modal-description">${p.description}</p>
      <div class="size-section">
        <p class="size-label">Size</p>
        <div class="size-options">
          ${sizes.map((s,i) => `<button class="size-btn ${i===2?'active':''}" onclick="selectSize(this)">${s}</button>`).join('')}
        </div>
      </div>
      <button class="modal-add-btn" onclick="addToCartFromModal(${p.id})">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        Add to Cart
      </button>
    </div>
  `;
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('productModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('productModal').classList.remove('open');
  document.body.style.overflow = '';
}

function selectSize(btn) {
  btn.closest('.size-options').querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function addToCartFromModal(id) {
  const activeSize = document.querySelector('#productModal .size-btn.active');
  addToCart(id, activeSize ? activeSize.textContent : 'M');
  closeModal();
}

/* ─── SLIDER ─── */
function initSlider() {
  sliderSlides = [...document.querySelectorAll('.hero-slide')];
  const dotsContainer = document.getElementById('sliderDots');
  dotsContainer.innerHTML = '';
  sliderSlides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', `Slide ${i+1}`);
    dot.onclick = () => { goToSlide(i); resetAutoSlide(); };
    dotsContainer.appendChild(dot);
  });
  sliderDots = [...dotsContainer.querySelectorAll('.dot')];
  startAutoSlide();
}

function goToSlide(idx) {
  if (!sliderSlides.length) return;
  sliderSlides[currentSlide].classList.remove('active');
  sliderDots[currentSlide].classList.remove('active');
  currentSlide = (idx + sliderSlides.length) % sliderSlides.length;
  sliderSlides[currentSlide].classList.add('active');
  sliderDots[currentSlide].classList.add('active');
}

function nextSlide() { goToSlide(currentSlide + 1); resetAutoSlide(); }
function prevSlide() { goToSlide(currentSlide - 1); resetAutoSlide(); }

function startAutoSlide() {
  slideInterval = setInterval(() => goToSlide(currentSlide + 1), SLIDER_INTERVAL);
}
function resetAutoSlide() {
  clearInterval(slideInterval);
  startAutoSlide();
}

/* ─── TOAST ─── */
function toast(message, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ─── NEWSLETTER ─── */
function subscribeEmail(e) {
  e.preventDefault();
  const email = e.target.querySelector('input').value;
  toast(`✓ Subscribed! Check ${email} for your 15% discount code.`, 'success');
  e.target.reset();
}

/* ─── MOBILE NAV ─── */
function closeMobileNav() {
  const nav = document.getElementById('mobileNav');
  const overlay = document.getElementById('mobileNavOverlay');
  const btn = document.getElementById('hamburger');
  nav.classList.remove('open');
  overlay.classList.remove('open');
  btn.classList.remove('open');
  btn.setAttribute('aria-expanded', 'false');
  nav.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function toggleMobileNav() {
  const nav = document.getElementById('mobileNav');
  if (nav.classList.contains('open')) { closeMobileNav(); return; }
  const overlay = document.getElementById('mobileNavOverlay');
  const btn = document.getElementById('hamburger');
  nav.classList.add('open');
  overlay.classList.add('open');
  btn.classList.add('open');
  btn.setAttribute('aria-expanded', 'true');
  nav.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

/* ─── MOBILE SEARCH ─── */
function toggleMobileSearch() {
  const drawer = document.getElementById('mobileSearchDrawer');
  const opening = !drawer.classList.contains('open');
  drawer.classList.toggle('open', opening);
  if (opening) requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('mobileSearchInput').focus()));
}

function handleMobileSearch() {
  const q = document.getElementById('mobileSearchInput').value.trim();
  document.getElementById('searchInput').value = q;
  handleSearch();
  document.getElementById('mobileSearchDrawer').classList.remove('open');
}

/* ─── KEYBOARD ESC ─── */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeModal();
  closeMobileNav();
  document.getElementById('mobileSearchDrawer').classList.remove('open');
  document.getElementById('cartSidebar').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('open');
  document.getElementById('wishlistSidebar').classList.remove('open');
  document.getElementById('wishlistOverlay').classList.remove('open');
  document.body.style.overflow = '';
});
