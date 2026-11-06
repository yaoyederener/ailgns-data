// 最小的 Service Worker：只为了让安卓 Chrome / Edge / 三星浏览器出现「一键安装到桌面」。
// 不缓存任何东西：页面照常从网络拿最新版；只有断网时给一个提示页，免得白屏。
var SHELL = ["/app", "/app-shell.js?v=2", "/icons/wallets/okx.png?v=1", "/icons/wallets/bitget.png?v=1", "/icons/wallets/tokenpocket.png?v=1", "/icons/wallets/imtoken.png?v=1", "/icons/wallets/metamask.png?v=1", "/icons/otc-group-qr.png?v=1", "/favicon.png?v=hx2"]; // App 壳页：缓存起来，网站全被封也能打开（联系方式、备用网址）
self.addEventListener("install", function (e) { self.skipWaiting(); e.waitUntil(caches.open("shell-v5").then(function (c) { return c.addAll(SHELL).catch(function () {}); })); });
self.addEventListener("activate", function (e) { e.waitUntil(Promise.all([self.clients.claim(), caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== "shell-v5"; }).map(function (k) { return caches.delete(k); })); })])); });
self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  if (u.origin === location.origin && (u.pathname === "/app" || u.pathname === "/app.html" || u.pathname === "/app-shell.js" || u.pathname.indexOf("/icons/wallets/") === 0 || u.pathname === "/icons/otc-group-qr.png" || u.pathname === "/favicon.png")) {
    // 壳页：先走网络（4 秒内没回来或离线就用缓存），拿到新版顺手更新缓存——既能离线打开，又不会卡在旧版
    e.respondWith(caches.open("shell-v5").then(function (c) {
      var timeout = new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, 4000); });
      return Promise.race([fetch(e.request), timeout]).then(function (r) { if (r && r.ok) c.put(e.request, r.clone()); return r; }).catch(function () { return c.match(e.request, { ignoreSearch: true }).then(function (hit) { return hit || fetch(e.request); }); });
    }));
    return;
  }
  if (e.request.mode !== "navigate") return; // 脚本、图片、接口都不管，浏览器自己处理
  e.respondWith(fetch(e.request).catch(function () {
    return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AiLGNS</title>' +
      '<body style="font-family:system-ui;text-align:center;padding:60px 20px;color:#191839"><h2>网络断开了</h2><p>请检查网络后重新打开 AiLGNS</p><button onclick="location.reload()" style="padding:10px 24px;border-radius:12px;border:0;background:#7027d9;color:#fff;font-size:16px">重试</button></body>',
      { headers: { "content-type": "text/html; charset=utf-8" } });
  }));
});

// 🔔 推送：收到就弹系统通知；点了打开对应页面
self.addEventListener("push", function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { t: "AiLGNS 新消息", b: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.t || "AiLGNS 新消息", { body: d.b || "", icon: "/favicon.png?v=hx2", badge: "/favicon.png?v=hx2", data: { u: d.u || "/#/inbox" }, tag: d.tag || ("ib-" + Date.now()) }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var u = (e.notification.data && e.notification.data.u) || "/#/inbox";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) { if ("focus" in cs[i]) { cs[i].navigate && cs[i].navigate(u); return cs[i].focus(); } }
    return self.clients.openWindow(u);
  }));
});
