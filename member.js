// 会员：用 Anubis 链 LGNS 付款开通（一次付款永久），开通后可以画团队结构图
(function () {
  "use strict";

  var A = window.AIL;
  var RECEIVER = "0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6";
  var LGNS = "0x4D1D808a081FdAc440703b3765FC61f8028C06B8"; // 9 位小数
  var LGNS_PAIR = "0x32a4586797e3f561f41c0f47ca57ed08d64f3dc0"; // token0 = LGNS，token1 = DAI
  var FEE_DAI = 100;
  var LGNS_RATE = 0.5; // LGNS 按实时价格的 50% 折算
  var TOLERANCE = 0.97; // 付款到验证之间价格会动，少 3% 以内也算付够
  var START_BLOCK = 17790000; // 会员功能上线前的转账不算
  var EXPLORER_API = "https://browser.anubispace.org/api";
  var EXPLORER = "https://anubisscan.io";
  var ETHERS = "https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.4/ethers.umd.min.js";
  var KEY = "ailgns-member-v1";

  // ---------- 价格与付款 ----------
  function lgnsPrice(block) {
    return A.rpc("eth_call", [{ to: LGNS_PAIR, data: "0x0902f1ac" }, block ? "0x" + block.toString(16) : "latest"]).then(function (h) {
      var lgns = Number(A.word(h, 0)) / 1e9, dai = Number(A.word(h, 1)) / 1e18;
      return dai / lgns;
    });
  }
  function required(price) { return Math.ceil(FEE_DAI / (price * LGNS_RATE)); }

  // 按时间顺序累计这个地址转给收款地址的 LGNS，累计数量达到当笔付款时的应付数量就算开通
  function findPayment(addr) {
    var url = EXPLORER_API + "?module=account&action=tokentx&address=" + addr + "&contractaddress=" + LGNS + "&startblock=" + START_BLOCK + "&page=1&offset=200&sort=asc";
    return A.getJSON(url).then(function (r) {
      var txs = (r.result || []).filter(function (t) {
        return t.from.toLowerCase() === addr && t.to.toLowerCase() === RECEIVER && Number(t.blockNumber) >= START_BLOCK;
      });
      var sum = 0, i = 0;
      function next() {
        if (i >= txs.length) return null;
        var t = txs[i++];
        sum += Number(t.value) / 1e9;
        return lgnsPrice(Number(t.blockNumber) - 1).then(function (p) {
          var need = required(p);
          if (sum >= need * TOLERANCE) return { tx: t.hash, block: Number(t.blockNumber), paid: sum, need: need };
          return next();
        });
      }
      return next();
    });
  }

  // ---------- 会员状态（存在本浏览器） ----------
  function member() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function saveMember(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* 隐私模式不保存 */ } }
  function logout() { try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ } }

  function loadEthers() {
    if (window.ethers) return Promise.resolve(window.ethers);
    return new Promise(function (ok, fail) {
      var s = document.createElement("script");
      s.src = ETHERS;
      s.onload = function () { ok(window.ethers); };
      s.onerror = function () { fail(new Error("签名校验组件加载失败")); };
      document.head.appendChild(s);
    });
  }
  function utf8Hex(str) {
    return "0x" + Array.from(new TextEncoder().encode(str)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  // 连接钱包 → 签名证明是本人 → 查链上付款
  function verify(status) {
    var eth = window.ethereum;
    if (!eth) return Promise.reject(new Error("没有检测到钱包。请在 Bitget Wallet、TokenPocket 或 MetaMask 的 DApp 浏览器里打开 ailgns.dev 再点验证。"));
    var addr, msg, sig;
    status("请在钱包里确认连接…");
    return eth.request({ method: "eth_requestAccounts" }).then(function (accs) {
      addr = String(accs[0]).toLowerCase();
      msg = "AiLGNS 数据站会员验证\n地址：" + addr + "\n时间：" + new Date().toISOString() + "\n此签名只用于确认身份，不会发起交易，也不会授权任何代币。";
      status("请在钱包里签名（不花钱、不授权）…");
      return eth.request({ method: "personal_sign", params: [utf8Hex(msg), addr] });
    }).then(function (s) {
      sig = s;
      status("正在校验签名…");
      return loadEthers();
    }).then(function (ethers) {
      if (ethers.verifyMessage(msg, sig).toLowerCase() !== addr) throw new Error("签名和地址对不上，请重试");
      status("正在查找链上付款记录…");
      return findPayment(addr);
    }).then(function (pay) {
      if (!pay) {
        var e = new Error("签名成功，但没有找到 " + A.short(addr) + " 转给收款地址的 LGNS。付款后等 1 分钟左右再点验证。");
        e.addr = addr;
        throw e;
      }
      saveMember({ addr: addr, msg: msg, sig: sig, tx: pay.tx, block: pay.block, paid: pay.paid, at: Date.now() });
      return pay;
    });
  }

  // ---------- 页面：会员 ----------
  function renderMember(id) {
    var app = A.app, m = member();
    var head = '<h1>会员</h1><p class="sub">一次付款，永久使用。开通后可以输入任意地址，画出整个团队的结构图。</p>';
    if (m) {
      app.innerHTML = head + '<section class="card"><div class="card-head"><h2>✓ 你已经是会员</h2><span class="muted">本浏览器已验证</span></div><dl class="dl">' +
        "<dt>会员地址</dt><dd>" + A.addrLink(m.addr) + "</dd><dt>付款</dt><dd>" + A.fmt(m.paid, 2) + ' LGNS · <a target="_blank" rel="noopener" href="' + EXPLORER + "/tx/" + m.tx + '">查看交易 ↗</a></dd></dl>' +
        '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap"><a class="btn" style="padding:10px 18px" href="#/tree">去画结构图 →</a><button class="ghost" id="logout" style="padding:10px 18px">退出会员</button></div>' +
        '<p class="note">换浏览器或换手机时，用同一个钱包再点一次「验证」就行，不用重复付款。</p></section>';
      document.getElementById("logout").onclick = function () { logout(); renderMember(id); };
      return;
    }
    app.innerHTML = head + '<div class="loading">正在读取 LGNS 实时价格…</div>';
    lgnsPrice().then(function (p) {
      if (!A.isCurrent(id)) return;
      var need = required(p);
      app.innerHTML = head +
        '<div class="kpis"><div class="kpi hero"><div class="k">开通会员需要</div><div class="v num">' + A.fmt(need) + '<small>LGNS</small></div><div class="d">= ' + FEE_DAI + " DAI · LGNS 按实时价 50% 折算</div></div>" +
        '<div class="kpi"><div class="k">LGNS 实时价格</div><div class="v num">' + p.toFixed(5) + '<small>DAI</small></div><div class="d">Anubis 链 LGNS/DAI 池</div></div>' +
        '<div class="kpi"><div class="k">有效期</div><div class="v">永久</div><div class="d">一次付款，绑定付款钱包</div></div></div>' +
        '<section class="card"><div class="card-head"><h2>开通步骤</h2></div><ol class="steps">' +
        "<li>用你自己的钱包，在 <b>Anubis 链</b>上转 <b>" + A.fmt(need) + " LGNS</b> 到下面的收款地址：" +
        '<div class="copy"><span class="mono" id="recv">' + RECEIVER + '</span><button class="ghost" id="copy">复制</button></div>' +
        '<span class="muted">只收 Anubis 链上的 LGNS（合约 ' + A.short(LGNS) + "），转其他币或其他链无法开通，也无法退回。</span></li>" +
        "<li>转账成功后，在钱包的 DApp 浏览器里打开 <b>ailgns.dev</b>，进入本页，点下面的按钮。钱包会让你签一段文字，用来证明是本人，<b>不花钱、不授权、不发交易</b>。</li>" +
        "<li>验证通过后，这个浏览器就是会员了。换设备时再验证一次即可。</li></ol>" +
        '<button id="verify" style="padding:12px 22px;margin-top:6px">我已付款，连接钱包验证</button><p class="note" id="vstatus"></p></section>' +
        '<section class="card"><div class="card-head"><h2>会员能做什么</h2></div><p style="margin:0">输入任意钱包地址，画出它的<b>团队结构图</b>：每个人的等级、团队人数、团队算力一目了然，可以一层层点开、缩放拖动，也能导出图片发给团队。</p>' +
        '<p class="note"><a href="#/tree">先看看结构图页面 →</a></p></section>' +
        '<p class="note">本站只读，不会向你索取私钥或助记词。除了上面这一笔自愿付款，任何以本站名义要求转账、授权的都是诈骗。</p>';
      document.getElementById("copy").onclick = function () {
        var b = this;
        (navigator.clipboard ? navigator.clipboard.writeText(RECEIVER) : Promise.reject()).then(function () { b.textContent = "已复制"; }, function () {
          var r = document.createRange(); r.selectNodeContents(document.getElementById("recv"));
          var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); b.textContent = "已选中，请复制";
        });
      };
      var st = document.getElementById("vstatus");
      document.getElementById("verify").onclick = function () {
        var btn = this;
        btn.disabled = true;
        st.className = "note";
        verify(function (t) { st.textContent = t; }).then(function () {
          location.hash = "#/tree";
        }, function (e) {
          st.className = "note down";
          st.textContent = (e && (e.message || e.reason)) || "验证失败，请重试";
          btn.disabled = false;
        });
      };
    }, function () {
      if (A.isCurrent(id)) app.innerHTML = head + '<div class="card err">LGNS 价格暂时读不到，请稍后刷新。</div>';
    });
  }

  // ---------- 页面：结构图 ----------
  var NODE_W = 220, NODE_H = 66, GAP_X = 64, GAP_Y = 14, MAX_CHILDREN = 30;
  var COLORS = { bg: "#0d0f12", node: "#15181d", line: "#3a4049", text: "#e8e6e1", muted: "#8d939c", gold: "#d4af37", up: "#2fbf71" };

  function loadNode(a) {
    return Promise.all([A.api("/community/" + a), A.api("/level/" + a).catch(function () { return null; })]).then(function (r) {
      var c = r[0], l = r[1];
      return { a: a.toLowerCase(), level: l ? l.level : 0, team: A.n(c.team), power: A.n(c.teamActivePower), self: l ? A.n(l.selfPower) : 0, direct: A.n(c.direct), children: null, expanded: false };
    });
  }
  function loadChildren(node) {
    return A.allReferrals(node.a, 300).then(function (refs) {
      return A.pool(refs.list, 6, loadNode).then(function (kids) {
        kids = kids.filter(Boolean).sort(function (x, y) { return y.power - x.power || y.team - x.team; });
        // 没有团队、没有等级的直推不单独画，合并成一个"还有 N 个"
        var shown = kids.filter(function (k) { return k.team > 0 || k.level > 0; }).slice(0, MAX_CHILDREN);
        node.more = Math.max(0, refs.total - shown.length);
        node.children = shown;
        node.children.forEach(function (k, i) { k.zone = i < 3 && k.power > 0 ? i + 1 : 0; });
      });
    });
  }

  // 从左到右的树：每个节点占的高度 = 展开后的叶子数
  function layout(root) {
    var nodes = [], edges = [], y = 0;
    function walk(n, depth) {
      n.x = depth * (NODE_W + GAP_X);
      var kids = n.expanded && n.children ? n.children.slice() : [];
      if (n.expanded && n.more) kids.push({ moreOf: n, count: n.more, x: 0 });
      if (!kids.length) { n.y = y; y += NODE_H + GAP_Y; }
      else {
        kids.forEach(function (k) { if (k.moreOf) { k.x = (depth + 1) * (NODE_W + GAP_X); k.y = y; y += NODE_H + GAP_Y; nodes.push(k); } else walk(k, depth + 1); edges.push([n, k]); });
        n.y = (kids[0].y + kids[kids.length - 1].y) / 2;
      }
      nodes.push(n);
    }
    walk(root, 0);
    return { nodes: nodes, edges: edges, w: Math.max.apply(null, nodes.map(function (n) { return n.x; })) + NODE_W, h: y - GAP_Y };
  }

  function nodeSvg(n, root) {
    var e = A.esc;
    if (n.moreOf) {
      return '<g transform="translate(' + n.x + "," + n.y + ')"><rect width="' + NODE_W + '" height="' + NODE_H + '" rx="10" fill="none" stroke="' + COLORS.line + '" stroke-dasharray="5 4"/>' +
        '<text x="14" y="28" fill="' + COLORS.muted + '" font-size="13">还有 ' + A.fmt(n.count) + " 个直推</text>" +
        '<text x="14" y="48" fill="' + COLORS.muted + '" font-size="12">暂无团队或团队较小，未画出</text></g>';
    }
    var stroke = n === root ? COLORS.gold : n.level ? COLORS.gold : COLORS.line;
    var badge = n.level ? "P" + n.level : "—";
    var zone = n.zone ? ["一区", "二区", "三区"][n.zone - 1] : "";
    var s = '<g class="node" data-a="' + n.a + '" transform="translate(' + n.x + "," + n.y + ')" style="cursor:' + (n.direct ? "pointer" : "default") + '">' +
      "<title>" + e(n.a) + "\n团队 " + A.fmt(n.team) + " 人 · 团队算力 " + A.fmt(n.power) + " · 直推 " + A.fmt(n.direct) + "</title>" +
      '<rect width="' + NODE_W + '" height="' + NODE_H + '" rx="10" fill="' + COLORS.node + '" stroke="' + stroke + '" stroke-width="' + (n === root ? 2 : 1.2) + '"/>' +
      '<text x="14" y="23" fill="' + COLORS.text + '" font-size="13" font-family="ui-monospace,Menlo,Consolas,monospace" font-weight="600">' + A.short(n.a) + "</text>" +
      '<rect x="' + (NODE_W - 48) + '" y="9" width="36" height="19" rx="5" fill="' + (n.level ? COLORS.gold : "#262b33") + '"/>' +
      '<text x="' + (NODE_W - 30) + '" y="23" text-anchor="middle" fill="' + (n.level ? "#111" : COLORS.muted) + '" font-size="12" font-weight="700">' + badge + "</text>" +
      (zone ? '<text x="' + (NODE_W - 56) + '" y="23" text-anchor="end" fill="' + COLORS.gold + '" font-size="11">' + zone + "</text>" : "") +
      '<text x="14" y="43" fill="' + COLORS.muted + '" font-size="12">团队 <tspan fill="' + COLORS.text + '">' + A.fmt(n.team) + '</tspan> 人 · 算力 <tspan fill="' + COLORS.text + '">' + A.wan(n.power).replace(" ", "") + "</tspan></text>" +
      '<text x="14" y="59" fill="' + COLORS.muted + '" font-size="12">直推 ' + A.fmt(n.direct) + (n.self ? " · 个人 " + A.wan(n.self).replace(" ", "") : "") + "</text>";
    if (n.direct) {
      s += '<circle cx="' + NODE_W + '" cy="' + NODE_H / 2 + '" r="10" fill="' + COLORS.bg + '" stroke="' + COLORS.line + '"/>' +
        '<text x="' + NODE_W + '" y="' + (NODE_H / 2 + 4.5) + '" text-anchor="middle" fill="' + COLORS.text + '" font-size="14">' + (n.loading ? "…" : n.expanded ? "−" : "+") + "</text>";
    }
    return s + "</g>";
  }

  function treeSvg(root) {
    var L = layout(root), pad = 24;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + (L.w + pad * 2) + '" height="' + (L.h + pad * 2) + '" viewBox="' + -pad + " " + -pad + " " + (L.w + pad * 2) + " " + (L.h + pad * 2) + '" font-family="-apple-system,BlinkMacSystemFont,PingFang SC,Microsoft YaHei,sans-serif">' +
      '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="' + COLORS.line + '"/></marker></defs>';
    L.edges.forEach(function (e) {
      var a = e[0], b = e[1], x1 = a.x + NODE_W + 10, y1 = a.y + NODE_H / 2, x2 = b.x - 2, y2 = b.y + NODE_H / 2, mx = (x1 + x2) / 2;
      s += '<path d="M' + x1 + "," + y1 + " C" + mx + "," + y1 + " " + mx + "," + y2 + " " + x2 + "," + y2 + '" fill="none" stroke="' + COLORS.line + '" stroke-width="1.4" marker-end="url(#arr)"/>';
    });
    L.nodes.forEach(function (n) { s += nodeSvg(n, root); });
    return { svg: s + "</svg>", w: L.w + pad * 2, h: L.h + pad * 2 };
  }

  // 平移缩放：鼠标拖动、滚轮缩放、双指缩放
  function panZoom(box, inner) {
    var k = 1, tx = 0, ty = 0, pts = {}, last = null, moved = false;
    function apply() { inner.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + k + ")"; }
    function zoomAt(f, cx, cy) {
      var nk = Math.min(3, Math.max(0.15, k * f));
      tx = cx - (cx - tx) * nk / k; ty = cy - (cy - ty) * nk / k; k = nk; apply();
    }
    box.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = box.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    box.addEventListener("pointerdown", function (e) { pts[e.pointerId] = [e.clientX, e.clientY]; moved = false; last = null; });
    box.addEventListener("pointermove", function (e) {
      if (!pts[e.pointerId]) return;
      var ids = Object.keys(pts), prev = pts[e.pointerId];
      pts[e.pointerId] = [e.clientX, e.clientY];
      if (ids.length === 1) {
        var dx = e.clientX - prev[0], dy = e.clientY - prev[1];
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        if (moved) { box.setPointerCapture(e.pointerId); tx += dx; ty += dy; apply(); }
      } else if (ids.length === 2) {
        var p = pts[ids[0]], q = pts[ids[1]], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        var r = box.getBoundingClientRect();
        if (last) zoomAt(d / last, (p[0] + q[0]) / 2 - r.left, (p[1] + q[1]) / 2 - r.top);
        last = d; moved = true;
      }
    });
    function up(e) { delete pts[e.pointerId]; if (Object.keys(pts).length < 2) last = null; }
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", up);
    return {
      zoom: function (f) { zoomAt(f, box.clientWidth / 2, box.clientHeight / 2); },
      // 优先看得清：最小缩到 0.5，太高的树从顶部开始，往下拖着看
      fit: function (w, h) {
        k = Math.max(0.5, Math.min(1, (box.clientWidth - 16) / w, (box.clientHeight - 16) / h));
        tx = Math.max(8, (box.clientWidth - w * k) / 2);
        ty = h * k < box.clientHeight ? (box.clientHeight - h * k) / 2 : 8;
        apply();
      },
      wasDrag: function () { return moved; }
    };
  }

  function exportPng(root) {
    var t = treeSvg(root), scale = 2;
    var svg = t.svg.replace("<svg ", '<svg style="background:' + COLORS.bg + '" ');
    var img = new Image();
    img.onload = function () {
      var c = document.createElement("canvas");
      c.width = t.w * scale; c.height = t.h * scale;
      var g = c.getContext("2d");
      g.fillStyle = COLORS.bg; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(function (b) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = "ailgns-team-" + root.a.slice(2, 8) + ".png";
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      });
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function renderTree(id, addr) {
    var app = A.app, m = member();
    var head = '<h1>团队结构图 <span class="lv p1" style="vertical-align:4px">会员</span></h1><p class="sub">输入地址，画出团队结构。点节点右边的 + 展开下一层，拖动平移，滚轮或双指缩放。</p>';
    if (!m) {
      app.innerHTML = head + '<section class="card" style="text-align:center;padding:36px 18px"><h2 style="margin-bottom:8px">这是会员功能</h2>' +
        '<p class="muted" style="margin:0 0 18px">用 LGNS 一次付款，永久使用。输入任意地址就能画出整个团队的结构图，导出图片发给团队。</p>' +
        '<a class="btn" style="padding:12px 22px;display:inline-block" href="#/member">开通会员 →</a>' +
        '<p class="note">已经付过款？在钱包 DApp 浏览器里打开会员页，点「验证」即可。</p></section>';
      return;
    }
    var form = '<form class="search" data-custom><input name="a" placeholder="粘贴钱包地址 0x…" autocomplete="off" spellcheck="false" value="' + A.esc(addr || "") + '"><button>画图</button></form>';
    if (!addr) {
      app.innerHTML = head + form + '<div class="empty">输入一个地址开始画图。会员地址：' + A.addrLink(m.addr, "tree") + "</div>";
      bindForm();
      return;
    }
    app.innerHTML = head + form + '<div class="loading">正在读取团队…</div>';
    bindForm();
    var root;
    loadNode(addr).then(function (r) {
      root = r;
      if (!root.direct) return;
      root.expanded = true;
      return loadChildren(root);
    }).then(function () {
      if (!A.isCurrent(id)) return;
      app.innerHTML = head + form +
        '<div class="tree-bar"><button class="ghost" data-z="1.25">放大</button><button class="ghost" data-z="0.8">缩小</button><button class="ghost" data-fit>适应屏幕</button>' +
        '<button class="ghost" data-expand>展开下一层</button><button data-png>导出图片</button><span class="muted" id="tree-status"></span></div>' +
        '<div class="tree-box" id="tree-box"><div class="tree-inner" id="tree-inner"></div></div>' +
        '<p class="note">金色边框 = 有 P 等级；一区、二区、三区按团队算力从大到小估算，以官方等级为准。每层最多画出算力最大的 ' + MAX_CHILDREN + " 个直推，没有团队的直推合并显示。</p>";
      bindForm();
      var box = document.getElementById("tree-box"), inner = document.getElementById("tree-inner"), st = document.getElementById("tree-status");
      var pz = panZoom(box, inner), size;
      function draw(fit) {
        var t = treeSvg(root);
        inner.innerHTML = t.svg;
        size = t;
        if (fit) pz.fit(t.w, t.h);
      }
      draw(true);
      inner.addEventListener("click", function (e) {
        if (pz.wasDrag()) return;
        var g = e.target.closest(".node");
        if (!g) return;
        var n = find(root, g.getAttribute("data-a"));
        if (!n || !n.direct || n.loading || n === root && !n.children) return;
        if (n.children) { n.expanded = !n.expanded; draw(); return; }
        n.loading = true; draw();
        loadChildren(n).then(function () { n.loading = false; n.expanded = true; if (A.isCurrent(id)) draw(); }, function () { n.loading = false; draw(); });
      });
      app.querySelector("[data-fit]").onclick = function () { pz.fit(size.w, size.h); };
      app.querySelectorAll("[data-z]").forEach(function (b) { b.onclick = function () { pz.zoom(Number(b.getAttribute("data-z"))); }; });
      app.querySelector("[data-png]").onclick = function () { exportPng(root); };
      app.querySelector("[data-expand]").onclick = function () {
        // 展开当前最外层里所有有直推的节点
        var leaves = [];
        (function walk(n) { if (n.expanded && n.children) n.children.forEach(walk); else if (n.direct && !n.moreOf) leaves.push(n); })(root);
        if (!leaves.length) { st.textContent = "已经全部展开"; return; }
        leaves = leaves.slice(0, 40);
        var done = 0;
        st.textContent = "正在展开 " + leaves.length + " 个节点…";
        A.pool(leaves, 3, function (n) {
          if (n.children) { n.expanded = true; return Promise.resolve(); }
          return loadChildren(n).then(function () { n.expanded = true; });
        }, function () { done++; st.textContent = "正在展开 " + done + " / " + leaves.length; }).then(function () {
          st.textContent = "";
          if (A.isCurrent(id)) draw(true);
        });
      };
    }, function () {
      if (A.isCurrent(id)) app.innerHTML = head + form + '<div class="card err">读取失败，请确认地址正确，稍后再试。</div>';
      bindForm();
    });
  }

  function find(n, a) {
    if (n.a === a) return n;
    var kids = n.children || [];
    for (var i = 0; i < kids.length; i++) { var r = find(kids[i], a); if (r) return r; }
    return null;
  }
  function bindForm() {
    var f = A.app.querySelector("form[data-custom]");
    if (!f) return;
    f.onsubmit = function (e) {
      e.preventDefault();
      var a = f.a.value.trim();
      if (!A.isAddr(a)) { f.a.style.borderColor = "var(--down)"; f.a.focus(); return; }
      location.hash = "#/tree/" + a.toLowerCase();
    };
  }

  A.pages.member = renderMember;
  A.pages.tree = renderTree;
  A.start();
})();
