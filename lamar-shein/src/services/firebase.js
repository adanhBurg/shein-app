import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

export const SUPER_ADMIN_EMAIL = 'hnadamohamed18@gmail.com';

const firebaseConfig = {
  apiKey: 'AIzaSyAFPXsKZXBGBIdRPWcNCTGdGFc2HJXIKpI',
  authDomain: 'shein-app-e920b.firebaseapp.com',
  projectId: 'shein-app-e920b',
  storageBucket: 'shein-app-e920b.firebasestorage.app',
  messagingSenderId: '37993280',
  appId: '1:37993280:web:e271916d4ee0b5afeed8a5',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export function sanitizeStoreSlug(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || 'fadwa';
}

export function isValidStoreSlug(value) {
  return /^[a-z0-9-]{1,80}$/.test(String(value || ''));
}

export function getIsLocalHost() {
  const host = window.location.hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export function getQueryStoreSlug() {
  const queryStore = new URLSearchParams(window.location.search).get('store');
  return queryStore ? sanitizeStoreSlug(queryStore) : null;
}

export function resolveRouteStoreSlug(routeStore) {
  const slug = routeStore || getQueryStoreSlug() || localStorage.getItem('lamar_store_slug') || 'fadwa';
  const sanitized = sanitizeStoreSlug(slug);
  localStorage.setItem('lamar_store_slug', sanitized);
  return sanitized;
}

export function buildStoreLinks(value) {
  const slug = sanitizeStoreSlug(value);
  const origin = window.location.origin;

  if (getIsLocalHost()) {
    return {
      order: `${origin}/shein-order.html?store=${encodeURIComponent(slug)}`,
      admin: `${origin}/admin.html?store=${encodeURIComponent(slug)}`,
    };
  }

  return {
    order: `${origin}/${slug}/orders`,
    admin: `${origin}/${slug}/admin`,
  };
}

function normalizePlatform(platform) {
  return ['shein', 'sheinPlus', 'marketplace', 'marketplacePlus'].includes(platform)
    ? platform
    : null;
}

function normalizePricingItems(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    price: typeof item?.price === 'string' ? item.price : '',
    platform: normalizePlatform(item?.platform),
  }));
}

function normalizeStatus(status) {
  return status === 'done' ? 'done' : 'pending';
}

function serializeOrder(order) {
  return {
    name: String(order.name || '').trim().slice(0, 120),
    phone: String(order.phone || '').trim().slice(0, 40),
    link: String(order.link || '').trim(),
    status: normalizeStatus(order.status),
    time: typeof order.time === 'string' ? order.time : new Date().toISOString(),
    submittedByName: String(order.submittedByName || '').trim(),
    pricing: { items: normalizePricingItems(order.pricing?.items) },
    images: Array.isArray(order.images) ? order.images.filter((image) => typeof image === 'string') : [],
  };
}

function mapOrderDoc(snapshot) {
  const data = snapshot.data() || {};
  const storeId = snapshot.ref.parent.parent?.id;
  return {
    id: snapshot.id,
    storeId,
    store: storeId,
    name: typeof data.name === 'string' ? data.name : '',
    phone: typeof data.phone === 'string' ? data.phone : '',
    link: typeof data.link === 'string' ? data.link : '',
    status: normalizeStatus(data.status),
    time: typeof data.time === 'string' ? data.time : new Date().toISOString(),
    submittedByName: typeof data.submittedByName === 'string' ? data.submittedByName : '',
    pricing: { items: normalizePricingItems(data.pricing?.items) },
    images: Array.isArray(data.images) ? data.images.filter((image) => typeof image === 'string') : [],
  };
}

export function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  return signInWithPopup(auth, provider);
}

export function signOutGoogle() {
  return signOut(auth);
}

export function listenAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function isSuperAdminUser(user = auth.currentUser) {
  return Boolean(user && String(user.email || '').toLowerCase() === SUPER_ADMIN_EMAIL);
}

export async function getStore(inputSlug) {
  const slug = sanitizeStoreSlug(inputSlug);
  const snapshot = await getDoc(doc(db, 'stores', slug));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function createStore({ slug: inputSlug, displayName }) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in with Google before creating a store.');

  const slug = sanitizeStoreSlug(inputSlug || displayName);
  const existing = await getStore(slug);

  if (existing) {
    if (existing.ownerUid === user.uid) return existing;
    throw new Error(`The store link "${slug}" is already taken.`);
  }

  const store = {
    slug,
    subdomain: slug,
    ownerUid: user.uid,
    ownerEmail: user.email || null,
    displayName: String(displayName || slug).trim().slice(0, 120),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'stores', slug), store);
  return { id: slug, ...store };
}

export async function ensureOwnerStore(storeSlug, user = auth.currentUser) {
  if (!user) throw new Error('A signed-in admin is required to open a store.');
  const store = await getStore(storeSlug);
  if (!store) throw new Error(`Store "${storeSlug}" does not exist yet. Create it from owner setup first.`);
  if (store.ownerUid !== user.uid) throw new Error(`Store "${storeSlug}" is owned by another Google account.`);
  return store;
}

export async function createOrder(storeSlug, input) {
  const normalizedLink = String(input.link || '').match(/^https?:\/\//i)
    ? String(input.link || '').trim()
    : `https://${String(input.link || '').trim()}`;
  const order = serializeOrder({
    name: input.name,
    phone: input.phone,
    link: normalizedLink,
    submittedByName: input.submittedByName,
    status: 'pending',
    time: new Date().toISOString(),
    pricing: { items: [] },
    images: [],
  });

  const ref = await addDoc(collection(db, 'stores', sanitizeStoreSlug(storeSlug), 'orders'), order);
  return { id: ref.id, storeId: sanitizeStoreSlug(storeSlug), ...order };
}

export function subscribeToOrders(storeSlug, onChange, onError) {
  const ordersQuery = query(
    collection(db, 'stores', sanitizeStoreSlug(storeSlug), 'orders'),
    orderBy('time', 'desc'),
  );

  return onSnapshot(
    ordersQuery,
    (snapshot) => onChange(snapshot.docs.map(mapOrderDoc)),
    (error) => onError?.(error),
  );
}

export function subscribeToStores(onChange, onError) {
  return onSnapshot(
    collection(db, 'stores'),
    (snapshot) => onChange(snapshot.docs.map((storeDoc) => ({ id: storeDoc.id, ...storeDoc.data() }))),
    (error) => onError?.(error),
  );
}

export function subscribeToAllOrders(onChange, onError) {
  const ordersQuery = query(collectionGroup(db, 'orders'), orderBy('time', 'desc'));
  return onSnapshot(
    ordersQuery,
    (snapshot) => onChange(snapshot.docs.map(mapOrderDoc)),
    (error) => onError?.(error),
  );
}

export async function saveOrder(storeSlug, order) {
  await setDoc(
    doc(db, 'stores', sanitizeStoreSlug(storeSlug), 'orders', String(order.id)),
    serializeOrder(order),
  );
}

export async function setOrderStatus(storeSlug, orderId, status) {
  await updateDoc(
    doc(db, 'stores', sanitizeStoreSlug(storeSlug), 'orders', String(orderId)),
    { status: normalizeStatus(status) },
  );
}

export async function deleteOrderById(storeSlug, orderId) {
  await deleteDoc(doc(db, 'stores', sanitizeStoreSlug(storeSlug), 'orders', String(orderId)));
}

export async function clearAllOrders(storeSlug, orderIds) {
  const batch = writeBatch(db);
  orderIds.forEach((orderId) => {
    batch.delete(doc(db, 'stores', sanitizeStoreSlug(storeSlug), 'orders', String(orderId)));
  });
  await batch.commit();
}

export async function migrateLegacyOrdersIfNeeded(storeSlug) {
  const slug = sanitizeStoreSlug(storeSlug);
  const migrationKey = `lamar_firestore_orders_migrated_${slug}`;
  if (localStorage.getItem(migrationKey) === 'true') return;

  const legacyOrders = JSON.parse(localStorage.getItem('lamar_orders') || '[]');
  if (!Array.isArray(legacyOrders) || !legacyOrders.length) {
    localStorage.setItem(migrationKey, 'true');
    return;
  }

  const batch = writeBatch(db);
  legacyOrders.forEach((order) => {
    const id = String(order.id || crypto.randomUUID());
    batch.set(doc(db, 'stores', slug, 'orders', id), serializeOrder(order));
  });
  await batch.commit();
  localStorage.setItem(migrationKey, 'true');
}
