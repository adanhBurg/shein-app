(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyAFPXsKZXBGBIdRPWcNCTGdGFc2HJXIKpI",
    authDomain: "shein-app-e920b.firebaseapp.com",
    projectId: "shein-app-e920b",
    storageBucket: "shein-app-e920b.firebasestorage.app",
    messagingSenderId: "37993280",
    appId: "1:37993280:web:e271916d4ee0b5afeed8a5",
  };

  const STORE_COLLECTION_NAME = "stores";
  const ORDER_COLLECTION_NAME = "orders";
  const LEGACY_MIGRATION_KEY_PREFIX = "lamar_firestore_orders_migrated";
  const FIREBASE_VERSION = "12.7.0";
  const SUPER_ADMIN_EMAIL = "saidhnad7@gmail.com";

  function sanitizeStoreSlug(value) {
    const slug = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    return slug || "fadwa";
  }

  function getIsLocalHost() {
    const host = window.location.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  }

  function getTenantRoute() {
    const segments = window.location.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    const validPages = new Set(["orders", "admin"]);
    const reservedPrefixes = ["index", "owner", "admin", "shein-order", "assets", "style.css", "script.js"];

    if (!segments.length) return null;
    if (reservedPrefixes.some((prefix) => segments[0].startsWith(prefix))) return null;

    const hasStorePrefix = segments[0] === "store";
    const slugSegment = hasStorePrefix ? segments[1] : segments[0];
    const pageSegment = hasStorePrefix ? segments[2] : segments[1];

    if (!slugSegment || !pageSegment || !validPages.has(pageSegment)) return null;
    if (segments.length !== (hasStorePrefix ? 3 : 2)) return null;

    return {
      slug: sanitizeStoreSlug(slugSegment),
      page: pageSegment,
    };
  }

  function getPathStoreSlug() {
    const route = getTenantRoute();
    return route ? route.slug : null;
  }

  function getLocalQueryStoreSlug() {
    if (!getIsLocalHost()) return null;

    const params = new URLSearchParams(window.location.search);
    const queryStore = params.get("store");
    return queryStore ? sanitizeStoreSlug(queryStore) : null;
  }

  function resolveStoreSlug() {
    const pathStore = getPathStoreSlug();
    if (pathStore) return pathStore;

    const localQueryStore = getLocalQueryStoreSlug();
    if (localQueryStore) return localQueryStore;

    return sanitizeStoreSlug(localStorage.getItem("lamar_store_slug") || "fadwa");
  }

  function getUrlStoreSlug() {
    const pathStore = getPathStoreSlug();
    if (pathStore) return pathStore;

    return getLocalQueryStoreSlug();
  }

  function buildStoreLinks(value) {
    const slug = sanitizeStoreSlug(value);
    const origin = window.location.origin;
    const localStoreParam = encodeURIComponent(slug);

    if (getIsLocalHost()) {
      return {
        order: `${origin}/shein-order.html?store=${localStoreParam}`,
        admin: `${origin}/admin.html?store=${localStoreParam}`,
      };
    }

    return {
      order: `${origin}/${slug}/orders`,
      admin: `${origin}/${slug}/admin`,
    };
  }

  function normalizeTenantPage(path = "") {
    const normalizedPath = String(path || "").replace(/^\/+/, "").replace(/\.html$/i, "");
    if (!normalizedPath || normalizedPath === "shein-order" || normalizedPath === "order") return "orders";
    if (normalizedPath === "admin") return "admin";
    return normalizedPath;
  }

  function buildTenantPath(path = "") {
    const page = normalizeTenantPage(path);
    if (getIsLocalHost()) {
      const fileName = page === "admin" ? "admin.html" : "shein-order.html";
      return `/${fileName}?store=${encodeURIComponent(storeSlug)}`;
    }

    return `/${storeSlug}/${page}`;
  }

  const tenantRoute = getTenantRoute();
  const storeSlug = resolveStoreSlug();
  const urlStoreSlug = getUrlStoreSlug();
  const tenantOrdersStorageKey = `lamar_orders_${storeSlug}`;
  const legacyMigrationKey = `${LEGACY_MIGRATION_KEY_PREFIX}_${storeSlug}`;

  localStorage.setItem("lamar_store_slug", storeSlug);
  window.LamarStore = {
    slug: storeSlug,
    urlSlug: urlStoreSlug,
    hasUrlStore: Boolean(urlStoreSlug),
    routePage: tenantRoute?.page || null,
    hasValidOrderRoute: tenantRoute?.page === "orders" || Boolean(getLocalQueryStoreSlug()),
    hasValidAdminRoute: tenantRoute?.page === "admin" || Boolean(getLocalQueryStoreSlug()),
    ordersStorageKey: tenantOrdersStorageKey,
    buildLinks: buildStoreLinks,
    tenantPath: buildTenantPath,
    sanitizeSlug: sanitizeStoreSlug,
  };

  function normalizePlatform(platform) {
    return ["shein", "sheinPlus", "marketplace", "marketplacePlus"].includes(platform)
      ? platform
      : null;
  }

  function normalizePricingItems(value) {
    if (!Array.isArray(value)) return [];

    return value.map((item) => ({
      price: typeof item?.price === "string" ? item.price : "",
      platform: normalizePlatform(item?.platform),
    }));
  }

  function normalizeStatus(status) {
    return status === "done" ? "done" : "pending";
  }

  function serializeOrder(order) {
    return {
      name: String(order.name || "").trim(),
      phone: String(order.phone || "").trim(),
      link: String(order.link || "").trim(),
      status: normalizeStatus(order.status),
      time: typeof order.time === "string" ? order.time : new Date().toISOString(),
      submittedByName: order.submittedByName ? String(order.submittedByName).trim() : null,
      pricing: {
        items: normalizePricingItems(order.pricing?.items),
      },
      images: Array.isArray(order.images)
        ? order.images.filter((image) => typeof image === "string")
        : [],
    };
  }

  function mapOrderDoc(snapshot) {
    const data = snapshot.data() || {};
    const storeId = snapshot.ref.parent.parent ? snapshot.ref.parent.parent.id : storeSlug;

    return {
      id: snapshot.id,
      storeId,
      name: typeof data.name === "string" ? data.name : "",
      phone: typeof data.phone === "string" ? data.phone : "",
      link: typeof data.link === "string" ? data.link : "",
      status: normalizeStatus(data.status),
      time: typeof data.time === "string" ? data.time : new Date().toISOString(),
      submittedByName: typeof data.submittedByName === "string" ? data.submittedByName : undefined,
      pricing: {
        items: normalizePricingItems(data.pricing?.items),
      },
      images: Array.isArray(data.images)
        ? data.images.filter((image) => typeof image === "string")
        : [],
    };
  }

  async function loadFirebase() {
    const [appModule, firestoreModule, authModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
    ]);

    const app = appModule.getApps().length
      ? appModule.getApp()
      : appModule.initializeApp(firebaseConfig);
    const db = firestoreModule.getFirestore(app);
    const auth = authModule.getAuth(app);
    const storeRef = firestoreModule.doc(db, STORE_COLLECTION_NAME, storeSlug);
    const ordersCollection = firestoreModule.collection(
      db,
      STORE_COLLECTION_NAME,
      storeSlug,
      ORDER_COLLECTION_NAME,
    );

    function isSuperAdminUser(user = auth.currentUser) {
      return Boolean(user && String(user.email || "").toLowerCase() === SUPER_ADMIN_EMAIL);
    }

    async function createOrder(input) {
      const order = serializeOrder({
        name: input.name,
        phone: input.phone,
        link: input.link,
        submittedByName: input.submittedByName,
        status: "pending",
        time: new Date().toISOString(),
        pricing: { items: [] },
        images: [],
      });

      const ref = await firestoreModule.addDoc(ordersCollection, order);
      return { id: ref.id, ...order };
    }

    function subscribeToOrders(onChange, onError) {
      const ordersQuery = firestoreModule.query(
        ordersCollection,
        firestoreModule.orderBy("time", "desc"),
      );

      return firestoreModule.onSnapshot(
        ordersQuery,
        (snapshot) => onChange(snapshot.docs.map(mapOrderDoc)),
        (error) => onError?.(error),
      );
    }

    function subscribeToStores(onChange, onError) {
      return firestoreModule.onSnapshot(
        firestoreModule.collection(db, STORE_COLLECTION_NAME),
        (snapshot) => onChange(snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        }))),
        (error) => onError?.(error),
      );
    }

    function subscribeToAllOrders(onChange, onError) {
      const storeOrderUnsubscribers = new Map();
      const ordersByStore = new Map();

      function emitAllOrders() {
        const allOrders = Array.from(ordersByStore.values())
          .flat()
          .sort((a, b) => String(b.time || "").localeCompare(String(a.time || "")));
        onChange(allOrders);
      }

      const unsubscribeStores = firestoreModule.onSnapshot(
        firestoreModule.collection(db, STORE_COLLECTION_NAME),
        (snapshot) => {
          const liveStoreIds = new Set(snapshot.docs.map((docSnapshot) => docSnapshot.id));

          Array.from(storeOrderUnsubscribers.keys()).forEach((storeId) => {
            if (!liveStoreIds.has(storeId)) {
              storeOrderUnsubscribers.get(storeId)?.();
              storeOrderUnsubscribers.delete(storeId);
              ordersByStore.delete(storeId);
            }
          });

          snapshot.docs.forEach((docSnapshot) => {
            const currentStoreId = docSnapshot.id;
            if (storeOrderUnsubscribers.has(currentStoreId)) return;

            const storeOrdersQuery = firestoreModule.query(
              firestoreModule.collection(db, STORE_COLLECTION_NAME, currentStoreId, ORDER_COLLECTION_NAME),
              firestoreModule.orderBy("time", "desc"),
            );

            const unsubscribeStoreOrders = firestoreModule.onSnapshot(
              storeOrdersQuery,
              (ordersSnapshot) => {
                ordersByStore.set(currentStoreId, ordersSnapshot.docs.map(mapOrderDoc));
                emitAllOrders();
              },
              (error) => onError?.(error),
            );

            storeOrderUnsubscribers.set(currentStoreId, unsubscribeStoreOrders);
          });

          emitAllOrders();
        },
        (error) => onError?.(error),
      );

      return () => {
        unsubscribeStores();
        storeOrderUnsubscribers.forEach((unsubscribe) => unsubscribe());
        storeOrderUnsubscribers.clear();
        ordersByStore.clear();
      };
    }

    async function saveOrder(order) {
      await firestoreModule.setDoc(
        firestoreModule.doc(db, STORE_COLLECTION_NAME, storeSlug, ORDER_COLLECTION_NAME, String(order.id)),
        serializeOrder(order),
      );
    }

    async function setOrderStatus(orderId, status) {
      await firestoreModule.updateDoc(
        firestoreModule.doc(db, STORE_COLLECTION_NAME, storeSlug, ORDER_COLLECTION_NAME, String(orderId)),
        { status: normalizeStatus(status) },
      );
    }

    async function deleteOrderById(orderId) {
      await firestoreModule.deleteDoc(
        firestoreModule.doc(db, STORE_COLLECTION_NAME, storeSlug, ORDER_COLLECTION_NAME, String(orderId)),
      );
    }

    async function clearAllOrders(orderIds) {
      const batch = firestoreModule.writeBatch(db);
      orderIds.forEach((orderId) => {
        batch.delete(
          firestoreModule.doc(db, STORE_COLLECTION_NAME, storeSlug, ORDER_COLLECTION_NAME, String(orderId)),
        );
      });
      await batch.commit();
    }

    async function migrateLegacyOrdersIfNeeded() {
      const alreadyMigrated = localStorage.getItem(legacyMigrationKey) === "true";
      const legacyOrders = JSON.parse(localStorage.getItem("lamar_orders") || "[]");

      if (alreadyMigrated || !legacyOrders.length) return;

      const batch = firestoreModule.writeBatch(db);
      legacyOrders.forEach((order) => {
        const legacyId = String(order.id || Date.now());
        batch.set(
          firestoreModule.doc(db, STORE_COLLECTION_NAME, storeSlug, ORDER_COLLECTION_NAME, legacyId),
          serializeOrder(order),
        );
      });
      await batch.commit();
      localStorage.setItem(legacyMigrationKey, "true");
    }

    async function getStore(inputSlug = storeSlug) {
      const slug = sanitizeStoreSlug(inputSlug);
      const ref = firestoreModule.doc(db, STORE_COLLECTION_NAME, slug);
      const storeSnapshot = await firestoreModule.getDoc(ref);
      if (storeSnapshot.exists()) {
        return { id: storeSnapshot.id, ...storeSnapshot.data() };
      }

      return null;
    }

    async function createStore(input) {
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in with Google before creating a store.");

      const slug = sanitizeStoreSlug(input.slug);
      const existingStore = await getStore(slug);

      if (existingStore) {
        if (existingStore.ownerUid === user.uid) {
          return existingStore;
        }

        throw new Error(`The store link "${slug}" is already taken.`);
      }

      const store = {
        slug,
        subdomain: slug,
        ownerUid: user.uid,
        ownerEmail: user.email || null,
        displayName: String(input.displayName || slug).trim(),
        createdAt: firestoreModule.serverTimestamp(),
        updatedAt: firestoreModule.serverTimestamp(),
      };

      await firestoreModule.setDoc(firestoreModule.doc(db, STORE_COLLECTION_NAME, slug), store);
      return { id: slug, ...store };
    }

    async function ensureAdminStore(user) {
      if (!user) throw new Error("A signed-in admin is required to open a store.");

      const store = await getStore(storeSlug);
      if (!store) {
        throw new Error(`Store "${storeSlug}" does not exist yet. Create it from owner setup first.`);
      }

      if (store.ownerUid !== user.uid) {
        throw new Error(`Store "${storeSlug}" is owned by another Google account.`);
      }

      return store;
    }

    async function signInWithGoogle() {
      const provider = new authModule.GoogleAuthProvider();
      provider.addScope("email");
      provider.addScope("profile");
      return authModule.signInWithPopup(auth, provider);
    }

    function signOutAdmin() {
      return authModule.signOut(auth);
    }

    function onAdminAuthStateChanged(callback) {
      return authModule.onAuthStateChanged(auth, callback);
    }

    return {
      auth,
      db,
      storeSlug,
      superAdminEmail: SUPER_ADMIN_EMAIL,
      ordersStorageKey: tenantOrdersStorageKey,
      sanitizeStoreSlug,
      buildStoreLinks,
      getStore,
      createStore,
      createOrder,
      subscribeToOrders,
      subscribeToStores,
      subscribeToAllOrders,
      saveOrder,
      setOrderStatus,
      deleteOrderById,
      clearAllOrders,
      migrateLegacyOrdersIfNeeded,
      ensureAdminStore,
      isSuperAdminUser,
      signInWithGoogle,
      signOutAdmin,
      onAdminAuthStateChanged,
    };
  }

  window.LamarFirebaseReady = loadFirebase();
})();
