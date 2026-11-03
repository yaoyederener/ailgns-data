// 最小的 Service Worker：只为了让安卓 Chrome / Edge / 三星浏览器出现「一键安装到桌面」。
// 不缓存任何东西：页面照常从网络拿最新版；只有断网时给一个提示页，免得白屏。
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function (e) {
  if (e.request.mode !== "navigate") return; // 脚本、图片、接口都不管，浏览器自己处理
  e.respondWith(fetch(e.request).catch(function () {
    return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AiLGNS</title>' +
      '<body style="font-family:system-ui;text-align:center;padding:60px 20px;color:#191839"><h2>网络断开了</h2><p>请检查网络后重新打开 AiLGNS</p><button onclick="location.reload()" style="padding:10px 24px;border-radius:12px;border:0;background:#7027d9;color:#fff;font-size:16px">重试</button></body>',
      { headers: { "content-type": "text/html; charset=utf-8" } });
  }));
});
