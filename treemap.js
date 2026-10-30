// 团队数据：全部用定长数组保存（百万个地址也不给每个地址建对象），结构图、搜索、路径、名单导出都用它。
// 来源：/api/tree 的 JSON（普通团队）或 /api/bigtree 的压缩二进制（8 万个地址以上的超大团队）。
(function () {
  "use strict";

  // ---------- 团队数据：全部用定长数组（百万个地址约 100MB 以内，不给每个地址建对象） ----------
  // src：{ n, addr: Uint8Array(20n) 地址字节, parent: Int32Array（自己为 -1，上级下标一定小于下级）, self: 个人算力, level: Uint8Array 官方等级, at }
  var HEX = []; for (var h = 0; h < 256; h++) HEX.push((h < 16 ? "0" : "") + h.toString(16));
  function team(src) {
    var n = src.n, parent = src.parent, self = src.self, addrB = src.addr;
    var teamN = new Int32Array(n), power = new Float64Array(n), depth = new Uint16Array(n), start = new Int32Array(n + 1), list = new Int32Array(Math.max(0, n - 1));
    var i, p;
    for (i = n - 1; i > 0; i--) { p = parent[i]; teamN[p] += 1 + teamN[i]; power[p] += power[i] + self[i]; }
    for (i = 1; i < n; i++) { depth[i] = depth[parent[i]] + 1; start[parent[i] + 1]++; }
    for (i = 0; i < n; i++) start[i + 1] += start[i];
    var fill = start.slice(0, n);
    for (i = 1; i < n; i++) list[fill[parent[i]]++] = i;
    // 每个人的下级按团队算力从大到小排（一区、二区、三区在前）
    var rank = new Int32Array(n), tmp = [];
    for (i = 0; i < n; i++) {
      var a = start[i], b = start[i + 1];
      if (b - a > 1) {
        tmp.length = 0;
        for (var t = a; t < b; t++) tmp.push(list[t]);
        tmp.sort(function (x, y) { return power[y] - power[x] || teamN[y] - teamN[x]; });
        for (t = a; t < b; t++) list[t] = tmp[t - a];
      }
      for (t = a; t < b; t++) rank[list[t]] = t - a;
    }
    var zone = new Uint8Array(n);
    for (t = start[0]; t < Math.min(start[1], start[0] + 3); t++) if (power[list[t]] > 0) zone[list[t]] = t - start[0] + 1;
    function addr(j) { var s2 = "0x", o = j * 20; for (var q = 0; q < 20; q++) s2 += HEX[addrB[o + q]]; return s2; }
    var D = {
      n: n, at: src.at, bytes: addrB, parent: parent, self: self, level: src.level, team: teamN, power: power, depth: depth, start: start, list: list, rank: rank, zone: zone,
      addr: addr,
      kids: function (j) { return list.subarray(start[j], start[j + 1]); },
      info: function (j) { return { a: addr(j), team: teamN[j], power: power[j], self: self[j], level: src.level[j], zone: zone[j], direct: start[j + 1] - start[j] }; },
      // 从自己到 j 的路径（下标）
      path: function (j) { var r = []; for (var x = j; x >= 0; x = parent[x]) r.unshift(x); return r; },
      // 位置编号：一区第 3 个直推的第 2 个直推 → 1.3.2
      pos: function (j) { return D.path(j).slice(1).map(function (x) { return rank[x] + 1; }).join("."); },
      // 按地址开头或结尾查找（输 4 位以上）；完整地址精确匹配
      find: function (q) {
        q = q.toLowerCase().replace(/^0x/, "").replace(/[^0-9a-f]/g, "");
        if (q.length < 4) return [];
        var hits = [], L = q.length;
        for (var j = 0; j < n && hits.length < 20; j++) {
          var o = j * 20, pre = true, suf = true;
          for (var c = 0; c < L && (pre || suf); c++) {
            if (pre) { var bt = addrB[o + (c >> 1)], nib = c & 1 ? bt & 15 : bt >> 4; if (nib !== parseInt(q[c], 16)) pre = false; }
            if (suf && L <= 40) { var cc = 40 - L + c, bt2 = addrB[o + (cc >> 1)], nib2 = cc & 1 ? bt2 & 15 : bt2 >> 4; if (nib2 !== parseInt(q[c], 16)) suf = false; }
          }
          if (pre || suf) { if (L === 40 && pre) return [j]; hits.push(j); }
        }
        return hits;
      }
    };
    return D;
  }
  // 地址字符串 → 字节
  function hexBytes(list) {
    var out = new Uint8Array(list.length * 20);
    for (var j = 0; j < list.length; j++) { var hx = list[j].replace(/^0x/, ""); for (var q = 0; q < 20; q++) out[j * 20 + q] = parseInt(hx.substr(q * 2, 2), 16); }
    return out;
  }
  // 读 /api/bigtree 的二进制文件（格式见 monita/big_team_build.py）
  function fromBinary(buf) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf);
    if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== "AILT") throw new Error("数据格式不对");
    var n = dv.getUint32(8, true), at = dv.getFloat64(12, true), o = 20;
    var addr = u8.slice(o, o + 20 * n); o += 20 * n;
    var parent = new Int32Array(buf.slice(o, o + 4 * n)); o += 4 * n;
    var self = new Float32Array(buf.slice(o, o + 4 * n)); o += 4 * n;
    var level = u8.slice(o, o + n);
    return team({ n: n, addr: addr, parent: parent, self: self, level: level, at: at });
  }

  window.AIL = window.AIL || {};
  window.AIL.treeMap = { team: team, hexBytes: hexBytes, fromBinary: fromBinary };
})();
