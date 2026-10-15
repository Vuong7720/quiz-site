// Service worker: cho phép mở trang và làm lại các bài đã từng mở khi mất mạng.
// Chiến lược "mạng trước": luôn lấy bản mới nhất khi có mạng, chỉ dùng bản lưu khi mất mạng
// → không bao giờ bị kẹt ở phiên bản cũ sau khi cập nhật trang.
const CACHE = 'quiz-site-v1';
const CORE = [
  './', 'index.html', 'play.html', 'series.html', 'results.html',
  'style.css', 'quiz.css', 'theme.js', 'common.js', 'crypto.js', 'history.js', 'quiz-engine.js',
  'favicon.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'exams.json',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('quiz-site-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return; // GitHub API và các trang khác: không can thiệp
  if (sameOrigin && url.pathname.endsWith('/sw.js')) return;

  // Bỏ phần ?... khi lưu (play.html?e=..., exams.json?t=...) để dùng chung một bản lưu
  const key = sameOrigin ? url.origin + url.pathname : req.url;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(key, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      const hit = await cache.match(key) || (url.pathname.endsWith('/') ? await cache.match(url.origin + url.pathname + 'index.html') : null);
      if (hit) return hit;
      if (req.mode === 'navigate') {
        return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<body style="font-family:system-ui;text-align:center;padding:60px 16px"><div style="font-size:48px">📡</div>' +
          '<h2>Không có kết nối mạng</h2><p>Trang này chưa được lưu để dùng offline. Hãy kết nối mạng và thử lại.</p>' +
          '<p><a href="./index.html">Về trang chủ</a></p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      throw err;
    }
  })());
});
