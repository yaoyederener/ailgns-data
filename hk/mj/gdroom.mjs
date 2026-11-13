// 🃏 掼蛋联机房间（香港机上和麻将是同一个服务，房卡通用）。这个文件只管「掼蛋这一桌怎么打」：
// 发牌、进贡还贡、轮到谁、超时机器人代打、每个人能看到什么。房卡、付款、登录、房间进出都在 server.mjs，这里不碰。
// 红线和麻将一样：房卡是固定服务费；桌上的级数只是这一桌的记分，不存、不转、不提、不上链。
// 规则用网站那份 gd.js。这里不直接用 Node 的东西（时间、随机数、等待都由 server.mjs 传进来），所以本机能用 jsc 跑测试。
export function makeGdRooms(env) {
  const { GD, E, now, sleep, timer, clear, rnd, bump, online, humansHere, closeRoom, log, openUse } = env;
  const LIMIT = { gturn: 30000, gback: 20000 }; // 出牌最多等 30 秒，还贡 20 秒，超时机器人代打
  const ROUNDS = { 4: 1, 8: 2 }; // 4 局 1 张房卡，8 局 2 张

  // 机器人替这个座位拿主意：还贡 = 一张牌；出牌 = 一手牌，null = 不出
  function botAns(room, q) { const G = room.G; return q.type === "gback" ? GD.backPick(G.hands[q.seat], G.L) : GD.bot(G, q.seat); }

  function ask(room, q) { // 问一个座位。机器人、托管、掉线的：机器人代打；真人压不过上家：直接算不出
    const seat = room.seats[q.seat], G = room.G;
    return new Promise((resolve) => {
      const a = { q, hidden: false, done: false };
      a.fin = (v) => { if (a.done) return; a.done = true; clear(a.timer); if (room.asks[q.seat] === a) delete room.asks[q.seat]; resolve(v); };
      const cant = q.type === "gturn" && !!G.last && !GD.gen(G.hands[q.seat], G.L, G.last.k).length;
      if (seat.bot || seat.auto || cant || !online(room, q.seat)) {
        const v = cant ? null : botAns(room, q); a.hidden = true;
        a.timer = timer(() => a.fin(v), cant ? 800 : seat.bot ? 1000 : 1200);
      } else {
        a.qid = ++room.qid; a.until = now() + LIMIT[q.type];
        a.timer = timer(() => { if (++seat.miss >= 2) seat.auto = true; a.fin(botAns(room, q)); }, LIMIT[q.type] + 800);
      }
      room.asks[q.seat] = a;
    });
  }

  async function round(room) { // 打一局；房间中途没了返回 false
    const G = room.G;
    GD.startRound(G, rnd); room.just = -1;
    bump(room); await sleep(1200);
    while (G.ph === "trib") {
      if (room.dead) return false;
      const it = G.trib.items[G.trib.i], p = ask(room, { type: "gback", seat: it.t }); bump(room);
      const c = await p;
      if (room.dead) return false;
      if (!(Number.isInteger(c) && GD.giveBack(G, c))) GD.giveBack(G, GD.backPick(G.hands[it.t], G.L));
    }
    while (G.ph === "play") {
      if (room.dead) return false;
      if (!humansHere(room)) { closeRoom(room, "大家都离开了，房间已结束"); return false; }
      const s = G.turn, p = ask(room, { type: "gturn", seat: s }); bump(room);
      const v = await p;
      if (room.dead) return false;
      if (!(Array.isArray(v) && GD.play(G, s, v))) { if (G.last) GD.pass(G, s); else GD.play(G, s, GD.bot(G, s) || [G.hands[s][G.hands[s].length - 1]]); }
      room.just = s;
      if (G.ph === "play" && !G.last) { bump(room); await sleep(900); } // 一圈没人要：停一下让大家看清
    }
    return true;
  }

  async function runRoom(room) { // 出错由 server.mjs 接住：退房卡、关房间
    room.G = GD.newMatch(); room.just = -1;
    for (;;) {
      room.st = "play"; room.until = 0;
      if (!(await round(room))) { if (openUse.has(room.rid)) log({ t: "done", room: room.rid, k: room.k, why: "empty" }); return; }
      if (room.G.ph === "over" || room.k >= room.rounds) break; // 有一方打过 A，或者局数打满
      room.st = "between"; room.until = now() + 30000; room.seats.forEach((s) => { s.ready = s.bot; });
      bump(room);
      await new Promise((ok) => { room.go = ok; room.goTimer = timer(ok, 30000); });
      clear(room.goTimer); room.go = null;
      if (room.dead) return;
      if (!humansHere(room)) { closeRoom(room, "大家都离开了，房间已结束"); log({ t: "done", room: room.rid, k: room.k, why: "empty" }); return; }
      room.k++;
    }
    room.st = "done"; room.until = 0; log({ t: "done", room: room.rid, k: room.k }); bump(room);
  }

  // 这个座位能看到的牌桌：座位都转成「我是 0、下家 1、对家 2、上家 3」，队伍转成「0 = 我方」。别人的手牌只给张数
  function view(room, me, o) {
    const abs = (v) => (v + me) % 4, rot = (s) => (s - me + 4) % 4, R = (a) => [0, 1, 2, 3].map((v) => a[abs(v)]), G = room.G, a = room.asks[me], tm = me % 2;
    o.game = "gd";
    if (!G) return o;
    o.g = { lv: [G.lv[tm], G.lv[1 - tm]], cur: G.cur < 0 ? -1 : G.cur === tm ? 0 : 1, L: G.L, rd: G.rd, ph: G.ph,
      hand: G.hands[me], cnt: R(G.hands).map((h) => h.length), turn: rot(G.turn), wind: G.wind < 0 ? -1 : rot(G.wind),
      last: G.last ? { who: rot(G.last.who), k: G.last.k } : null, tb: R(G.tb), out: G.out.map(rot),
      trib: G.trib ? { anti: G.trib.anti, lead: rot(G.trib.lead), i: G.trib.i, items: G.trib.items.map((it) => ({ f: rot(it.f), t: rot(it.t), c: it.c, b: it.b })) } : null,
      res: G.res ? { o: G.res.o.map(rot), w: G.res.w === tm ? 0 : 1, up: G.res.up, from: G.res.from, to: G.res.to, win: G.res.win, L: G.res.L } : null,
      just: room.just == null || room.just < 0 ? -1 : rot(room.just), names: R(room.seats.map((s) => s.name)) };
    if (a && !a.hidden) o.q = { type: a.q.type, qid: a.qid, left: Math.max(0, a.until - now()) };
    return o;
  }

  // 真人拿好主意了。出不了的牌当场拒掉（不扣这一问），让他重选
  function act(room, i, o) {
    const a = room.asks[i], seat = room.seats[i], G = room.G;
    let v = o.v;
    if (!a || a.hidden || a.qid !== Number(o.qid)) return { ok: false };
    if (a.q.type === "gback") { if (!Number.isInteger(v) || !GD.canBack(G.hands[i], v, G.L)) throw new E("要还一张 10 以下的牌（级牌不算）"); }
    else if (v === "pass") { if (!G.last) throw new E("轮到你先出，不能不出"); v = null; }
    else if (!Array.isArray(v) || v.length > 27 || !v.every((c) => Number.isInteger(c) && c >= 0 && c < 108) || !GD.check(G, i, v)) throw new E("这手牌出不了：压不过上家，或者凑不成牌型");
    seat.miss = 0; seat.seen = room.humanAt = now(); a.fin(v);
    return { ok: true };
  }

  return { ROUNDS, LIMIT, botAns, runRoom, view, act };
}
