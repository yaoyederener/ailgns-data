// 服务器端共用：从 Anubis 链读团队结构、批量读算力、读官方等级
export const RPCS = ["https://rpc.anubispace.org", "https://rpc2.anubispace.org", "https://rpc3.anubispace.org"];
const COMMUNITY = "0xc9f9a8a2dBf8188AD6610e0239105CAbE67c4993";
const POWER = "0x9E68F61E2615cc1D2C4a2D0026bFc1EBFdf68C1b";
const POWER_OF = "0x4f343040"; // totalPowerOf：已登记算力（含排队中），和官方「团队算力」口径接近
const MAX_MEMBERS = 80000;

const pad = (a) => a.toLowerCase().replace("0x", "").padStart(64, "0");
const u256 = (v) => v.toString(16).padStart(64, "0");

// JSON-RPC 批量请求：每批 300 个，失败换节点重试
export async function batch(calls, size = 300) {
  const out = new Array(calls.length).fill(null);
  const starts = [];
  for (let i = 0; i < calls.length; i += size) starts.push(i);
  let next = 0;
  async function worker(w) {
    while (next < starts.length) {
      const start = starts[next++];
      const part = calls.slice(start, start + size).map((c, i) => ({ jsonrpc: "2.0", id: i, ...c }));
      let done = false;
      for (let k = 0; k < RPCS.length * 2 && !done; k++) {
        try {
          const r = await fetch(RPCS[(w + k) % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(part) });
          const arr = await r.json();
          for (const x of arr) if (!x.error) out[start + x.id] = x.result;
          done = true;
        } catch (e) { /* 换一个节点再试 */ }
      }
      if (!done) throw new Error("rpc failed");
    }
  }
  await Promise.all([0, 1, 2, 3, 4, 5].map(worker));
  return out;
}

// 从 root 往下一层层读出团队：每个人的上级、直推线、层级
export async function buildTeam(root) {
  const refCall = (a, off, lim) => ({ method: "eth_call", params: [{ to: COMMUNITY, data: "0xc01b35a1" + pad(a) + u256(off) + u256(lim) }, "latest"] });
  const team = new Map([[root, { line: "self", depth: 0, parent: null }]]);
  let jobs = [{ parent: root, off: 0, lim: 1, probe: true }];
  for (let round = 0; jobs.length && round < 400; round++) {
    const res = await batch(jobs.map((j) => refCall(j.parent, j.off, j.lim)), 400);
    const next = [];
    jobs.forEach((j, i) => {
      const h = res[i];
      if (!h) return; // 没有直推时 limit=1 会被拒绝
      if (j.probe) {
        const total = parseInt(h.slice(2, 66), 16);
        for (let off = 1; off < total; off += 100) next.push({ parent: j.parent, off, lim: Math.min(100, total - off) });
      }
      const len = parseInt(h.slice(2 + 128, 2 + 192), 16), par = team.get(j.parent);
      for (let k = 0; k < len; k++) {
        const c = "0x" + h.slice(2 + (3 + k) * 64 + 24, 2 + (4 + k) * 64);
        if (team.has(c)) continue;
        team.set(c, { line: j.parent === root ? c : par.line, depth: par.depth + 1, parent: j.parent });
        next.push({ parent: c, off: 0, lim: 1, probe: true });
      }
    });
    if (team.size > MAX_MEMBERS) throw new Error("team too large");
    jobs = next;
  }
  // list：[地址, 直推线编号, 第几层, 上级在 list 里的位置（-1 = root）]
  const lines = [], idx = new Map(), list = [], pos = new Map();
  for (const [a, v] of team) {
    if (a === root) continue;
    if (!idx.has(v.line)) { idx.set(v.line, lines.length); lines.push(v.line); }
    pos.set(a, list.length);
    list.push([a, idx.get(v.line), v.depth, v.parent === root ? -1 : pos.get(v.parent)]);
  }
  return { v: 2, root, at: Date.now(), lines, list };
}

// 完整结构图数据：团队结构 + 每个人的已登记算力 + 团队算力较大的人的官方等级
export async function buildTree(root, team) {
  team = team || await buildTeam(root);
  const all = [root].concat(team.list.map((x) => x[0]));
  const res = await batch(all.map((a) => ({ method: "eth_call", params: [{ to: POWER, data: POWER_OF + pad(a) }, "latest"] })));
  const power = res.map((h) => (h ? Number(BigInt(h.slice(0, 66))) / 1e18 : 0));
  // 自下而上算团队算力，只给可能有等级的人查官方等级（P1 至少三个区各 5 万 DAI）
  const sub = new Array(all.length).fill(0);
  for (let i = team.list.length - 1; i >= 0; i--) {
    const p = team.list[i][3] + 1;
    sub[p] += sub[i + 1] + power[i + 1];
  }
  const big = all.map((a, i) => i).filter((i) => sub[i] >= 300000).sort((x, y) => sub[y] - sub[x]).slice(0, 150);
  const level = new Array(all.length).fill(0);
  let k = 0;
  await Promise.all([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(async () => {
    while (k < big.length) {
      const i = big[k++];
      try {
        const r = await fetch("https://awakehelix.io/api/v1/level/" + all[i]);
        if (r.ok) level[i] = (await r.json()).level || 0;
      } catch (e) { /* 读不到就当没有等级 */ }
    }
  }));
  return {
    v: 3, root, at: Date.now(), lines: team.lines, rootPower: Math.round(power[0] * 100) / 100, rootLevel: level[0],
    // [地址, 直推线编号, 第几层, 上级位置, 个人算力, 官方等级]
    list: team.list.map((x, i) => [x[0], x[1], x[2], x[3], Math.round(power[i + 1] * 100) / 100, level[i + 1]]),
  };
}
