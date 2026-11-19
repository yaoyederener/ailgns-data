// 🌐 语言切换（站长 2026-11-19：网站加英文和繁体字两个版本，默认简体中文，可以切换）。
// 网站所有文字都是写在各页面 js 里的简体中文。这里不改任何页面代码：
//   · 简体（默认）：这个文件什么都不做，不多下载一个字节，页面一个像素都不变
//   · 繁體：下载转换表 dist/lang-hant.js（tools/hant.py 生成），把页面上出现的字换成繁体，新冒出来的字也跟着换
//   · English：下载词典 dist/lang-en.js（lang-en.js，人工翻译），页面上的句子在词典里查得到就换成英文，查不到的保持中文（还在分批翻译）
// 选择记在这台设备上（ail:lang）；网址带 ?lang=en / ?lang=hant / ?lang=zh 也能切（方便把英文版链接发给人）。
// 不碰的地方：输入框里客户自己打的字、地址和哈希（.mono）、带 .ailgns 的名字（链上的名字一个字都不能变）、标了 data-nolang 的块。
// 画布上画出来的字（小游戏、K 线）换不了。全站 DOM 脚本：每一步都包 try/catch，出错只是不翻译，不能连累页面（brand.js 2026-11-08 的教训）。
(function () {
  "use strict";
  var KEY = "ail:lang", OKS = { zh: 1, hant: 1, en: 1 }, root = document.documentElement, lang = "zh";
  try {
    var q = /[?&]lang=(zh|hant|en)\b/.exec(location.search);
    if (q) { try { localStorage.setItem(KEY, q[1]); } catch (e0) { /* 记不住就只管这一次 */ } lang = q[1]; }
    else { var sv = localStorage.getItem(KEY); if (sv && OKS[sv]) lang = sv; }
  } catch (e) { lang = "zh"; }
  window.AIL_LANG = lang;
  window.AIL_LANG_SET = function (l) {
    if (!OKS[l] || l === lang) return;
    try { localStorage.setItem(KEY, l); } catch (e) { return; }
    try { /* 网址里要是带着 ?lang=，先去掉，不然刷新后又被它盖回去 */
      var u = location.href.replace(/([?&])lang=(zh|hant|en)(&|(?=#)|$)/, function (m, a, b, c) { return c === "&" ? a : ""; });
      if (u !== location.href) { location.replace(u); if (u.split("#")[0] === location.href.split("#")[0]) location.reload(); return; }
    } catch (e2) { /* 改不了网址就直接刷新 */ }
    location.reload();
  };
  if (lang === "zh") return;
  try { root.setAttribute("lang", lang === "en" ? "en" : "zh-Hant"); root.classList.add("lang-" + lang); } catch (e) { /* 不要紧 */ }

  var CJK = /[一-鿿]/, SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, CANVAS: 1, NOSCRIPT: 1 };
  var NAME = /[^\s，。、：:；;（）()「」《》<>"'=\/|·,!！?？]+\.ailgns/gi; // 链上的名字：原样保留
  var ATTRS = ["placeholder", "title", "aria-label", "alt"];
  var conv = null; // 一段文字 → 换好的文字（没变化就返回原样）

  function skip(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP[e.tagName] || e.isContentEditable || (e.classList && e.classList.contains("mono")) || e.hasAttribute("data-nolang")) return true;
    }
    return false;
  }

  // ===== 繁體：逐字换 + 看词定字 =====
  function makeHant(D) {
    var map = {}, i, s = D.s, d = D.d, ph = {}, k;
    for (i = 0; i < s.length; i++) map[s.charAt(i)] = d.charAt(i);
    for (k in D.p) if (Object.prototype.hasOwnProperty.call(D.p, k)) { (ph[k.charAt(0)] = ph[k.charAt(0)] || []).push(k); }
    for (k in ph) ph[k].sort(function (a, b) { return b.length - a.length; });
    function part(t) {
      var out = "", n = t.length, j = 0, c, list, x, hit;
      while (j < n) {
        c = t.charAt(j); list = ph[c]; hit = null;
        if (list) for (x = 0; x < list.length; x++) if (t.substr(j, list[x].length) === list[x]) { hit = list[x]; break; }
        if (hit) { out += D.p[hit]; j += hit.length; } else { out += map[c] || c; j++; }
      }
      return out;
    }
    return function (t) {
      if (!CJK.test(t)) return t;
      if (t.indexOf(".ailgns") < 0 && t.indexOf(".AILGNS") < 0) return part(t);
      var out = "", last = 0, m; NAME.lastIndex = 0;
      while ((m = NAME.exec(t))) { out += part(t.slice(last, m.index)) + m[0]; last = m.index + m[0].length; }
      return out + part(t.slice(last));
    };
  }

  // ===== English：查词典。数字、地址、名字先抠出来换成 {0}{1}…，同一句话不同数字共用一条翻译 =====
  var VAR = /[^\s，。、：:；;（）()「」《》<>"'=\/|·,!！?？]+\.ailgns|0x[0-9a-fA-F]{4,}(?:[….]+[0-9a-fA-F]+)?|\d[\d,]*(?:\.\d+)?/gi;
  var miss = null, quiet = false; // quiet：整句查词典时，句子里要是已经有一段被换成英文了，这个「半中半英」的句子不记进没翻译的名单
  function makeEn(D) {
    var dict = D.d || {};
    try { if (localStorage.getItem("ail:langdbg") === "1") { miss = {}; window.AIL_LANG_MISS = miss; } } catch (e) { /* 不记 */ }
    return function (t) {
      if (!CJK.test(t)) return t;
      var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(t), core = m[2], vars = [];
      var key = core.replace(VAR, function (v) { vars.push(v); return "{" + (vars.length - 1) + "}"; });
      var hit = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : null;
      if (hit === null) { if (miss && !quiet && key.length < 600) miss[key] = 1; return t; }
      return m[1] + hit.replace(/\{(\d+)\}/g, function (a, n) { return vars[+n] !== undefined ? vars[+n] : a; }) + m[3];
    };
  }
  // 英文：一句话被 <b> 之类的小标签、或「AiLGNS」的美化（brand.js）切成几段时，按整句查词典（查到才整句换；里面有带 id / 事件的东西就不碰）
  var INLINE = { B: 1, I: 1, EM: 1, STRONG: 1, SMALL: 1, U: 1, BR: 1, SPAN: 1 };
  function whole(el) {
    try {
      if (!el || el.nodeType !== 1 || !el.firstElementChild || el.childNodes.length > 24) return false;
      var html = "", n, c, a;
      for (n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) { html += n.nodeValue; continue; }
        if (n.nodeType !== 1 || !INLINE[n.tagName]) return false;
        if (n.classList.contains("ai-b")) { html += "AiLGNS"; continue; }
        if (n.attributes.length || n.firstElementChild) return false;
        c = n.tagName.toLowerCase();
        html += c === "br" ? "<br>" : "<" + c + ">" + n.textContent + "</" + c + ">";
      }
      if (!CJK.test(html)) return false;
      quiet = !!el.__lgp; a = conv(html); quiet = false;
      if (a === html) return false;
      el.innerHTML = a; // 词典是我们自己写的，不含客户输入：数字 / 地址 / 名字是从页面原文里抠出来再放回去的，原文本来就在页面上
      return true;
    } catch (e) { return false; }
  }

  function text(t) {
    try {
      var s = t.nodeValue; if (!s || !CJK.test(s) || !t.parentNode || skip(t.parentNode)) return;
      if (lang === "en" && t.parentNode.firstElementChild && whole(t.parentNode)) return;
      var r = conv(s); if (r !== s) { t.nodeValue = r; if (lang === "en") t.parentNode.__lgp = 1; }
    } catch (e) { quiet = false; /* 这一段不换 */ }
  }
  function attrs(el) {
    try {
      for (var i = 0; i < ATTRS.length; i++) {
        var v = el.getAttribute(ATTRS[i]);
        if (v && CJK.test(v)) { var r = conv(v); if (r !== v) el.setAttribute(ATTRS[i], r); }
      }
      /* 手机上表格变卡片时，小标签是样式表从 data-l 里读出来画的；样式表里还有按 data-l 的原文挑格子的规则，所以原文不动，译文另放 data-lt */
      var dl = el.getAttribute("data-l");
      if (dl && CJK.test(dl)) { var r3 = conv(dl); if (r3 !== dl && el.getAttribute("data-lt") !== r3) el.setAttribute("data-lt", r3); }
      if (el.tagName === "INPUT" && /^(button|submit)$/i.test(el.type) && CJK.test(el.value)) { var r2 = conv(el.value); if (r2 !== el.value) el.value = r2; }
    } catch (e) { /* 不换 */ }
  }
  function run(node) {
    try {
      if (!node) return;
      if (node.nodeType === 3) return text(node);
      if (node.nodeType !== 1 || skip(node)) return;
      attrs(node);
      var w = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null), list = [], n;
      while ((n = w.nextNode())) list.push(n);
      for (var i = 0; i < list.length; i++) { n = list[i]; if (n.nodeType === 3) text(n); else if (!SKIP[n.tagName]) attrs(n); }
    } catch (e) { /* 这一块不换 */ }
  }
  function title() { try { var t = document.title; if (t && CJK.test(t)) { var r = conv(t); if (r !== t) document.title = r; } } catch (e) { /* 不换 */ } }

  function start() {
    try {
      var D = window.AIL_LANG_DATA; if (!D || D.t !== lang) return;
      conv = lang === "en" ? makeEn(D) : makeHant(D);
      window.AIL_LANG_T = function (s) { try { return conv(String(s)); } catch (e) { return s; } };
      run(document.body); title();
      new MutationObserver(function (ms) {
        for (var i = 0; i < ms.length; i++) {
          var m = ms[i];
          try {
            if (m.type === "characterData") text(m.target);
            else if (m.type === "attributes") { if (!skip(m.target)) attrs(m.target); }
            else for (var j = 0; j < m.addedNodes.length; j++) run(m.addedNodes[j]);
          } catch (e) { /* 跳过这一条 */ }
        }
      }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(["data-l"]) });
      var te = document.querySelector("title");
      if (te) new MutationObserver(title).observe(te, { childList: true, characterData: true, subtree: true });
    } catch (e) { /* 翻译起不来：页面照常是简体 */ }
  }
  function load() {
    try {
      var url = (window.AIL_LANGS || {})[lang] || ("lang-" + lang + ".js"); // 没打包的开发页面直接读源文件
      var sc = document.createElement("script"); sc.src = url; sc.async = true;
      sc.onload = function () { if (document.body) start(); else document.addEventListener("DOMContentLoaded", start); };
      document.head.appendChild(sc);
    } catch (e) { /* 下载不了：页面照常是简体 */ }
  }
  load();
})();
