/* ============================================================
   Minik Adımlar · sw.js
   Cache-first service worker: HTML ve varlıklar aynı sürüm önbelleğinden
   sunulur (atomik sürüm). Güncelleme akışı: yeni sw.js bulununca yeni
   önbellek kurulur → skipWaiting + claim → sayfa controllerchange ile
   kendini bir kez tazeler → yeni sürüm. Kullanıcı müdahalesi gerekmez.
   ============================================================ */
/* Sürüm notu: app.js / style.css / translations.js değişirse bu adımı
   güncelle — aksi halde eski önbellek yeni kullanıcılara ulaşmaz. */
const CACHE = "minik-adimlar-v3.5.0";

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./translations.js",
  "./app.js",
  "./manifest.json",
  "./icon.svg",
  "./fonts/inter-latin.woff2",
  "./fonts/inter-latin-ext.woff2",
  "./fonts/bagel-latin.woff2",
  "./fonts/bagel-latin-ext.woff2",
  "./social-preview.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // HTML dahil tüm istekler cache-first: sayfa her zaman TEK bir sürümün
  // bütününü görür — "yeni HTML + eski app.js" karışımı yaşanmaz.
  // Eşleşme YALNIZ bu sürümün adlandırılmış önbelleğinde yapılır;
  // çevrimdışı da aynı şekilde çalışır.
  event.respondWith(
    caches.open(CACHE).then((c) => c.match(req)).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          if (!res || res.status !== 200 || res.type !== "basic") return res;
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.open(CACHE).then((c) => c.match("./index.html")));
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
