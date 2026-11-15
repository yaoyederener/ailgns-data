// 🌙 夜间模式开关（站长 2026-11-14：客户反馈晚上看网站太亮）。
// 默认关。开了才给 <html> 挂上 night 标记、再去加载 dist/night.css（tools/night.py 从 style.css 自动生成的深色样式）；
// 不开的人不多下载一个字节，白天模式一个像素都不变。选择记在这台设备上，下次打开还是上次的样子。
(function () {
  "use strict";
  var KEY = "ail:night", root = document.documentElement, link = null;
  /* 夜间样式用了 :where()（2021 年以后的浏览器都有）。太老的浏览器不认，开了会花：干脆不给开关 */
  var OK = false; try { OK = !!(window.CSS && CSS.supports && CSS.supports("selector(:where(a))")); } catch (e) { OK = false; }
  window.AIL_NIGHT_OK = OK;
  function saved() { try { return OK && localStorage.getItem(KEY) === "1"; } catch (e) { return false; } }
  function load() {
    if (link || !window.AIL_NIGHT) return; /* AIL_NIGHT = 打包时写进来的 dist/night.css 网址；没打包的开发页面没有它，就只挂标记 */
    link = document.createElement("link"); link.rel = "stylesheet"; link.id = "ntm-css"; link.href = window.AIL_NIGHT;
    document.head.appendChild(link);
  }
  function paint(on) { try { document.querySelectorAll("[data-night-lb]").forEach(function (el) { el.textContent = on ? "☀️ 换回白天模式" : "🌙 夜间模式"; }); } catch (e) { /* 菜单还没画出来 */ } }
  function set(on) {
    on = !!on && OK;
    try { root.classList.toggle("night", on); } catch (e) { return; }
    if (on) load();
    try { var m = document.querySelector('meta[name="theme-color"]'); if (m) { if (m.getAttribute("data-day") === null) m.setAttribute("data-day", m.getAttribute("content") || ""); m.setAttribute("content", on ? "#181822" : m.getAttribute("data-day")); } } catch (e) { /* 改不了顶栏颜色不要紧 */ }
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) { /* 记不住就只管这一次 */ }
    paint(on);
  }
  window.AIL_NIGHT_ON = function () { try { return root.classList.contains("night"); } catch (e) { return false; } };
  window.AIL_NIGHT_SET = set;
  window.AIL_NIGHT_PAINT = function () { paint(window.AIL_NIGHT_ON()); };
  if (saved()) set(true);
})();
