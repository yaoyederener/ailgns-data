// 🅰️ 名字写法（站长 2026-11-08 定「方案一」：不改名，改写法）：全站把 AiLGNS 显示成 **Ai**LGNS —— Ai 加粗紫色、LGNS 小一号淡一点。
// 客户眼里是「Ai」，嘴上叫「AI」，但名字一个字母没变，钱包、浏览器、合约全对得上。只改显示，不碰任何数据和文字内容。
// 做法：页面任何地方新出现的文字里有 AiLGNS，就包成 <span class="ai-b"><b>Ai</b><i>LGNS</i></span>。输入框、代码、地址不碰。
(function () {
  var RE = /AiLGNS/g, SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, OPTION: 1, TITLE: 1, CANVAS: 1, SVG: 1 };
  function skip(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP[e.tagName] || e.isContentEditable || e.classList.contains("ai-b") || e.classList.contains("mono") || e.hasAttribute("data-nobrand")) return true;
    }
    return false;
  }
  function wrap(t) {
    var s = t.nodeValue; if (!t.parentNode || s.indexOf("AiLGNS") < 0 || skip(t.parentNode)) return; // 节点可能已经被页面换掉了（批处理有延迟）
    // 父元素是 flex / grid 时，拆出来的每一段都会变成独立的格子（「数量（AiLGNS）」被拆成三行），这种地方不美化，保持原样
    try { var dsp = getComputedStyle(t.parentNode).display; if (/flex|grid/.test(dsp)) return; } catch (e) { return; }
    var frag = document.createDocumentFragment(), last = 0, m; RE.lastIndex = 0;
    while ((m = RE.exec(s))) {
      if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      var sp = document.createElement("span"); sp.className = "ai-b"; sp.innerHTML = "<b>Ai</b><i>LGNS</i>"; frag.appendChild(sp);
      last = m.index + 6;
    }
    if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
    t.parentNode.replaceChild(frag, t);
  }
  function run(root) {
    if (!root) return;
    if (root.nodeType === 3) return wrap(root);
    if (root.nodeType !== 1 || skip(root)) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), list = [], n;
    while ((n = w.nextNode())) if (n.nodeValue.indexOf("AiLGNS") >= 0) list.push(n);
    list.forEach(wrap);
  }
  var pending = [], raf = 0;
  function flush() { raf = 0; var l = pending; pending = []; l.forEach(function (n) { try { run(n); } catch (e) { /* 只是显示美化，出错也不能影响页面 */ } }); }
  new MutationObserver(function (ms) {
    ms.forEach(function (m) {
      if (m.type === "characterData") pending.push(m.target);
      else for (var i = 0; i < m.addedNodes.length; i++) pending.push(m.addedNodes[i]);
    });
    if (!raf) raf = requestAnimationFrame(flush);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  function safeRun() { try { run(document.body); } catch (e) {} }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", safeRun); else safeRun();
})();
