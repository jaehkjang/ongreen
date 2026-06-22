// ============================================================
// sw.js — 캐시 방 (서비스 워커)
// 사파리 홈스크린(standalone) 앱이 옛 화면을 캐시해서 새 버전이
// 안 보이는 문제를 해결합니다.
//
// 전략: network-first(네트워크 우선)
//  - 온라인이면 항상 서버에서 최신 자산을 받아 화면을 그립니다(=항상 최신).
//  - 받은 자산은 캐시에 보관해 두었다가, 오프라인일 때만 폴백으로 씁니다.
//  - CACHE_VER 가 바뀌면(=배포할 때마다) 옛 캐시는 모두 비웁니다.
//
// ⚠️ CACHE_VER 는 app.js 의 APP_VERSION 과 같은 값으로 맞춰 주세요.
//    (버전이 바뀌어야 옛 캐시가 정리되고 새 워커가 즉시 교체됩니다.)
// ============================================================

const CACHE_VER = 'v12.2.1';
const CACHE_NAME = 'ongreen-' + CACHE_VER;

// 새 워커가 설치되면 대기하지 않고 바로 활성화 대기열로
self.addEventListener('install', e => { self.skipWaiting(); });

// 활성화: 옛 버전 캐시 삭제 + 즉시 모든 탭/홈스크린 제어
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// fetch 가로채기: 같은 출처(앱 자산)의 GET 요청만 network-first 로 처리.
//  - API 호출(다른 출처: Google Apps Script /exec)은 건드리지 않습니다.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // 외부(API) 요청은 패스

  e.respondWith((async () => {
    try {
      // 네트워크 우선 — HTTP 캐시도 우회해서 항상 새로 받기
      const fresh = await fetch(req, { cache: 'no-store' });
      // 정상 응답이면 캐시에 갱신하고 그대로 반환
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      }
      // ⚠️ 응답은 왔지만 정상이 아님(404/5xx 등).
      //   GitHub Pages 는 재배포되는 짧은 순간 "There isn't a GitHub Pages
      //   site here" 404 를 돌려줍니다. 이때 캐시에 멀쩡한 앱이 있으면
      //   그걸 보여 줘서 배포 중에도 화면이 깨지지 않게 합니다.
      const cachedOk = await caches.match(req);
      if (cachedOk) return cachedOk;
      return fresh;   // 캐시도 없으면 어쩔 수 없이 원본(에러) 응답
    } catch (err) {
      // 오프라인/네트워크 실패 — 캐시로 폴백
      const cached = await caches.match(req);
      if (cached) return cached;
      throw err;
    }
  })());
});
