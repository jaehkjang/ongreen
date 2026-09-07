// ============================================================
// sw.js — 서비스 워커 (캐시 없음 · 통과만 함)
//
// 왜 필요한가:
//   안드로이드 크롬은 manifest 만 있고 서비스 워커가 없으면 홈 화면 추가를
//   "진짜 앱 설치(WebAPK)"가 아니라 단순 북마크 바로가기로 처리한다.
//   그러면 아이콘 구석에 크롬 배지가 붙고 주소창이 있는 브라우저로 열린다.
//   설치로 인식되려면 fetch 핸들러를 가진 서비스 워커가 등록돼 있어야 한다.
//
// ⚠️ 캐시는 절대 하지 않는다:
//   예전 캐싱 SW 가 GitHub Pages 재배포 순간의 404
//   ("There isn't a GitHub Pages site here") 를 계속 물고 있어 폐기했던
//   이력이 있다. 여기서는 요청을 저장하지 않고 네트워크로 그대로 흘려보내
//   그 문제가 구조적으로 생길 수 없게 한다. (같은 이유로 자매 앱 DKMK 도
//   동일한 통과형 SW 를 쓴다.) 여기에 캐시 로직을 절대 추가하지 마세요.
// ============================================================

self.addEventListener('install', () => self.skipWaiting());          // 새 워커 즉시 활성화

self.addEventListener('activate', e => e.waitUntil((async () => {
  // 옛 캐싱 SW 가 남긴 캐시가 있으면 여기서 마저 비운다(한 번만 의미 있음)
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  } catch (_) {}
  try { await self.clients.claim(); } catch (_) {}
})()));

// 저장하지 않고 그대로 통과 — 설치 조건을 만족시키기 위한 최소 핸들러
self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));
