// Service Worker：① 让安卓 Chrome / Edge / 三星浏览器出现「一键安装到桌面」 ② 推送通知 ③ 秒开缓存。
// 🚀 秒开缓存（站长 2026-11-12「国内打开速度太慢」）：首页和带版本号的 dist 脚本/样式存在手机里，
//   第二次打开直接用存好的，不用等网络；同时在后台悄悄拿最新首页存起来。
//   有新版本时，页面自己的 freshCheck（app.js）会带 ?v=时间戳 重新打开，这里看到就改走网络拿最新版，所以不会卡在旧版。
//   接口（/api/*）和链上数据一律不存，照常走网络。
var PAGE = "page-v1";
function offline() {
  return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AiLGNS</title>' +
    '<body style="font-family:system-ui;text-align:center;padding:60px 20px;color:#191839"><h2>网络断开了</h2><p>请检查网络后重新打开 AiLGNS</p><button onclick="location.reload()" style="padding:10px 24px;border-radius:12px;border:0;background:#7027d9;color:#fff;font-size:16px">重试</button></body>',
    { headers: { "content-type": "text/html; charset=utf-8" } });
}
// 拿到首页就存一份；只存「真的是本站首页」的（200、没被跳转、里面有 dist/core.js），免得把报错页、运营商提示页存下来
function pageSave(p) {
  return p.then(function (r) {
    if (!r || !r.ok || r.redirected || r.type !== "basic" || !/text\/html/.test(r.headers.get("content-type") || "")) return r;
    var cp = r.clone();
    return r.clone().text().then(function (t) {
      if (t.indexOf("dist/core.js?v=") < 0) return r;
      return caches.open(PAGE).then(function (c) { return c.put("/", cp); }).then(function () { return r; });
    }).catch(function () { return r; });
  });
}
var SHELL = ["/app", "/app-shell.js?v=7", "/icons/wallets/okx.png?v=1", "/icons/wallets/bitget.png?v=1", "/icons/wallets/tokenpocket.png?v=1", "/icons/wallets/imtoken.png?v=1", "/icons/wallets/metamask.png?v=1", "/icons/otc-group-qr.png?v=1", "/favicon.png?v=hx2"]; // App 壳页：缓存起来，网站全被封也能打开（联系方式、备用网址）
self.addEventListener("install", function (e) { self.skipWaiting(); e.waitUntil(Promise.all([caches.open("shell-v12").then(function (c) { return c.addAll(SHELL).catch(function () {}); }), pageSave(fetch("/", { cache: "no-store" })).catch(function () {})])); });
self.addEventListener("activate", function (e) { e.waitUntil(Promise.all([self.clients.claim(), caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== "shell-v12" && k !== PAGE; }).map(function (k) { return caches.delete(k); })); })])); });
self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  if (u.origin === location.origin && (u.pathname === "/app" || u.pathname === "/app.html" || u.pathname === "/app-shell.js" || u.pathname.indexOf("/icons/wallets/") === 0 || u.pathname === "/icons/otc-group-qr.png" || u.pathname === "/favicon.png")) {
    // 壳页：先走网络（4 秒内没回来或离线就用缓存），拿到新版顺手更新缓存——既能离线打开，又不会卡在旧版
    e.respondWith(caches.open("shell-v12").then(function (c) {
      var timeout = new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, 8000); }); // 4 秒太短，弱网下老是退回旧缓存（站长 2026-11-09）
      return Promise.race([fetch(e.request), timeout]).then(function (r) { if (r && r.ok) c.put(e.request, r.clone()); return r; }).catch(function () { return c.match(e.request, { ignoreSearch: true }).then(function (hit) { return hit || fetch(e.request); }); });
    }));
    return;
  }
  // 🚀 带版本号的脚本和样式（dist/xxx.js?v=h…）：内容永远不变，手机里有就直接用，没有才下载并存起来
  if (e.request.method === "GET" && u.origin === location.origin && u.pathname.indexOf("/dist/") === 0 && u.searchParams.get("v")) {
    // 🔒 存之前先核版本章（站长 2026-11-13）：发版那几秒 CDN 可能把旧内容发成新版本号，
    //   存下来就永久卡在旧版（preview 实测 misc.js 中招）。章对不上就不存、换地址重下一次；两次都不对照旧放行，但绝不存
    var v = u.searchParams.get("v");
    function stamped(r) {
      if (!r || !r.ok || r.type !== "basic" || !/javascript|css/.test(r.headers.get("content-type") || "")) return Promise.resolve(false);
      return r.clone().text().then(function (t) { return t.indexOf("/*v:" + v + "*/") > -1; }).catch(function () { return false; });
    }
    e.respondWith(caches.open(PAGE).then(function (c) {
      function save(r) {
        // 存新版，顺手把同一个文件的旧版本删掉，不占手机空间
        e.waitUntil(c.put(e.request, r.clone()).then(function () { return c.keys(); }).then(function (ks) {
          return Promise.all(ks.filter(function (k) { var x = new URL(k.url); return x.pathname === u.pathname && x.search !== u.search; }).map(function (k) { return c.delete(k); }));
        }).catch(function () {}));
        return r;
      }
      return c.match(e.request, { ignoreVary: true }).then(function (hit) {
        // 以前存错的（章对不上）：这次照旧给出去，顺手删掉，下次打开就会重新下载正确的
        if (hit) { e.waitUntil(stamped(hit).then(function (ok) { if (!ok) return c.delete(e.request); }).catch(function () {})); return hit; }
        return fetch(e.request).then(function (r) {
          return stamped(r).then(function (ok) {
            if (ok) return save(r);
            return fetch(new Request(e.request.url + "&r=" + Date.now(), { cache: "reload" })).then(function (r2) {
              return stamped(r2).then(function (ok2) { return ok2 ? save(r2) : r; });
            }).catch(function () { return r; });
          });
        });
      });
    }).catch(function () { return fetch(e.request); }));
    return;
  }
  if (e.request.mode !== "navigate") return; // 图片、接口都不管，浏览器自己处理
  // 🚀 首页：手机里有存好的就立刻给（秒开），同时后台拿最新的存起来，下次打开就是新的
  if (u.origin === location.origin && u.pathname === "/") {
    var v = Number(u.searchParams.get("v"));
    // 这三种情况要最新版，改走网络：客户自己下拉刷新；页面发现新版本后带 ?v=刚才的时间 重新打开
    var force = e.request.cache === "reload" || e.request.cache === "no-cache" || (v > 0 && Math.abs(Date.now() - v) < 60000);
    e.respondWith(caches.open(PAGE).then(function (c) { return c.match("/", { ignoreVary: true }); }).catch(function () { return null; }).then(function (hit) {
      if (hit && !force) { e.waitUntil(pageSave(fetch("/", { cache: "no-store" })).catch(function () {})); return hit; }
      var net = pageSave(fetch(e.request)).then(function (r) { if (hit && !(r && r.ok)) return hit; return r; });
      if (!hit) return net.catch(offline);
      var timeout = new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, 8000); }); // 网络太慢就先用存好的，不让客户干等
      return Promise.race([net, timeout]).catch(function () { return hit; });
    }));
    return;
  }
  e.respondWith(fetch(e.request).catch(offline));
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
