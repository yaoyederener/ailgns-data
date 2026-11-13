// 🃏 掼蛋 · 试玩版 #/gd（站长 2026-11-13：群友要玩掼蛋）
// 红线：纯娱乐记分。不收费、不联网、不碰钱包和合约，没有任何币、豆、奖励进出。
// 单机：你和对家（机器人）一队，打上家、下家两个机器人。两副牌 108 张，每人 27 张，从 2 打到 A。
// 上半截是规则引擎（纯计算，不碰页面）：本机用 jsc 直接加载这个文件跑测试，所以引擎部分不能用 document、localStorage。
(function () {
  var W = typeof window !== "undefined" ? window : null, A = W && W.AIL;
  var RN = { 11: "J", 12: "Q", 13: "K", 14: "A", 16: "小王", 17: "大王" }, SUITS = ["♠", "♥", "♣", "♦"];
  function rn(n) { return RN[n] || String(n); }

  // ====================== 规则引擎 ======================
  // 一张牌 = 0..107 的编号：c % 54 是牌面（0..51 四门各 13 张，52 小王，53 大王），两副牌所以每个牌面有两张。
  function cid(c) { return c % 54; }
  function isJ(c) { return cid(c) >= 52; }
  function suit(c) { return (cid(c) / 13) | 0; }
  function nat(c) { var x = cid(c); return x >= 52 ? x - 36 : x % 13 + 2; }
  function pw(c, L) { var n = nat(c); return n === L ? 15 : n; }
  function wild(c, L) { return cid(c) < 52 && nat(c) === L && suit(c) === 1; }
  function sortH(h, L) { return h.sort(function (a, b) { return pw(b, L) - pw(a, L) || suit(a) - suit(b) || a - b; }); }
  function minus(hand, cards) { var m = {}, i; for (i = 0; i < cards.length; i++) m[cards[i]] = 1; return hand.filter(function (c) { return !m[c]; }); }

  // 连着的牌型（顺子 / 三连对 / 钢板）：ns 是普通牌的点数，len 连几个点数，per 每个点数最多几张；返回能凑成的最大顶点数（A 可以当 1），凑不成返回 0
  function seqTop(ns, len, per) {
    var t, lo, i, n, x, cnt, ok;
    for (t = 14; t >= len; t--) {
      lo = t - len + 1; cnt = []; ok = true;
      for (i = 0; i < ns.length; i++) {
        n = ns[i]; x = (lo === 1 && n === 14) ? 0 : n - lo;
        if (x < 0 || x >= len) { ok = false; break; }
        cnt[x] = (cnt[x] || 0) + 1;
        if (cnt[x] > per) { ok = false; break; }
      }
      if (ok) return t;
    }
    return 0;
  }

  // 这几张牌能算什么牌型（红桃级牌是百搭）。返回所有说得通的牌型，最常用的排前面；空数组 = 不成牌型
  function kinds(cards, L) {
    var n = cards.length, ws = 0, norm = [], i, c, out = [], p, t;
    if (!n) return out;
    if (n === 1) return [{ t: "single", r: pw(cards[0], L), n: 1 }];
    for (i = 0; i < n; i++) { c = cards[i]; if (wild(c, L)) ws++; else norm.push(c); }
    var p0 = norm.length ? pw(norm[0], L) : 15, same = true, jk = 0, cnt = {}, ns = [];
    for (i = 0; i < norm.length; i++) {
      p = pw(norm[i], L);
      if (p !== p0) same = false;
      if (isJ(norm[i])) jk++; else ns.push(nat(norm[i]));
      cnt[p] = (cnt[p] || 0) + 1;
    }
    if (n === 4 && jk === 4) return [{ t: "king", r: 99, n: 4 }];
    if (same && !(jk && ws)) {
      if (n === 2) return [{ t: "pair", r: p0, n: 2 }];
      if (jk) return out;
      if (n === 3) return [{ t: "triple", r: p0, n: 3 }];
      return [{ t: "bomb", r: p0, n: n }];
    }
    if (n === 5) {
      var best = 0, ks = Object.keys(cnt), j, x, y, need, ny, others;
      for (j = 0; j < ks.length; j++) {
        x = +ks[j];
        if (x >= 16 || cnt[x] > 3) continue;
        others = ks.filter(function (k) { return +k !== x; });
        if (others.length > 1) continue;
        need = 3 - cnt[x];
        if (others.length) { y = +others[0]; if (cnt[y] > 2) continue; ny = 2 - cnt[y]; if (y >= 16 && ny) continue; } else ny = 2;
        if (need + ny === ws && x > best) best = x;
      }
      if (best) out.push({ t: "full", r: best, n: 5 });
      if (!jk) {
        t = seqTop(ns, 5, 1);
        if (t) {
          var fl = true;
          for (i = 1; i < norm.length; i++) if (suit(norm[i]) !== suit(norm[0])) fl = false;
          out.push({ t: fl ? "sf" : "straight", r: t, n: 5 });
        }
      }
    }
    if (n === 6 && !jk) {
      t = seqTop(ns, 2, 3); if (t) out.push({ t: "plate", r: t, n: 6 });
      t = seqTop(ns, 3, 2); if (t) out.push({ t: "tube", r: t, n: 6 });
    }
    return out;
  }
  function isB(k) { return k.t === "bomb" || k.t === "sf" || k.t === "king"; }
  // 炸弹大小：4 张 < 5 张 < 同花顺 < 6 张及以上 < 四个王
  function bs(k) { return k.t === "king" ? 9999 : k.t === "sf" ? 550 + k.r : k.n * 100 + k.r; }
  function beats(a, b) { if (isB(a)) return isB(b) ? bs(a) > bs(b) : true; return !isB(b) && a.t === b.t && a.n === b.n && a.r > b.r; }

  // 手里能出的牌（last = 要压过的牌型；不传 = 自己起头）。同一种牌型同一个大小只留一手，少用百搭的优先
  function gen(hand, L, last) {
    var byP = {}, byN = {}, bySN = {}, ws = [], i, c, p, res = [], idx = {}, g, k2, t, r, rr, cs, miss, s, pairs = [], trips = [];
    for (i = 0; i < hand.length; i++) {
      c = hand[i];
      if (wild(c, L)) { ws.push(c); continue; }
      p = pw(c, L); (byP[p] = byP[p] || []).push(c);
      if (!isJ(c)) { (byN[nat(c)] = byN[nat(c)] || []).push(c); bySN[suit(c) * 20 + nat(c)] = c; }
    }
    function add(cards) {
      var ks = kinds(cards, L), k = null, j, wu = 0, key, o;
      for (j = 0; j < ks.length; j++) if (!last || beats(ks[j], last)) { k = ks[j]; break; }
      if (!k) return;
      for (j = 0; j < cards.length; j++) if (wild(cards[j], L)) wu++;
      key = k.t + ":" + k.n + ":" + k.r; o = { cards: cards, k: k, wu: wu };
      if (idx[key] == null) { idx[key] = res.length; res.push(o); } else if (res[idx[key]].wu > wu) res[idx[key]] = o;
    }
    var P = Object.keys(byP).map(Number);
    for (i = 0; i < P.length; i++) {
      p = P[i]; g = byP[p];
      add([g[0]]);
      if (g.length >= 2) { add(g.slice(0, 2)); pairs.push({ p: p, c: g.slice(0, 2), w: p + (g.length === 2 ? 0 : g.length === 3 ? 6 : 20) + (p >= 15 ? 10 : 0) }); }
      else if (p < 16 && ws.length) add([g[0], ws[0]]);
      if (p >= 16) continue;
      if (g.length >= 3) { add(g.slice(0, 3)); trips.push({ p: p, c: g.slice(0, 3) }); }
      else if (g.length === 2 && ws.length) { add(g.concat(ws[0])); trips.push({ p: p, c: g.concat(ws[0]) }); }
      if (g.length >= 4) add(g.slice());
      for (k2 = 1; k2 <= ws.length; k2++) if (g.length >= 2 && g.length + k2 >= 4) add(g.concat(ws.slice(0, k2)));
    }
    if (ws.length) add([ws[0]]);
    if (ws.length >= 2) add([ws[0], ws[1]]);
    if ((byP[16] || []).length === 2 && (byP[17] || []).length === 2) add(byP[16].concat(byP[17]));
    pairs.sort(function (a, b) { return a.w - b.w; });
    for (i = 0; i < trips.length; i++) for (k2 = 0; k2 < pairs.length; k2++) if (pairs[k2].p !== trips[i].p) { add(trips[i].c.concat(pairs[k2].c)); break; }
    for (t = 5; t <= 14; t++) {
      cs = []; miss = 0;
      for (r = t - 4; r <= t; r++) { rr = r === 1 ? 14 : r; if (byN[rr]) cs.push(byN[rr][0]); else miss++; }
      if (miss <= ws.length) {
        if (cs.length > 1 && cs.every(function (x) { return suit(x) === suit(cs[0]); })) {
          for (r = 0; r < cs.length; r++) { g = byN[nat(cs[r])].filter(function (x) { return suit(x) !== suit(cs[0]); }); if (g.length) { cs[r] = g[0]; break; } }
        }
        add(cs.concat(ws.slice(0, miss)));
      }
      for (s = 0; s < 4; s++) {
        cs = []; miss = 0;
        for (r = t - 4; r <= t; r++) { rr = r === 1 ? 14 : r; c = bySN[s * 20 + rr]; if (c != null) cs.push(c); else miss++; }
        if (miss <= ws.length) add(cs.concat(ws.slice(0, miss)));
      }
    }
    for (t = 3; t <= 14; t++) {
      cs = []; miss = 0;
      for (r = t - 2; r <= t; r++) { rr = r === 1 ? 14 : r; g = byN[rr] || []; cs = cs.concat(g.slice(0, 2)); miss += Math.max(0, 2 - g.length); }
      if (miss <= ws.length) add(cs.concat(ws.slice(0, miss)));
    }
    for (t = 2; t <= 14; t++) {
      cs = []; miss = 0;
      for (r = t - 1; r <= t; r++) { rr = r === 1 ? 14 : r; g = byN[rr] || []; cs = cs.concat(g.slice(0, 3)); miss += Math.max(0, 3 - g.length); }
      if (miss <= ws.length) add(cs.concat(ws.slice(0, miss)));
    }
    res.sort(function (a, b) { var x = isB(a.k), y = isB(b.k); return x !== y ? (x ? 1 : -1) : x ? bs(a.k) - bs(b.k) : (a.k.r - b.k.r) || (a.wu - b.wu); });
    return res;
  }

  // 一手牌「还要出几手才能走完」的估分，越小越好：炸弹是抢回出牌权的本钱（减分），小单张最拖累（加分）
  function cost(hand, L) {
    if (!hand.length) return -100;
    var cn = [], i, c, n, nw = 0, js = 0, jb = 0, v = 0, t, r, rr, best, k, T = 0, pc = [], p;
    for (i = 0; i <= 14; i++) cn[i] = 0;
    for (i = 0; i < hand.length; i++) { c = hand[i]; if (wild(c, L)) nw++; else if (isJ(c)) { if (nat(c) === 16) js++; else jb++; } else cn[nat(c)]++; }
    if (js === 2 && jb === 2) v -= 1.2; else { if (js) v += 0.45; if (jb) v += 0.3; }
    for (r = 2; r <= 14; r++) if (cn[r] >= 4) { v -= 0.6 + 0.15 * (cn[r] - 4); cn[r] = 0; }
    for (r = 2; r <= 14 && nw; r++) if (cn[r] === 3 && r !== L) { v -= 0.6; cn[r] = 0; nw--; }
    for (;;) {
      best = 0; k = 2;
      for (t = 5; t <= 14; t++) {
        n = 0;
        for (r = t - 4; r <= t; r++) { rr = r === 1 ? 14 : r; if (!cn[rr]) { n = -9; break; } if (cn[rr] === 1 && rr !== L) n++; }
        if (n > k) { k = n; best = t; }
      }
      if (!best) break;
      for (r = best - 4; r <= best; r++) cn[r === 1 ? 14 : r]--;
      v += 0.9;
    }
    for (t = 3; t <= 14; t++) { rr = t - 2 === 1 ? 14 : t - 2; if (cn[rr] === 2 && cn[t - 1] === 2 && cn[t] === 2) { cn[rr] = cn[t - 1] = cn[t] = 0; v += 0.9; } }
    for (t = 2; t <= 14; t++) { rr = t - 1 === 1 ? 14 : t - 1; if (cn[rr] === 3 && cn[t] === 3) { cn[rr] = cn[t] = 0; v += 0.9; } }
    for (r = 2; r <= 14; r++) {
      n = cn[r]; if (!n) continue;
      p = r === L ? 15 : r;
      k = p === 15 ? 0.5 : p === 14 ? 0.75 : 1 + (14 - p) * 0.012 + (n === 1 ? 0.15 : 0);
      v += k;
      if (n === 3) T++; else if (n === 2) pc.push(k);
    }
    pc.sort(function (a, b) { return b - a; });
    for (i = 0; i < T && i < pc.length; i++) v -= pc[i] * 0.9;
    return v + nw * 0.1;
  }

  // 机器人出牌：返回要出的牌；null = 不出
  function bot(G, s) {
    var L = G.L, hand = G.hands[s], last = G.last ? G.last.k : null, who = G.last ? G.last.who : -1, mate = (s + 2) % 4;
    var opts = gen(hand, L, last), c0 = cost(hand, L), i, o, x, d;
    if (!opts.length) return null;
    for (i = 0; i < opts.length; i++) { o = opts[i]; o.c = cost(minus(hand, o.cards), L); if (o.c <= -100) return o.cards; }
    var n1 = G.hands[(s + 1) % 4].length, n2 = G.hands[(s + 3) % 4].length, nm = G.hands[mate].length, danger = Math.min(n1 || 99, n2 || 99);
    var nb = opts.filter(function (y) { return !isB(y.k); }), bb = opts.filter(function (y) { return isB(y.k); });
    function pick(list, f) { var b = null, bv = 1e9, j, v; for (j = 0; j < list.length; j++) { v = f(list[j]); if (v < bv) { bv = v; b = list[j]; } } return b; }
    if (!last) {
      if (!nb.length) return bb[0].cards;
      var pool = nb;
      if (nm === 1) { x = nb.filter(function (y) { return y.k.t === "single"; }); if (x.length && x[0].k.r < 14) return x[0].cards; }
      if (nm === 2) { x = nb.filter(function (y) { return y.k.t === "pair"; }); if (x.length && x[0].k.r < 12) return x[0].cards; }
      if (danger === 1) { x = nb.filter(function (y) { return y.k.t !== "single"; }); if (x.length) pool = x; else return nb[nb.length - 1].cards; }
      else if (danger === 2) { x = nb.filter(function (y) { return y.k.t !== "pair"; }); if (x.length) pool = x; }
      return pick(pool, function (y) { return y.c + y.k.r * 0.02 - y.k.n * 0.04; }).cards;
    }
    if (who === mate) {
      if ((last.t === "single" || last.t === "pair" || last.t === "triple") && last.r <= 10 && nm > 2) {
        x = nb.filter(function (y) { return y.c - c0 <= -0.6 && y.k.r <= 14; });
        if (x.length) return x[0].cards;
      }
      return null;
    }
    var urgent = G.hands[who].length <= 6;
    o = pick(nb, function (y) { return y.c + y.k.r * 0.02; });
    if (o) { d = o.c - c0; if (d <= 0.35 || urgent || (d <= 1.2 && danger <= 10)) return o.cards; }
    if (bb.length) {
      o = bb[0];
      if (urgent || o.c <= 1.3 || (isB(last) && (bb.length >= 2 || G.hands[who].length <= 12)) || (last.n >= 5 && bb.length >= 2) || bb.length >= 3) return o.cards;
    }
    return null;
  }

  // 还贡挑哪张：10 以下、最没用的一张（落单的小牌优先）
  function backPick(hand, L) {
    var cnt = {}, i, p, best = -1, bv = 1e9, v;
    for (i = 0; i < hand.length; i++) { p = pw(hand[i], L); cnt[p] = (cnt[p] || 0) + 1; }
    for (i = 0; i < hand.length; i++) {
      if (wild(hand[i], L)) continue;
      p = pw(hand[i], L); v = p + (cnt[p] === 1 ? 0 : cnt[p] === 2 ? 20 : 40) + (p > 10 ? 100 : 0);
      if (v < bv) { bv = v; best = hand[i]; }
    }
    return best;
  }
  function canBack(hand, c, L) { if (hand.indexOf(c) < 0) return false; if (pw(c, L) <= 10) return true; return !hand.some(function (x) { return pw(x, L) <= 10; }); }

  function newMatch() { return { lv: [2, 2], cur: -1, L: 2, hands: [[], [], [], []], turn: 0, last: null, tb: [null, null, null, null], out: [], ph: "idle", prev: null, trib: null, rd: 0, res: null, wind: -1 }; }
  function bigOf(hand, L) { var b = -1, i; for (i = 0; i < hand.length; i++) if (!wild(hand[i], L) && (b < 0 || pw(hand[i], L) > pw(b, L))) b = hand[i]; return b; }
  function nBJ(hand) { var n = 0, i; for (i = 0; i < hand.length; i++) if (cid(hand[i]) === 53) n++; return n; }
  function move(G, f, t, c) { G.hands[f].splice(G.hands[f].indexOf(c), 1); G.hands[t].push(c); sortH(G.hands[t], G.L); }
  // 进贡：上一局垫底的把最大的一张（百搭除外）给头游；双下两个人都给。输家手里凑齐两个大王 = 抗贡
  function tribute(G) {
    var o = G.prev, L = G.L, items = [], a, b, ca, cb, anti = false;
    if (o[0] % 2 === o[1] % 2) {
      a = o[2]; b = o[3];
      if (nBJ(G.hands[a]) + nBJ(G.hands[b]) === 2) anti = true;
      else {
        ca = bigOf(G.hands[a], L); cb = bigOf(G.hands[b], L);
        if (pw(cb, L) > pw(ca, L)) items.push({ f: b, t: o[0], c: cb, b: -1 }, { f: a, t: o[1], c: ca, b: -1 });
        else items.push({ f: a, t: o[0], c: ca, b: -1 }, { f: b, t: o[1], c: cb, b: -1 });
      }
    } else {
      a = o[3];
      if (nBJ(G.hands[a]) === 2) anti = true; else items.push({ f: a, t: o[0], c: bigOf(G.hands[a], L), b: -1 });
    }
    for (a = 0; a < items.length; a++) move(G, items[a].f, items[a].t, items[a].c);
    G.trib = { items: items, anti: anti, lead: anti ? o[0] : items[0].f, i: 0 };
    G.turn = G.trib.lead; G.ph = items.length ? "trib" : "play";
  }
  function giveBack(G, c) {
    var T = G.trib, it;
    if (G.ph !== "trib" || !T) return false;
    it = T.items[T.i];
    if (!canBack(G.hands[it.t], c, G.L)) return false;
    move(G, it.t, it.f, c); it.b = c; T.i++;
    if (T.i >= T.items.length) G.ph = "play";
    return true;
  }
  function startRound(G, rnd) {
    var d = [], i, j, x;
    for (i = 0; i < 108; i++) d.push(i);
    for (i = 107; i > 0; i--) { j = (rnd() * (i + 1)) | 0; x = d[i]; d[i] = d[j]; d[j] = x; }
    G.rd++; G.L = G.cur < 0 ? 2 : G.lv[G.cur]; G.hands = [[], [], [], []];
    for (i = 0; i < 108; i++) G.hands[i % 4].push(d[i]);
    for (i = 0; i < 4; i++) sortH(G.hands[i], G.L);
    G.out = []; G.last = null; G.tb = [null, null, null, null]; G.res = null; G.wind = -1; G.trib = null;
    if (!G.prev) { G.turn = (rnd() * 4) | 0; G.ph = "play"; return; }
    tribute(G);
  }
  // 结算：头游的队友是二游升 3 级，三游升 2 级，末游升 1 级。打 A 的一方头游而且队友不垫底 = 打过 A，整场赢
  function settle(G) {
    var o = G.out, w = o[0] % 2, pos = o.indexOf((o[0] + 2) % 4), up = pos === 1 ? 3 : pos === 2 ? 2 : 1, from = G.lv[w], win = false;
    if (G.cur === w && G.L === 14 && up >= 2) win = true; else G.lv[w] = Math.min(14, from + up);
    G.res = { o: o.slice(), w: w, up: up, from: from, to: G.lv[w], win: win, L: G.L };
    G.cur = w; G.prev = o.slice(); G.ph = win ? "over" : "done";
  }
  function next(G, s) {
    var i, c, m;
    for (i = 1; i <= 4; i++) {
      c = (s + i) % 4;
      if (c === G.last.who) {
        G.last = null;
        if (G.hands[c].length) { G.turn = c; return; }
        m = (c + 2) % 4;
        if (G.hands[m].length) { G.turn = m; G.wind = m; return; }
        for (i = 1; i <= 3; i++) if (G.hands[(c + i) % 4].length) { G.turn = (c + i) % 4; return; }
        return;
      }
      if (G.hands[c].length) { G.turn = c; return; }
    }
  }
  function play(G, s, cards) {
    var h = G.hands[s], i, ks, k = null, m = {}, rest;
    if (G.ph !== "play" || G.turn !== s || !cards.length) return null;
    for (i = 0; i < cards.length; i++) { if (h.indexOf(cards[i]) < 0 || m[cards[i]]) return null; m[cards[i]] = 1; }
    ks = kinds(cards, G.L);
    for (i = 0; i < ks.length; i++) if (!G.last || beats(ks[i], G.last.k)) { k = ks[i]; break; }
    if (!k) return null;
    if (!G.last) G.tb = [null, null, null, null];
    G.hands[s] = minus(h, cards); G.wind = -1;
    G.last = { who: s, k: k }; G.tb[s] = { cards: cards.slice(), k: k };
    if (!G.hands[s].length) {
      G.out.push(s);
      if ((G.out.length === 2 && G.out[0] % 2 === G.out[1] % 2) || G.out.length === 3) {
        rest = [0, 1, 2, 3].filter(function (x) { return G.out.indexOf(x) < 0; }).sort(function (a, b) { return G.hands[a].length - G.hands[b].length; });
        G.out = G.out.concat(rest);
        settle(G); return k;
      }
    }
    next(G, s);
    return k;
  }
  function pass(G, s) { if (G.ph !== "play" || G.turn !== s || !G.last) return false; G.tb[s] = { pass: 1 }; next(G, s); return true; }

  var E = { kinds: kinds, beats: beats, isB: isB, gen: gen, cost: cost, bot: bot, backPick: backPick, canBack: canBack, newMatch: newMatch, startRound: startRound, giveBack: giveBack, play: play, pass: pass, pw: pw, nat: nat, suit: suit, wild: wild, isJ: isJ };
  if (!W) { (typeof globalThis !== "undefined" ? globalThis : this).GD = E; return; }
  if (!A) return;

  // ====================== 页面 ======================
  var G = null, sel = {}, hints = null, hi = 0, tm = 0, bound = false, drag = null, toastT = 0, toastTxt = "", toastEnd = 0, just = -1, showRule = false, resetArm = false, ST = {};
  var NAMES = ["你", "下家", "对家", "上家"], FACE = ["🧑", "🐯", "🐼", "🦊"], PLACE = ["头游", "二游", "三游", "末游"], MEDAL = ["🥇", "🥈", "🥉", "🐢"];
  var KN = { single: "单张", pair: "对子", triple: "三张", full: "三带二", straight: "顺子", tube: "三连对", plate: "钢板", bomb: "炸弹", sf: "同花顺", king: "天王炸" };
  function ls(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 存不了也能玩，只是刷新后不记得 */ } }
  function save() { lsSet("gd:g", G ? JSON.stringify(G) : ""); }
  function load() { try { var g = JSON.parse(ls("gd:g") || "null"); if (g && g.lv && g.hands && g.hands.length === 4 && g.ph && g.ph !== "idle") return g; } catch (e) { /* 存档坏了就当没有 */ } return null; }
  function stats() { try { ST = JSON.parse(ls("gd:st") || "{}") || {}; } catch (e) { ST = {}; } ST.w = ST.w || 0; ST.l = ST.l || 0; ST.best = ST.best || 2; return ST; }
  function cn(c) { return isJ(c) ? rn(nat(c)) : SUITS[suit(c)] + rn(nat(c)); }

  function cardH(c, extra, L) {
    var j = isJ(c), n = nat(c), s = suit(c), red = j ? n === 17 : (s === 1 || s === 3), lv = !j && n === L;
    var inner = j ? "<b>" + (n === 17 ? "大" : "小") + "<br>王</b><u>" + (n === 17 ? "♛" : "♚") + "</u>" : "<b>" + rn(n) + "</b><em>" + SUITS[s] + "</em><u>" + SUITS[s] + "</u>";
    return '<i class="gd-c ' + (red ? "r" : "k") + (j ? " jk" : "") + (lv ? (s === 1 ? " wd" : " lv") : "") + (extra ? " " + extra : "") + '" data-c="' + c + '">' + inner + (lv ? "<span>" + (s === 1 ? "配" : "级") + "</span>" : "") + "</i>";
  }
  function showOrder(t, L) {
    var cs = t.cards.slice(), k = t.k.t, cnt = {}, low;
    if (k === "straight" || k === "sf" || k === "tube" || k === "plate") {
      low = t.k.r === (k === "plate" ? 2 : k === "tube" ? 3 : 5);
      return cs.sort(function (a, b) { function key(c) { return wild(c, L) ? 99 : (low && nat(c) === 14) ? 1 : nat(c); } return key(a) - key(b); });
    }
    cs.forEach(function (c) { var p = wild(c, L) ? 0 : pw(c, L); cnt[p] = (cnt[p] || 0) + 1; });
    return cs.sort(function (a, b) { var pa = wild(a, L) ? 0 : pw(a, L), pb = wild(b, L) ? 0 : pw(b, L); return (cnt[pb] - cnt[pa]) || (pb - pa) || (a - b); });
  }
  function playH(seat) {
    var t = G.tb[seat], w = (seat === 0 || seat === 2) ? 232 : 108, cw = 32, n, step, i, h = "", cs, lab = "";
    if (!t) return "";
    if (t.pass) return '<span class="gd-pass' + (seat === just ? " in" : "") + '">不出</span>';
    n = t.cards.length; step = n > 1 ? Math.min(19, (w - cw) / (n - 1)) : 0; cs = showOrder(t, G.L);
    for (i = 0; i < n; i++) h += cardH(cs[i], "sm", G.L).replace('data-c=', 'style="left:' + (i * step).toFixed(1) + 'px" data-c=');
    if (isB(t.k)) lab = (t.k.t === "bomb" ? "💥 " + t.k.n + " 张炸弹" : t.k.t === "sf" ? "🌈 同花顺" : "👑 天王炸");
    else if (t.k.n >= 5) lab = KN[t.k.t];
    return '<span class="gd-pl' + (isB(t.k) ? " boom" : "") + (seat === just ? " in" : "") + '" style="width:' + (cw + (n - 1) * step).toFixed(0) + 'px">' + h + "</span>" + (lab ? '<span class="gd-kn">' + lab + "</span>" : "");
  }
  function seatH(s) {
    var n = G.hands[s].length, pos = G.out.indexOf(s), on = G.ph === "play" && G.turn === s;
    return '<div class="gd-seat s' + s + (on ? " on" : "") + (s === 2 ? " mate" : "") + '"><span class="gd-av">' + FACE[s] + (pos >= 0 ? '<i class="gd-md">' + MEDAL[pos] + "</i>" : "") + '</span><span class="gd-nm">' + NAMES[s] + (s === 2 ? "<small>队友</small>" : "") + '</span><span class="gd-n' + (pos < 0 && n <= 5 ? " hot" : "") + '">' + (pos >= 0 ? PLACE[pos] : "剩 " + n + " 张") + "</span></div>";
  }
  function topH() {
    return '<div class="gd-top"><a class="gd-x" href="#/play" aria-label="回销毁乐园">‹</a><span class="gd-tm me' + (G.cur === 0 ? " cur" : "") + '">我方 打 <b>' + rn(G.lv[0]) + '</b></span><span class="gd-cur">本局级牌 <b>' + rn(G.L) + "</b><i>♥" + rn(G.L) + ' 百搭</i></span><span class="gd-tm op' + (G.cur === 1 ? " cur" : "") + '">对方 打 <b>' + rn(G.lv[1]) + '</b></span><button class="gd-q" data-gd="rule" aria-label="规则">?</button></div>';
  }
  function midH() {
    var t = G.turn;
    if (G.ph === "trib") return "进贡 · 还贡";
    if (G.ph !== "play") return "";
    if (t === 0) return G.last ? "轮到你 · 要压过" + NAMES[G.last.who] : (G.wind === 0 ? "对家走完了，你接风 · 随便出" : "轮到你 · 随便出一手");
    return (G.wind === t ? NAMES[t] + "接风 · " : "") + "等" + NAMES[t] + "出牌…";
  }
  function noteH() {
    var T = G.trib, left = G.hands[0].length + G.hands[1].length + G.hands[2].length + G.hands[3].length, t;
    if (!T || (G.ph !== "trib" && left !== 108)) return "";
    if (T.anti) t = "抗贡：垫底的一方抓到两个大王，这局不用进贡，" + NAMES[T.lead] + "先出。";
    else t = T.items.map(function (it) { return NAMES[it.f] + "进贡 <b>" + cn(it.c) + "</b> 给" + NAMES[it.t] + (it.b >= 0 ? "，" + NAMES[it.t] + "还 <b>" + cn(it.b) + "</b>" : ""); }).join("；") + "。";
    return '<p class="gd-note">' + t + "</p>";
  }
  function barH() {
    var it, pos;
    if (G.ph === "trib") { it = G.trib.items[G.trib.i]; if (it && it.t === 0) return '<div class="gd-bar"><span class="gd-tip">点一张 10 以下的牌还给' + NAMES[it.f] + '</span><button class="gd-b go" data-gd="back" id="gd-go">还这张</button></div>'; }
    if (G.ph === "play" && G.turn === 0) return '<div class="gd-bar">' + (G.last ? '<button class="gd-b" data-gd="pass">不出</button>' : "") + '<button class="gd-b" data-gd="hint">提示</button><button class="gd-b go" data-gd="play" id="gd-go">出牌</button></div>';
    pos = G.out.indexOf(0);
    return '<div class="gd-bar"><span class="gd-tip">' + (pos >= 0 && G.ph === "play" ? "你是" + PLACE[pos] + " " + MEDAL[pos] + "，看队友的了" : G.ph === "play" ? "等别人出牌，可以先把牌选好" : "") + "</span></div>";
  }
  function handH() {
    var h = G.hands[0], i, s = "";
    for (i = 0; i < h.length; i++) s += cardH(h[i], "", G.L);
    return '<div class="gd-hand" id="gd-hand">' + s + "</div>";
  }
  function resH() {
    var R = G.res, me = R.w === 0, o = R.o, i, rows = "", how = R.up === 3 ? "头游 + 二游（双下）" : R.up === 2 ? "头游 + 三游" : "头游 + 末游", side = me ? "我方" : "对方", line;
    for (i = 0; i < 4; i++) rows += '<span class="' + (o[i] % 2 === 0 ? "me" : "") + '">' + MEDAL[i] + " " + PLACE[i] + " · " + NAMES[o[i]] + "</span>";
    if (R.win) line = side + "打过了 A，整场结束。";
    else if (R.to === R.from) line = side + how + "，还在打 A（要头游、而且队友不垫底才算过）。";
    else line = side + how + "，升 " + (R.to - R.from) + " 级：打 " + rn(R.from) + " → 打 " + rn(R.to) + "。";
    return '<div class="gd-ov"><div class="gd-res ' + (me ? "win" : "lose") + '"><div class="gd-rt">' + (R.win ? (me ? "🏆 打过 A，通关！" : "这场输了，再来") : (me ? "🎉 这局赢了" : "😵 这局输了")) + '</div><div class="gd-rs">' + line + '</div><div class="gd-ro">' + rows + '</div><button class="gd-b go ok" data-gd="' + (R.win ? "new" : "next") + '">' + (R.win ? "再来一场" : "下一局") + "</button></div></div>";
  }
  var RULES = "<li>四个人打两副牌。你和对面的<b>对家</b>是一队，一起打上家、下家。</li>" +
    "<li>谁先把手里的牌出完谁是<b>头游</b>。头游的队友是二游，升 3 级；是三游，升 2 级；是末游，升 1 级。</li>" +
    "<li>从 2 打起，<b>打过 A 就赢一整场</b>。打 A 那局要头游、而且队友不垫底才算过。</li>" +
    "<li><b>级牌</b>：这局打几，几就比 A 大，只比王小。<b>红桃级牌是百搭</b>，可以当任何一张牌用（不能当王）。</li>" +
    "<li>牌型：单张、对子、三张、三带二、顺子（5 张）、三连对、钢板（两个连着的三张）。</li>" +
    "<li>炸弹从小到大：4 张炸 → 5 张炸 → 同花顺 → 6 张及以上 → 四个王。炸弹能压任何别的牌型。</li>" +
    "<li><b>进贡</b>：上一局垫底的，要把最大的一张牌给头游，头游还一张 10 以下的牌。双下两个人都要进贡。垫底的一方抓到两个大王可以不进贡。</li>" +
    "<li>队友走完了、没人压他最后一手，就由你<b>接风</b>先出。</li>";
  function ruleH() {
    return '<div class="gd-sheet" data-gd="rule"><div class="gd-sh" data-gd="noop"><h3>掼蛋怎么打</h3><ul>' + RULES + '</ul><p class="gd-safe">纯娱乐：不收费、不用连钱包、没有任何币进出。</p><div class="gd-shb"><button class="gd-b" data-gd="reset">' + (resetArm ? "再点一次，确认重开" : "重新开一场") + '</button><button class="gd-b go ok" data-gd="rule">继续打牌</button></div></div></div>';
  }

  function layHand() {
    var box = document.getElementById("gd-hand"), els, n, w, rows, per, r, i, k, step, off, el, z = 1;
    if (!box) return;
    els = box.children; n = els.length; w = box.clientWidth; rows = n > 14 ? 2 : 1; per = Math.ceil(n / rows);
    for (r = 0; r < rows; r++) {
      k = r === 0 ? per : n - per; step = k > 1 ? Math.min(36, (w - 48) / (k - 1)) : 0; off = (w - (48 + (k - 1) * step)) / 2;
      for (i = 0; i < k; i++) { el = els[r * per + i]; el.style.left = (off + i * step).toFixed(1) + "px"; el.style.top = (18 + r * 54) + "px"; el.style.zIndex = z++; }
    }
    box.style.height = (n ? (rows === 2 ? 144 : 90) : 36) + "px";
  }
  function selected() { return G.hands[0].filter(function (c) { return sel[c]; }); }
  function refreshSel() {
    var box = document.getElementById("gd-hand"), go = document.getElementById("gd-go"), i, el, cs, ks, k = null;
    if (!box || !G) return;
    for (i = 0; i < box.children.length; i++) { el = box.children[i]; el.classList.toggle("up", !!sel[el.getAttribute("data-c")]); }
    if (!go) return;
    cs = selected();
    if (G.ph === "trib") { go.classList.toggle("ok", cs.length === 1 && E.canBack(G.hands[0], cs[0], G.L)); return; }
    ks = kinds(cs, G.L);
    for (i = 0; i < ks.length; i++) if (!G.last || beats(ks[i], G.last.k)) { k = ks[i]; break; }
    go.classList.toggle("ok", !!k); go.textContent = k ? "出牌 · " + KN[k.t] : "出牌";
  }
  function toast(t) { toastTxt = t; toastEnd = Date.now() + 1300; showToast(); }
  function showToast() {
    var tb = document.querySelector("#gd-root .gd-table"), el = document.getElementById("gd-toast");
    if (el) el.parentNode.removeChild(el);
    if (!tb || !toastTxt || Date.now() > toastEnd) return;
    el = document.createElement("div"); el.id = "gd-toast"; el.className = "gd-toast"; el.textContent = toastTxt; tb.appendChild(el);
    clearTimeout(toastT);
    toastT = setTimeout(function () { var e2 = document.getElementById("gd-toast"); if (e2) e2.parentNode.removeChild(e2); }, Math.max(200, toastEnd - Date.now()));
  }
  function draw() {
    if (!G || G.ph === "idle") return lobby();
    A.app.innerHTML = '<section class="gd" id="gd-root">' + topH() + '<div class="gd-table">' + seatH(2) + seatH(3) + seatH(1) +
      '<div class="gd-p p2">' + playH(2) + '</div><div class="gd-p p3">' + playH(3) + '</div><div class="gd-p p1">' + playH(1) + '</div><div class="gd-p p0">' + playH(0) + "</div>" +
      '<div class="gd-mid">' + midH() + "</div>" + (G.ph === "done" || G.ph === "over" ? resH() : "") + "</div>" + noteH() + barH() + handH() + (showRule ? ruleH() : "") + "</section>";
    layHand(); refreshSel(); showToast();
  }
  function lobby() {
    var fan = [12, 24, 53, 49, 35], i, f = "";
    stats();
    for (i = 0; i < fan.length; i++) f += cardH(fan[i], "", 0);
    A.app.innerHTML = '<section class="gd" id="gd-root"><div class="gd-hero"><div class="gd-fan">' + f + '</div><h2>掼蛋</h2><p>两副牌 · 你和对家一队 · 从 2 一路打到 A</p><button class="gd-b go ok big" data-gd="new">开始打牌</button>' +
      (ST.w + ST.l ? '<div class="gd-st">战绩：赢 ' + ST.w + " 场 · 输 " + ST.l + " 场 · 最高打到 " + rn(ST.best) + "</div>" : "") +
      '<p class="gd-safe">纯娱乐：不收费、不用连钱包、没有任何币进出。打到一半关掉，下次接着打。</p></div><details class="gd-rules" open><summary>掼蛋怎么打（一分钟看懂）</summary><ul>' + RULES + "</ul></details></section>";
  }

  // 每次牌局变了以后：机器人还贡 → 存档 → 重画 → 安排下一个机器人
  function step() {
    var it;
    clearTimeout(tm);
    while (G.ph === "trib") { it = G.trib.items[G.trib.i]; if (it.t === 0) break; E.giveBack(G, backPick(G.hands[it.t], G.L)); }
    if ((G.ph === "done" || G.ph === "over") && G.sc !== G.rd) {
      G.sc = G.rd; toastTxt = ""; stats();
      if (G.lv[0] > ST.best) ST.best = G.lv[0];
      if (G.ph === "over") { if (G.res.w === 0) ST.w++; else ST.l++; }
      lsSet("gd:st", JSON.stringify(ST));
    }
    save(); draw(); just = -1;
    if (G.ph !== "play") return;
    if (G.turn !== 0) { tm = setTimeout(botAct, G.hands[0].length ? (G.last ? 750 : 1100) : 380); return; }
    hints = null; hi = 0;
    if (G.last && !gen(G.hands[0], G.L, G.last.k).length) {
      toast("要不起");
      tm = setTimeout(function () { if (G && G.ph === "play" && G.turn === 0 && G.last && document.getElementById("gd-root")) { E.pass(G, 0); sel = {}; just = 0; step(); } }, 900);
    }
  }
  function botAct() {
    var s, cs;
    try {
      if (!G || G.ph !== "play" || G.turn === 0 || !document.getElementById("gd-root")) return;
      s = G.turn; cs = bot(G, s);
      if (!cs || !play(G, s, cs)) { if (G.last) pass(G, s); else play(G, s, [G.hands[s][G.hands[s].length - 1]]); }
      just = s; step();
    } catch (e) { /* 机器人出错不让整页挂掉：停在原地，刷新能接着打 */ }
  }
  function doAct(a) {
    var cs, k, b, i;
    if (a === "noop") return;
    if (a === "new") { G = newMatch(); sel = {}; showRule = false; startRound(G, Math.random); return step(); }
    if (!G) return;
    if (a === "rule") { showRule = !showRule; resetArm = false; return draw(); }
    if (a === "reset") { if (!resetArm) { resetArm = true; return draw(); } clearTimeout(tm); G = null; sel = {}; showRule = false; resetArm = false; save(); return lobby(); }
    if (a === "next") { if (G.ph !== "done") return; sel = {}; startRound(G, Math.random); return step(); }
    if (a === "back") {
      cs = selected();
      if (cs.length !== 1 || !E.giveBack(G, cs[0])) return toast("要选一张 10 以下的牌（级牌不算）");
      sel = {}; return step();
    }
    if (G.ph !== "play" || G.turn !== 0) return;
    if (a === "pass") { if (pass(G, 0)) { sel = {}; just = 0; step(); } return; }
    if (a === "hint") {
      if (!hints) {
        hints = gen(G.hands[0], G.L, G.last ? G.last.k : null); hi = 0;
        if (!G.last) { b = bot(G, 0); if (b) { for (i = 0; i < hints.length; i++) if (hints[i].cards.join() === b.join()) { hints.unshift(hints.splice(i, 1)[0]); break; } } }
      }
      if (!hints.length) return toast("没有能压过的牌");
      sel = {}; hints[hi % hints.length].cards.forEach(function (c) { sel[c] = 1; }); hi++;
      return refreshSel();
    }
    if (a === "play") {
      cs = selected();
      if (!cs.length) return toast("先点要出的牌");
      k = play(G, 0, cs);
      if (!k) return toast(G.last && kinds(cs, G.L).length ? "这手压不过，换一手" : "这几张凑不成牌型");
      sel = {}; just = 0; return step();
    }
  }
  function onClick(e) {
    try {
      var el = e.target && e.target.closest ? e.target.closest("[data-gd]") : null;
      if (!el || !document.getElementById("gd-root")) return;
      doAct(el.getAttribute("data-gd"));
    } catch (err) { /* 点坏了不影响网站别的地方 */ }
  }
  // 点牌 / 按住滑过去一排一起选
  function handCard(el) { while (el && el.nodeType === 1) { if (el.classList.contains("gd-c") && el.parentNode && el.parentNode.id === "gd-hand") return el; el = el.parentNode; } return null; }
  function onDown(e) {
    try {
      var el = handCard(e.target), c;
      if (!el || !G) return;
      c = el.getAttribute("data-c"); drag = { on: !sel[c], seen: {} }; drag.seen[c] = 1;
      if (drag.on) sel[c] = 1; else delete sel[c];
      refreshSel(); e.preventDefault();
    } catch (err) { drag = null; }
  }
  function onMove(e) {
    if (!drag) return;
    try {
      var el = handCard(document.elementFromPoint(e.clientX, e.clientY)), c;
      if (!el) return;
      c = el.getAttribute("data-c");
      if (drag.seen[c]) return;
      drag.seen[c] = 1;
      if (drag.on) sel[c] = 1; else delete sel[c];
      refreshSel();
    } catch (err) { drag = null; }
  }
  function onUp() { drag = null; }

  A.pages.gd = function () {
    try {
      if (!bound) {
        bound = true;
        document.addEventListener("click", onClick); document.addEventListener("pointerdown", onDown); document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp); document.addEventListener("pointercancel", onUp);
        W.addEventListener("resize", function () { try { layHand(); } catch (e) { /* 不在掼蛋页就什么都不做 */ } });
      }
      if (document.getElementById("gd-root")) return; // 网站后台刷新数据会重画当前页：牌局不能被冲掉
      if (!G) G = load();
      if (G) step(); else lobby();
    } catch (e) { A.app.innerHTML = '<section class="card"><p class="note">掼蛋页面打开失败，请刷新再试。</p></section>'; }
  };
})();
