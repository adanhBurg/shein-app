import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import logoImg from '../assets/logo.jpeg';

const PRODUCTS = [
  { id:1, name:'فستان رابط بالورود', brand:'Lamar Studio', category:'فساتين', price:38.99, original:64.99, discount:40, rating:4.8, badge:'sale', color:'#f8d7da', emoji:'👗' },
  { id:2, name:'طقم كتان كاجوال', brand:'Lamar Studio', category:'نساء', price:52.00, original:52.00, discount:0, rating:4.5, badge:'new', color:'#e8f5e9', emoji:'👚' },
  { id:3, name:'حقيبة جلدية صغيرة', brand:'Lamar Bags', category:'حقائب', price:29.50, original:49.00, discount:40, rating:4.9, badge:'hot', color:'#fff3e0', emoji:'👜' },
  { id:4, name:'صندل صيفي أنيق', brand:'Lamar Shoes', category:'أحذية', price:22.00, original:35.00, discount:37, rating:4.3, badge:'sale', color:'#f3e5f5', emoji:'👡' },
  { id:5, name:'بلوزة مطرزة فاخرة', brand:'Lamar Studio', category:'نساء', price:45.00, original:45.00, discount:0, rating:4.7, badge:'new', color:'#e3f2fd', emoji:'👕' },
  { id:6, name:'كارديغان محبوك', brand:'Lamar Studio', category:'نساء', price:61.00, original:85.00, discount:28, rating:4.6, badge:'sale', color:'#fce4ec', emoji:'🧥' },
  { id:7, name:'حذاء رياضي أبيض', brand:'Lamar Shoes', category:'أحذية', price:55.00, original:55.00, discount:0, rating:4.4, badge:'hot', color:'#f5f5f5', emoji:'👟' },
  { id:8, name:'حقيبة سفر كبيرة', brand:'Lamar Bags', category:'حقائب', price:89.00, original:120.00, discount:26, rating:4.8, badge:'sale', color:'#e8eaf6', emoji:'🧳' },
  { id:9, name:'فستان سهرة ذهبي', brand:'Lamar Studio', category:'فساتين', price:95.00, original:150.00, discount:37, rating:4.9, badge:'hot', color:'#fff8e1', emoji:'👘' },
  { id:10, name:'عطر روز وعود', brand:'Lamar Beauty', category:'جمال', price:35.00, original:35.00, discount:0, rating:4.9, badge:'hot', color:'#fce4ec', emoji:'🌹' },
  { id:11, name:'وسادة ديكور مطرزة', brand:'Lamar Home', category:'منزل', price:18.00, original:25.00, discount:28, rating:4.3, badge:'new', color:'#f3e5f5', emoji:'🛋' },
  { id:12, name:'جاكيت جينز كلاسيك', brand:'Lamar Studio', category:'رجال', price:48.00, original:70.00, discount:31, rating:4.2, badge:'sale', color:'#e3f2fd', emoji:'🧢' },
];

const CATEGORIES = ['الكل', 'نساء', 'رجال', 'فساتين', 'أحذية', 'حقائب', 'جمال', 'منزل'];

export default function Storefront() {
  const { theme: T } = useTheme();
  const [activeCategory, setActiveCategory] = useState('الكل');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [cart, setCart] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedSize, setSelectedSize] = useState('M');
  const [visibleCount, setVisibleCount] = useState(8);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [addedToast, setAddedToast] = useState('');

  const filtered = PRODUCTS.filter(p =>
    (activeCategory === 'الكل' || p.category === activeCategory) &&
    (!searchQuery || p.name.includes(searchQuery) || p.brand.includes(searchQuery))
  );
  const visible = filtered.slice(0, visibleCount);

  const addToCart = (product) => {
    setCart(c => {
      const ex = c.find(i => i.id === product.id && i.size === selectedSize);
      return ex ? c.map(i => i.id === product.id && i.size === selectedSize ? { ...i, qty: i.qty + 1 } : i) : [...c, { ...product, size: selectedSize, qty: 1 }];
    });
    setAddedToast(product.name);
    setTimeout(() => setAddedToast(''), 2000);
    setSelectedProduct(null);
  };

  const toggleWishlist = (id) => setWishlist(w => w.includes(id) ? w.filter(i => i !== id) : [...w, id]);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const badgeBg = (b) => b === 'sale' ? '#e05c5c' : b === 'hot' ? T.gold : '#4caf50';

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: 'Tajawal, sans-serif', direction: 'rtl', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Toast */}
      {addedToast && <div style={{ position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 300, background: '#4caf50', color: '#fff', padding: '8px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', animation: 'slideDown 0.3s ease' }}>✓ أُضيف: {addedToast}</div>}

      {/* Header */}
      <div style={{ background: T.card, borderBottom: `1px solid ${T.border}`, position: 'sticky', top: 0, zIndex: 100, boxShadow: `0 1px 8px ${T.shadow}` }}>
        {showSearch ? (
          <div style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: T.text }}>✕</button>
            <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="ابحثي عن منتج..." style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13, fontFamily: 'Tajawal, sans-serif', outline: 'none', direction: 'rtl', textAlign: 'right' }} />
          </div>
        ) : (
          <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={() => setCartOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', fontSize: 20, lineHeight: 1, padding: 0 }}>
                🛒{cartCount > 0 && <span style={{ position: 'absolute', top: -4, left: -4, width: 16, height: 16, borderRadius: '50%', background: T.accent, color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cartCount}</span>}
              </button>
              <button onClick={() => {}} style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', fontSize: 20, lineHeight: 1, padding: 0 }}>
                🤍{wishlist.length > 0 && <span style={{ position: 'absolute', top: -4, left: -4, width: 16, height: 16, borderRadius: '50%', background: T.accent, color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{wishlist.length}</span>}
              </button>
              <button onClick={() => setShowSearch(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 0 }}>🔍</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Lamar</div>
                <div style={{ fontSize: 9, color: T.accent, fontWeight: 700 }}>SHEIN By Fadwa</div>
              </div>
              <img src={logoImg} alt="logo" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${T.accent}` }} />
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, padding: '4px 14px 10px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => { setActiveCategory(cat); setVisibleCount(8); }} style={{ padding: '5px 12px', borderRadius: 20, border: 'none', whiteSpace: 'nowrap', background: activeCategory === cat ? T.accent : T.bg, color: activeCategory === cat ? '#fff' : T.textMuted, fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s' }}>{cat}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, padding: '12px 12px 40px' }}>
        {/* Banner */}
        <div style={{ background: `linear-gradient(135deg, ${T.accent}22, ${T.accentLight})`, borderRadius: 16, padding: '16px 20px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${T.border}` }}>
          <button style={{ background: T.accent, border: 'none', borderRadius: 10, padding: '8px 14px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>تسوقي الآن</button>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>تخفيضات الصيف 🌸</div>
            <div style={{ fontSize: 12, color: T.textMuted }}>خصومات تصل إلى 40%</div>
          </div>
        </div>

        {/* Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {visible.map(product => (
            <div key={product.id} onClick={() => setSelectedProduct(product)} style={{ background: T.card, borderRadius: 14, overflow: 'hidden', boxShadow: `0 2px 8px ${T.shadow}`, cursor: 'pointer', position: 'relative' }}>
              <div style={{ width: '100%', aspectRatio: '4/5', background: product.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, position: 'relative' }}>
                {product.emoji}
                {product.badge && <span style={{ position: 'absolute', top: 8, right: 8, padding: '2px 7px', borderRadius: 6, fontSize: 9, fontWeight: 800, background: badgeBg(product.badge), color: '#fff' }}>{product.badge === 'sale' ? 'خصم' : product.badge === 'hot' ? '🔥' : 'جديد'}</span>}
                <button onClick={e => { e.stopPropagation(); toggleWishlist(product.id); }} style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{wishlist.includes(product.id) ? '❤️' : '🤍'}</button>
              </div>
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text, textAlign: 'right', marginBottom: 2, lineHeight: 1.3 }}>{product.name}</div>
                <div style={{ fontSize: 9, color: T.textMuted, textAlign: 'right', marginBottom: 4 }}>{product.brand}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div><span style={{ fontSize: 13, fontWeight: 800, color: T.accent }}>${product.price}</span>{product.discount > 0 && <span style={{ fontSize: 9, color: T.textMuted, textDecoration: 'line-through', marginRight: 4 }}>${product.original}</span>}</div>
                  <div style={{ fontSize: 9, color: T.textMuted }}>⭐ {product.rating}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {visibleCount < filtered.length && (
          <button onClick={() => setVisibleCount(v => v + 4)} style={{ width: '100%', marginTop: 14, padding: '12px', borderRadius: 12, border: `1.5px solid ${T.border}`, background: 'transparent', color: T.text, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            تحميل المزيد ({filtered.length - visibleCount})
          </button>
        )}

        {/* Newsletter */}
        <div style={{ marginTop: 20, background: `linear-gradient(135deg, ${T.accent}, ${T.accentDark})`, borderRadius: 16, padding: '18px 16px', textAlign: 'center' }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 15, marginBottom: 4 }}>اشتركي في نشرتنا 💌</div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, marginBottom: 12 }}>أول من تعرفين بالعروض</div>
          {subscribed ? <div style={{ color: '#fff', fontWeight: 700 }}>✅ شكراً للاشتراك!</div> : (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { if (newsletterEmail) setSubscribed(true); }} style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: '#fff', color: T.accent, fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>اشتراك</button>
              <input value={newsletterEmail} onChange={e => setNewsletterEmail(e.target.value)} placeholder="بريدك الإلكتروني" style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.25)', color: '#fff', fontSize: 12, fontFamily: 'Tajawal, sans-serif', outline: 'none', direction: 'rtl', textAlign: 'right' }} />
            </div>
          )}
        </div>
      </div>

      {/* Cart Drawer */}
      {cartOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={() => setCartOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: T.card, borderRadius: '24px 24px 0 0', maxHeight: '75%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <button onClick={() => setCartOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: T.textMuted }}>✕</button>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>🛒 السلة ({cartCount})</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cart.length === 0 ? <div style={{ textAlign: 'center', padding: '40px 0', color: T.textMuted }}><div style={{ fontSize: 40, marginBottom: 10 }}>🛒</div>السلة فارغة</div>
                : cart.map(item => (
                  <div key={item.id + item.size} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px', background: T.bg, borderRadius: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{item.emoji}</div>
                    <div style={{ flex: 1, textAlign: 'right' }}><div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{item.name}</div><div style={{ fontSize: 11, color: T.textMuted }}>م. {item.size} · {item.qty}×</div></div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.accent }}>${(item.price * item.qty).toFixed(2)}</div>
                  </div>
                ))}
            </div>
            {cart.length > 0 && (
              <div style={{ padding: '14px 16px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: T.accent }}>${cartTotal.toFixed(2)}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>المجموع</span>
                </div>
                <button onClick={() => { setCart([]); setCartOpen(false); }} style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg, ${T.accent}, ${T.accentDark})`, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: `0 4px 14px ${T.accent}44` }}>إتمام الشراء →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Product Modal */}
      {selectedProduct && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={() => setSelectedProduct(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: T.card, borderRadius: '24px 24px 0 0', maxHeight: '80%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ width: '100%', height: 200, background: selectedProduct.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80, borderRadius: '24px 24px 0 0', flexShrink: 0, position: 'relative' }}>
              {selectedProduct.emoji}
              <button onClick={() => setSelectedProduct(null)} style={{ position: 'absolute', top: 12, left: 14, background: 'rgba(255,255,255,0.8)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
              <div style={{ textAlign: 'right', marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 2 }}>{selectedProduct.brand}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: T.text, marginBottom: 6 }}>{selectedProduct.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'flex-end' }}>
                  {selectedProduct.discount > 0 && <span style={{ fontSize: 13, color: T.textMuted, textDecoration: 'line-through' }}>${selectedProduct.original}</span>}
                  <span style={{ fontSize: 22, fontWeight: 800, color: T.accent }}>${selectedProduct.price}</span>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, textAlign: 'right', marginBottom: 8 }}>اختاري المقاس</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {['XS', 'S', 'M', 'L', 'XL'].map(size => (
                    <button key={size} onClick={() => setSelectedSize(size)} style={{ padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${selectedSize === size ? T.accent : T.border}`, background: selectedSize === size ? T.accentLight : T.bg, color: selectedSize === size ? T.accent : T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{size}</button>
                  ))}
                </div>
              </div>
              <button onClick={() => addToCart(selectedProduct)} style={{ width: '100%', padding: '14px', borderRadius: 13, border: 'none', background: `linear-gradient(135deg, ${T.accent}, ${T.accentDark})`, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: `0 4px 16px ${T.accent}44` }}>
                إضافة إلى السلة 🛒
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
