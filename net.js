// 🚀 全站接口请求层（站长 2026-11-09：「速度优先、真实数据可以慢一点出来、极致丝滑」）
// 只管本站 GET /api/*：
//   1. 先给上次的缓存（Cache API，断网也在），最多等网络 0.35～1.2 秒；网络快就直接给真数据
//   2. 网络失败 / 5xx / 超时自动重试 3 次（0.6s、1.5s 间隔），不再让客户看见「读取失败，请稍后刷新」
//   3. 真数据晚到了就发 ail:fresh 事件（app.js 收到后在刚打开的页面上悄悄重画一次）
// 不碰：POST、钱包 RPC、聊天 / 弹幕 / 埋点这种实时或一次性接口
(function () {
  if (!window.fetch || window.__ailNet) return; window.__ailNet = 1;
  var real = window.fetch.bind(window), mem = {};
  var cp = (window.caches && caches.open) ? caches.open("api-v1").catch(function () { return null; }) : Promise.resolve(null);
  var SKIP = /^\/api\/(hit|chat|chat-reply|danmaku|feedback|debox-bot|push|inbox-ack|name-check|reg-order|batch-mark)/; // 实时 / 一次性 / 决定能不能注册的，不走缓存
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function attempt(input, init, n) {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null, o = {}, k;
    for (k in init) o[k] = init[k];
    if (ctl && !o.signal) o.signal = ctl.signal;
    var t = ctl && setTimeout(function () { ctl.abort(); }, [10000, 15000, 20000][n] || 20000); // 网络慢时别 5 秒就掐断（Cloudflare 北美东部 2026-11-09 变慢，接口要 3～8 秒）：有缓存的反正 1.2 秒就先给了
    return real(input, o).then(function (r) { clearTimeout(t); if (r.status >= 500 || r.status === 429) throw new Error("http " + r.status); return r; }, function (e) { clearTimeout(t); throw e; });
  }
  function store(key, r) {
    try {
      var ct = r.headers.get("content-type") || "application/json";
      return r.clone().text().then(function (b) {
        mem[key] = { t: Date.now(), b: b, ct: ct };
        cp.then(function (c) { if (c) return c.put(key, new Response(b, { headers: { "content-type": ct, "x-ail-at": String(Date.now()) } })); }).catch(function () {});
        return b;
      });
    } catch (e) { return Promise.resolve(null); }
  }
  function net(input, init, key) {
    var gaps = [0, 600, 1500], i = 0;
    function go() {
      return attempt(input, init, i).catch(function (e) {
        if (++i >= gaps.length || (init && init.signal && init.signal.aborted)) throw e;
        return delay(gaps[i]).then(go);
      });
    }
    return go().then(function (r) { if (r.ok) store(key, r); return r; });
  }
  function fromCache(key) {
    if (mem[key]) return Promise.resolve(mem[key]);
    return cp.then(function (c) { return c ? c.match(key) : null; }).then(function (r) {
      if (!r) return null;
      return r.text().then(function (b) { return { t: Number(r.headers.get("x-ail-at")) || 0, b: b, ct: r.headers.get("content-type") || "application/json" }; });
    }).catch(function () { return null; });
  }
  // 只有「生成时间」变了、内容没变：不算变化，不用重画整页（重画会把页面上读到一半的链上数据全部重来）
  function same(b) { return String(b).replace(/"at":\d+/g, ""); }
  function emit(name, d) { try { window.dispatchEvent(new CustomEvent(name, { detail: d || {} })); } catch (e) {} }
  window.fetch = function (input, init) {
    try {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      var u = new URL(url, location.href);
      if (method !== "GET" || u.origin !== location.origin || u.pathname.indexOf("/api/") !== 0 || SKIP.test(u.pathname)) return real(input, init);
      var key = u.pathname + u.search, p = net(input, init, key);
      return fromCache(key).then(function (m) {
        if (!m) return p.catch(function (e) { emit("ail:neterr", { url: key }); throw e; });
        var wait = Date.now() - m.t < 60000 ? 350 : 1200; // 刚拿过的数据变化不大，更快先给；最多等网络 1.2 秒
        return Promise.race([p.then(function (r) { return { r: r }; }, function () { return null; }), delay(wait).then(function () { return null; })]).then(function (x) {
          if (x && x.r) return x.r;
          // 先给缓存，真数据到了再通知页面
          p.then(function (r) { return r.clone().text(); }).then(function (b) { emit("ail:fresh", { url: key, changed: same(b) !== same(m.b) }); }).catch(function () {});
          return new Response(m.b, { status: 200, headers: { "content-type": m.ct, "x-ail-cache": String(Date.now() - m.t) } });
        });
      });
    } catch (e) { return real(input, init); }
  };
})();
