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

  var CJK = /[\u4e00-\u9fff]/, NEED = lang === "en" ? /[\u4e00-\u9fff，。：；（）、！？「」]/ : /[\u4e00-\u9fff]/, SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, CANVAS: 1, NOSCRIPT: 1 };
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
  var miss = null;
  function makeEn(D) {
    var dict = D.d || {}, frag = D.f || {}, idx = {}, SHORT = {}, k, own = Object.prototype.hasOwnProperty;
    try { if (localStorage.getItem("ail:langdbg") === "1") { miss = {}; window.AIL_LANG_MISS = miss; } } catch (e) { /* 不记 */ }
    // D.d = 整句词典（查之前数字 / 地址 / 名字换成 {0}{1}…）。D.f = 代码里的每一小段原文 → 英文（tools/i18n_extract.py 抠出来的）：
    // 整句查不到时，在这段字里找认识的小段，一段一段换，中间的数字 / 名字留着
    for (k in frag) if (own.call(frag, k)) { (idx[k.charAt(0)] = idx[k.charAt(0)] || []).push(k); if ((k.match(/[一-鿿]/g) || []).length <= 2) SHORT[k] = 1; }
    for (k in idx) idx[k].sort(function (a, b) { return b.length - a.length; });
    var PUN = { "，": ", ", "。": ". ", "：": ": ", "；": "; ", "（": " (", "）": ") ", "、": ", ", "！": "! ", "？": "? ", "「": "“", "」": "”", "『": "“", "』": "”", "《": "“", "》": "”", "～": "–" };
    var A_END = /[A-Za-z0-9%”)]$/, A_START = /^[A-Za-z0-9“($]/;
    function cjk(c) { return c >= "一" && c <= "鿿"; }
    function longAt(t, pos) { /* 这个位置是不是紧跟着一段认识的、三个字以上的原文 */
      var l = idx[t.charAt(pos)], y;
      if (l) for (y = 0; y < l.length; y++) if (!SHORT[l[y]] && t.substr(pos, l[y].length) === l[y]) return true;
      return false;
    }
    function scan(t) {
      var out = "", i = 0, n = t.length, any = false, last = true, c, list, x, hit, p;
      while (i < n) {
        c = t.charAt(i); list = idx[c]; hit = null;
        if (list) for (x = 0; x < list.length; x++) {
          k = list[x];
          if (t.substr(i, k.length) !== k) continue;
          /* 一两个字的小段：前后都不能紧挨着不认识的汉字才换（「张三」不能变成「orders三」），免得把人名、留言里的字拆了 */
          if (SHORT[k] && ((!last && i > 0 && cjk(t.charAt(i - 1))) || (i + k.length < n && cjk(t.charAt(i + k.length)) && !longAt(t, i + k.length)))) continue;
          hit = k; break;
        }
        if (hit !== null) {
          p = frag[hit];
          if (p) out += (A_END.test(out) && A_START.test(p) ? " " : "") + p;
          i += hit.length; any = true; last = true;
        } else {
          p = own.call(PUN, c) ? PUN[c] : c;
          out += (last && out && A_END.test(out) && /^[A-Za-z0-9]/.test(p) ? " " : "") + p;
          i++; last = false;
        }
      }
      if (!any && out === t) return t;
      /* 大半句都不认识（只换掉了零星几个词）：半中半英比全中文更难看，整句不动 */
      var left = (out.match(/[\u4e00-\u9fff]/g) || []).length;
      if (left >= 8 && left * 10 > (t.match(/[\u4e00-\u9fff]/g) || []).length * 3) return t;
      return out.replace(/[  ]{2,}/g, " ").replace(/ +([,.;:!?)”])/g, "$1").replace(/([(“]) +/g, "$1");
    }
    return function (t, exactOnly) {
      if (!NEED.test(t)) return t;
      var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(t), core = m[2], vars = [];
      var key = core.replace(VAR, function (v) { vars.push(v); return "{" + (vars.length - 1) + "}"; });
      var hit = own.call(dict, key) ? dict[key] : null;
      if (hit !== null) return m[1] + hit.replace(/\{(\d+)\}/g, function (a, n) { return vars[+n] !== undefined ? vars[+n] : a; }) + m[3];
      if (exactOnly) return t;
      if (own.call(frag, core)) return m[1] + frag[core] + m[3];
      var r = scan(core);
      if (miss && key.length < 600 && CJK.test(r)) miss[key] = 1;
      return r === core ? t : m[1] + r.replace(/^ +| +$/g, "") + m[3];
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
      a = conv(html, true);
      if (a === html) return false;
      el.innerHTML = a; // 词典是我们自己写的，不含客户输入：数字 / 地址 / 名字是从页面原文里抠出来再放回去的，原文本来就在页面上
      return true;
    } catch (e) { return false; }
  }

  function text(t) {
    try {
      var s = t.nodeValue; if (!s || !NEED.test(s) || !t.parentNode || skip(t.parentNode)) return;
      if (lang === "en" && t.parentNode.firstElementChild && whole(t.parentNode)) return;
      var r = conv(s);
      if (r === s) return;
      if (lang === "en") { /* 英文词和旁边的数字 / 词之间要有空格：「共<b>5</b>张」→ Total 5 orders */
        try {
          var BLK = /^(BR|DIV|P|LI|H\d|TD|TH|TR|UL|OL|SECTION|BUTTON|SVG|IMG|DETAILS|SUMMARY)$/, a = t.previousSibling, b = t.nextSibling;
          var at = a ? (a.nodeType === 3 ? a.nodeValue : a.nodeType === 1 && !BLK.test(a.tagName) ? a.textContent : "") : "";
          var bt = b ? (b.nodeType === 3 ? b.nodeValue : b.nodeType === 1 && !BLK.test(b.tagName) ? b.textContent : "") : "";
          if (at && /[A-Za-z0-9%)]$/.test(at) && /^[A-Za-z0-9(]/.test(r)) r = " " + r;
          if (bt && /^[A-Za-z0-9(]/.test(bt) && /[A-Za-z0-9,.:;!?)]$/.test(r)) r = r + " ";
        } catch (e2) { /* 不补 */ }
      }
      t.nodeValue = r;
    } catch (e) { /* 这一段不换 */ }
  }
  function attrs(el) {
    try {
      for (var i = 0; i < ATTRS.length; i++) {
        var v = el.getAttribute(ATTRS[i]);
        if (v && NEED.test(v)) { var r = conv(v); if (r !== v) el.setAttribute(ATTRS[i], r); }
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
      try { /* 画布上画的字（小游戏、图表）：画之前先换 */
        var CP = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
        if (CP) ["fillText", "strokeText", "measureText"].forEach(function (fn) {
          var o = CP[fn]; if (typeof o !== "function") return;
          CP[fn] = function (str) { try { if (typeof str === "string" && NEED.test(str)) arguments[0] = conv(str); } catch (e3) { /* 原样画 */ } return o.apply(this, arguments); };
        });
      } catch (e4) { /* 画布不换不要紧 */ }
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
