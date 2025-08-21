const CACHE_NAME = "gudang-bandung-raya-cache-v5";
const STATIC_CACHE_URLS = [
  // Core App Shell
  "index.html",
  "katalog.html",
  "keranjang.html",
  "invoice.html",
  "manifest.json",

  // CSS
  "css/style.css",
  "css/print.css",

  // Main JS
  "js/auth.js",
  "js/config.js",
  "js/utils.js",
  "js/katalog.js",
  "js/keranjang.js",
  "js/invoice.js",

  // Admin App Shell & JS
  "js/admin/admin.html",
  "js/admin/app.js",
  "js/admin/analytics.js",
  "js/admin/animations.js",
  "js/admin/autocomplete.js",
  "js/admin/barangMasuk.js",
  "js/admin/dashboard.js",
  "js/admin/masterProduk.js",
  "js/admin/navigationManager.js",
  "js/admin/print-utils.js",
  "js/admin/renderer.js",
  "js/admin/security.js",
  "js/admin/state.js",
  "js/admin/transactions.js",
  "js/admin/uploadManager.js",
  "js/admin/userManagement.js",
  "js/admin/vendorManagement.js",

  // Vendor Libraries (jika ada, tambahkan di sini)
  // Contoh: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css'
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_CACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET" || request.url.includes("supabase.co")) {
    event.respondWith(fetch(request));
    return;
  }
  if (STATIC_CACHE_URLS.some((url) => request.url.endsWith(url))) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchedResponse = fetch(request).then((networkResponse) => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
          return cachedResponse || fetchedResponse;
        });
      })
    );
    return;
  }
  event.respondWith(
    fetch(request)
      .then((response) => {
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-offline-requests") {
    event.waitUntil(syncOfflineRequests());
  }
});

// Fungsi untuk membuka IndexedDB di dalam Service Worker
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("gudang-offline-queue", 1);
    request.onerror = () => reject("Error opening DB in SW.");
    request.onsuccess = (e) => resolve(e.target.result);
  });
}

async function syncOfflineRequests() {
  try {
    const db = await openDB();
    const transaction = db.transaction("requests", "readwrite");
    const store = transaction.objectStore("requests");
    const requests = await new Promise(
      (resolve) => (store.getAll().onsuccess = (e) => resolve(e.target.result))
    );

    if (requests.length === 0) {
      return;
    }

    for (const req of requests) {
      try {
        // Body perlu di-stringify lagi karena disimpan sebagai objek di IndexedDB
        req.options.body = JSON.stringify(req.options.body);
        const response = await fetch(req.url, req.options);

        if (response.ok) {
          store.delete(req.id);
        } else {
          // Jika server menolak (misal, stok habis), hapus dari antrean agar tidak dicoba terus-menerus.
          console.error(
            `Request ${req.id} failed with status ${response.status}. Deleting from queue.`
          );
          store.delete(req.id);
        }
      } catch (error) {
        console.error(`Still offline. Request ${req.id} remains in queue.`);
        throw new Error("Network error during sync, will retry later.");
      }
    }
    self.registration.showNotification("Aplikasi Kembali Online", {
      body: "Semua data yang tersimpan saat offline berhasil dikirim ke server.",
      icon: "icons/icon-192x192.png", // Pastikan path icon ini benar
    });
  } catch (error) {
    console.error("[Service Worker] Sync failed:", error.message);
  }
}

