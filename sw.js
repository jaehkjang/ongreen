// ============================================================
// sw.js — 서비스 워커 "자동 해제(kill-switch)"
//
// 과거 버전의 서비스 워커가 GitHub Pages 재배포 순간의 404
// ("There isn't a GitHub Pages site here") 를 그대로 노출하는 문제가
// 있어, 서비스 워커 방식을 폐기했습니다.
//
// 한 번 등록된 서비스 워커는 파일을 지운다고 사라지지 않으므로,
// 이 파일은 "자기 자신을 등록 해제하고 모든 캐시를 비우는" 코드로
// 남겨 둡니다. 옛 SW 가 박힌 기기가 한 번만 접속하면 스스로 풀리고,
// 이후로는 SW 없는 순수 정적 사이트로 동작합니다.
//
// ⚠️ fetch 핸들러가 없습니다 — 모든 요청은 네트워크로 그대로 통과합니다.
//    (즉 더 이상 404 를 가로채 노출하지 않습니다.)
// ============================================================

// 새 워커를 곧바로 활성화
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // 1) 모든 캐시 삭제
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (_) {}

    // 2) 자기 자신(서비스 워커) 등록 해제
    try { await self.registration.unregister(); } catch (_) {}

    // 3) 제어 중이던 모든 탭/홈스크린 앱을 새로고침 →
    //    SW 가 사라진 깨끗한 상태로 다시 로드
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(c => c.navigate(c.url));
    } catch (_) {}
  })());
});
