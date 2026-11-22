// Cache các file ứng dụng sau lần truy cập đầu để dùng được khi ngoại tuyến.
const CACHE_NAME = "tuvung-android-v1";
const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  // Tải trước giao diện và tài nguyên cốt lõi.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Xóa cache cũ sau khi bản mới đã sẵn sàng.
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Chỉ xử lý yêu cầu GET của chính ứng dụng, tránh đụng vào dữ liệu ngoài.
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Lưu thêm tài nguyên cùng nguồn để các lần sau dùng được khi mất mạng.
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    }).catch(() => caches.match("./index.html"))
  );
});
