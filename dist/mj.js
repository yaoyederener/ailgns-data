try{(function(){var A=window.AIL,SUIT=["万","条","筒"],NAMES=["你","下家","对家","上家"],CAP=6,PIG=16;function zero(){var a=[],i;for(i=0;i<27;i++)a.push(0);return a;}
function sum(c){var n=0,i;for(i=0;i<27;i++)n+=c[i];return n;}
function tn(t){return(t%9+1)+SUIT[(t/9)|0];}
function dec(a,i){while(i<9&&!a[i])i++;if(i>=9)return true;var ok=false;if(a[i]>=3){a[i]-=3;ok=dec(a,i);a[i]+=3;if(ok)return true;}
if(i<7&&a[i+1]&&a[i+2]){a[i]--;a[i+1]--;a[i+2]--;ok=dec(a,i);a[i]++;a[i+1]++;a[i+2]++;}
return ok;}
function suitOk(c,s){return dec(c.slice(s*9,s*9+9),0);}
function isQiDui(c){var n=0,i;for(i=0;i<27;i++){if(c[i]&1)return false;n+=c[i];}return n===14;}
function isStd(c){var p,ok;for(p=0;p<27;p++)if(c[p]>=2){c[p]-=2;ok=suitOk(c,0)&&suitOk(c,1)&&suitOk(c,2);c[p]+=2;if(ok)return true;}
return false;}
function canHu(c,que){var i;if(que>=0)for(i=que*9;i<que*9+9;i++)if(c[i])return false;return isQiDui(c)||isStd(c);}
function waits(c,que){var w=[],t;for(t=0;t<27;t++){if(((t/9)|0)===que||c[t]>=4)continue;c[t]++;if(canHu(c,que))w.push(t);c[t]--;}
return w;}
function fanOf(c,melds,f){var names=[],fan=0,i,n=sum(c),qd=n===14&&isQiDui(c),suits={},gen=0,pairs=0,dd=!qd;for(i=0;i<27;i++){if(!c[i])continue;suits[(i/9)|0]=1;if(c[i]===4)gen++;if(c[i]===2)pairs++;else if(c[i]!==3)dd=false;}
melds.forEach(function(m){suits[(m.tile/9)|0]=1;if(m.k!=="peng"||c[m.tile]===1)gen++;});dd=dd&&pairs===1;if(qd){fan+=2;names.push(gen?"龙七对":"七对");}
else if(dd){if(n===2){fan+=2;names.push("金钩钓");}else{fan+=1;names.push("对对胡");}}
if(Object.keys(suits).length===1){fan+=2;names.push("清一色");}
if(!names.length)names.push("平胡");if(gen){fan+=gen;if(!qd)names.push("根×"+gen);}
f=f||{};if(f.zimo){fan++;names.push("自摸");}
if(f.gangHua){fan++;names.push("杠上开花");}
if(f.gangPao){fan++;names.push("杠上炮");}
if(f.qiangGang){fan++;names.push("抢杠胡");}
if(f.haidi){fan++;names.push(f.zimo?"海底捞月":"海底炮");}
if(fan>CAP)fan=CAP;return{fan:fan,names:names,mul:Math.pow(2,fan)};}
function newGame(o){var rnd=o.rnd||Math.random,wall=[],i,j,x,s,g;for(i=0;i<108;i++)wall.push(i%27);for(i=107;i>0;i--){j=(rnd()*(i+1))|0;x=wall[i];wall[i]=wall[j];wall[j]=x;}
g={base:o.base||100,rnd:rnd,wall:wall,hand:[],melds:[[],[],[],[]],river:[[],[],[],[]],que:[-1,-1,-1,-1],hus:[[],[],[],[]],score:[0,0,0,0],delta:[0,0,0,0],dealer:o.dealer||0,turn:-1,drawn:-1,last:null,gangLog:[],taken:0,msg:"",flash:"",endNotes:[],over:false};for(s=0;s<4;s++){g.hand[s]=zero();for(i=0;i<13;i++)g.hand[s][wall.pop()]++;}
return g;}
function pay(g,a,b,amt){g.score[a]-=amt;g.score[b]+=amt;g.delta[a]-=amt;g.delta[b]+=amt;}
function hasPeng(g,s,t){return g.melds[s].some(function(m){return m.k==="peng"&&m.tile===t;});}
function turnOpts(g,s,drawn){var c=g.hand[s],q=g.que[s],locked=g.hus[s].length>0,o={hu:false,gangs:[],discards:[],locked:locked},t,w0;if(drawn>=0){o.hu=canHu(c,q);if(g.wall.length){if(locked){if(c[drawn]===4){c[drawn]--;w0=waits(c,q).join();c[drawn]-=3;if(waits(c,q).join()===w0)o.gangs.push({tile:drawn,k:"an"});c[drawn]+=4;}
else if(hasPeng(g,s,drawn))o.gangs.push({tile:drawn,k:"bu"});}else for(t=0;t<27;t++){if(((t/9)|0)===q||!c[t])continue;if(c[t]===4)o.gangs.push({tile:t,k:"an"});else if(hasPeng(g,s,t))o.gangs.push({tile:t,k:"bu"});}}}
if(locked)o.discards=[drawn];else{for(t=q*9;t<q*9+9;t++)if(c[t])o.discards.push(t);if(!o.discards.length)for(t=0;t<27;t++)if(c[t])o.discards.push(t);}
return o;}
function claimOpts(g,s,d){var c=g.hand[s],q=g.que[s],locked=g.hus[s].length>0,o={hu:false,peng:false,gang:false,locked:locked},w0;if(((d/9)|0)===q)return o;c[d]++;o.hu=canHu(c,q);c[d]--;if(!locked){o.peng=c[d]>=2;o.gang=c[d]===3&&g.wall.length>0;}
else if(c[d]===3&&g.wall.length){w0=waits(c,q).join();c[d]-=3;o.gang=waits(c,q).join()===w0;c[d]+=3;}
return o;}
function settleHu(g,w,tile,from,f){var c=g.hand[w].slice(),r,amt,got=0,o;c[tile]++;r=fanOf(c,g.melds[w],f);amt=g.base*r.mul;if(from<0){for(o=0;o<4;o++)if(o!==w){pay(g,o,w,amt);got+=amt;}}else{pay(g,from,w,amt);got=amt;}
g.hus[w].push({tile:tile,from:from,fan:r.fan,names:r.names,got:got});return NAMES[w]+(from<0?"自摸 ":"胡了"+NAMES[from]+"的 ")+tn(tile)+"："+r.names.join(" ")+"，"+r.fan+" 番 +"+got;}
function payGang(g,s,k,from){var pays=[],o,amt=g.base*(k==="bu"?1:2);if(k==="zhi"){pay(g,from,s,amt);pays.push([from,amt]);}else for(o=0;o<4;o++)if(o!==s){pay(g,o,s,amt);pays.push([o,amt]);}
g.gangLog.push({s:s,pays:pays});return amt*pays.length;}
function okSwap(c,p){if(!p||p.length!==3)return false;var s=(p[0]/9)|0,k={},i;for(i=0;i<3;i++){if(((p[i]/9)|0)!==s)return false;k[p[i]]=(k[p[i]]||0)+1;if(k[p[i]]>c[p[i]])return false;}
return true;}
function endSettle(g){var pig=[],w=[],noHu=[],best=[],s,a,b,t,c,m;g.delta=[0,0,0,0];for(s=0;s<4;s++){pig[s]=false;for(t=g.que[s]*9;t<g.que[s]*9+9;t++)if(g.hand[s][t])pig[s]=true;noHu[s]=!g.hus[s].length;w[s]=pig[s]?[]:waits(g.hand[s],g.que[s]);best[s]=0;if(noHu[s])w[s].forEach(function(x){c=g.hand[s].slice();c[x]++;m=fanOf(c,g.melds[s],{}).mul;if(m>best[s])best[s]=m;});}
for(a=0;a<4;a++)if(pig[a]){for(b=0;b<4;b++)if(!pig[b])pay(g,a,b,g.base*PIG);g.endNotes.push(NAMES[a]+"是花猪（缺的那门没打完），赔每人 "+g.base*PIG);}
for(a=0;a<4;a++)if(noHu[a]&&!pig[a]&&!w[a].length)for(b=0;b<4;b++)if(noHu[b]&&w[b].length){pay(g,a,b,g.base*best[b]);g.endNotes.push(NAMES[a]+"没听牌，赔给听牌的"+NAMES[b]+" "+g.base*best[b]);}
g.gangLog.forEach(function(x){if(!noHu[x.s]||w[x.s].length)return;var back=0;x.pays.forEach(function(p){pay(g,x.s,p[0],p[1]);back+=p[1];});g.endNotes.push(NAMES[x.s]+"没听牌，杠来的 "+back+" 退回");});}
function*play(g){var s,i,a,picks=[],dir,seat,drawn,afterGang=false,mustDraw=true,opts,act,gk,m,claims,wins,pg,d,txt;for(s=0;s<4;s++){a=yield{type:"swap",seat:s};picks[s]=okSwap(g.hand[s],a)?a:botSwap(g.hand[s]);}
dir=1+((g.rnd()*3)|0);g.swapIn=[];for(s=0;s<4;s++)picks[s].forEach(function(t){g.hand[s][t]--;});for(s=0;s<4;s++){g.swapIn[(s+dir)%4]=picks[s];picks[s].forEach(function(t){g.hand[(s+dir)%4][t]++;});}
g.msg="换三张：每人把牌换给"+NAMES[dir]+"。你换到了 "+g.swapIn[0].map(tn).join(" ");yield{type:"ev",ev:"swap"};for(s=0;s<4;s++){a=yield{type:"que",seat:s};g.que[s]=a===0||a===1||a===2?a:botQue(g.hand[s]);}
g.msg="定缺完成，"+NAMES[g.dealer]+"先出牌";g.swapIn=null;yield{type:"ev",ev:"que"};seat=g.dealer;for(;;){if(mustDraw){if(!g.wall.length)break;drawn=g.wall.pop();g.hand[seat][drawn]++;}else drawn=-1;mustDraw=true;g.turn=seat;g.drawn=drawn;opts=turnOpts(g,seat,drawn);act=(yield{type:"turn",seat:seat,drawn:drawn,hu:opts.hu,gangs:opts.gangs,discards:opts.discards,locked:opts.locked})||{};g.delta=[0,0,0,0];g.flash="";if(act.hu&&opts.hu){g.hand[seat][drawn]--;g.taken++;g.drawn=-1;g.msg=g.flash=settleHu(g,seat,drawn,-1,{zimo:true,gangHua:afterGang,haidi:!g.wall.length});yield{type:"ev",ev:"hu"};afterGang=false;seat=(seat+1)%4;continue;}
gk=act.gang!=null?opts.gangs[act.gang]:null;if(gk){g.drawn=-1;if(gk.k==="bu"){g.hand[seat][gk.tile]--;wins=[];for(i=1;i<4;i++){s=(seat+i)%4;m=claimOpts(g,s,gk.tile);if(m.hu){a=yield{type:"claim",seat:s,tile:gk.tile,from:seat,hu:true,peng:false,gang:false,locked:m.locked,qiang:true};if(a==="hu")wins.push(s);}}
if(wins.length){g.taken++;txt=wins.map(function(x){return settleHu(g,x,gk.tile,seat,{qiangGang:true});});g.msg=g.flash=txt.join("；");yield{type:"ev",ev:"hu"};afterGang=false;seat=wins.length===1?(wins[0]+1)%4:(seat+1)%4;continue;}
g.melds[seat].forEach(function(x){if(x.k==="peng"&&x.tile===gk.tile)x.k="bu";});g.msg=NAMES[seat]+"补杠 "+tn(gk.tile)+"（刮风）+"+payGang(g,seat,"bu",-1);}else{g.hand[seat][gk.tile]-=4;g.melds[seat].push({k:"an",tile:gk.tile});g.msg=NAMES[seat]+"暗杠（下雨）+"+payGang(g,seat,"an",-1);}
yield{type:"ev",ev:"gang"};afterGang=true;continue;}
d=opts.discards.indexOf(act.discard)>=0?act.discard:opts.discards[opts.discards.length-1];g.hand[seat][d]--;g.river[seat].push(d);g.last={seat:seat,tile:d};g.drawn=-1;g.msg=NAMES[seat]+"打出 "+tn(d);yield{type:"ev",ev:"discard"};claims=[];for(i=1;i<4;i++){s=(seat+i)%4;m=claimOpts(g,s,d);if(m.hu||m.peng||m.gang){a=yield{type:"claim",seat:s,tile:d,from:seat,hu:m.hu,peng:m.peng,gang:m.gang,locked:m.locked};claims.push({s:s,a:a,m:m});}}
wins=claims.filter(function(x){return x.a==="hu"&&x.m.hu;}).map(function(x){return x.s;});if(wins.length){g.river[seat].pop();g.taken++;g.last=null;txt=wins.map(function(x){return settleHu(g,x,d,seat,{gangPao:afterGang,haidi:!g.wall.length});});g.msg=g.flash=txt.join("；");yield{type:"ev",ev:"hu"};afterGang=false;seat=wins.length===1?(wins[0]+1)%4:(seat+1)%4;continue;}
afterGang=false;pg=claims.filter(function(x){return x.a==="gang"&&x.m.gang;})[0]||claims.filter(function(x){return x.a==="peng"&&x.m.peng;})[0];if(pg){g.river[seat].pop();g.last=null;if(pg.a==="gang"){g.hand[pg.s][d]-=3;g.melds[pg.s].push({k:"zhi",tile:d,from:seat});g.msg=NAMES[pg.s]+"杠了"+NAMES[seat]+"的 "+tn(d)+"（刮风）+"+payGang(g,pg.s,"zhi",seat);g.turn=pg.s;yield{type:"ev",ev:"gang"};afterGang=true;seat=pg.s;continue;}
g.hand[pg.s][d]-=2;g.melds[pg.s].push({k:"peng",tile:d,from:seat});g.msg=NAMES[pg.s]+"碰 "+tn(d);g.turn=pg.s;yield{type:"ev",ev:"peng"};seat=pg.s;mustDraw=false;continue;}
seat=(seat+1)%4;}
g.turn=-1;g.drawn=-1;g.last=null;endSettle(g);g.over=true;g.msg="牌摸完了，这局结束";yield{type:"ev",ev:"end"};}
function keep(c,t){var r=t%9,v=c[t]>=3?8:c[t]===2?5:0;if(r>0&&c[t-1])v+=2.5;if(r<8&&c[t+1])v+=2.5;if(r>1&&c[t-2])v+=1;if(r<7&&c[t+2])v+=1;return v+(r===0||r===8?0:r===1||r===7?0.3:0.6);}
function suitCount(c,s){var n=0,i;for(i=s*9;i<s*9+9;i++)n+=c[i];return n;}
function botSwap(c){var best=-1,s,n,list=[],t,k;for(s=0;s<3;s++){n=suitCount(c,s);if(n>=3&&(best<0||n<suitCount(c,best)))best=s;}
for(t=best*9;t<best*9+9;t++)for(k=0;k<c[t];k++)list.push(t);list.sort(function(x,y){return keep(c,x)-keep(c,y);});return list.slice(0,3);}
function botQue(c){var best=0,s,v=[],t;for(s=0;s<3;s++){v[s]=suitCount(c,s)*100;for(t=s*9;t<s*9+9;t++)if(c[t])v[s]+=keep(c,t);if(v[s]<v[best])best=s;}
return best;}
function botDiscard(g,s,list){var c=g.hand[s],q=g.que[s],best=list[0],bs=-1e9,i,t,w,sc,k;if(((best/9)|0)===q)return best;for(i=0;i<list.length;i++){t=list[i];k=keep(c,t);c[t]--;w=waits(c,q);c[t]++;sc=w.reduce(function(n,x){return n+4-c[x];},0)*100-k;if(sc>bs){bs=sc;best=t;}}
return best;}
function bot(g,q){var c=g.hand[q.seat];if(q.type==="swap")return botSwap(c);if(q.type==="que")return botQue(c);if(q.type==="claim")return q.hu?"hu":q.gang?"gang":q.peng&&!waits(c,g.que[q.seat]).length?"peng":"pass";if(q.hu)return{hu:true};if(q.gangs.length)return{gang:0};return{discard:botDiscard(g,q.seat,q.discards)};}
window.AILMJ={newGame:newGame,play:play,bot:bot,canHu:canHu,waits:waits,fanOf:fanOf};var run=0,G=null,pend=null,sel=[],pick=-1,bound=false,DELAY={discard:420,peng:650,gang:900,hu:1500,swap:1800,que:700,end:500};function ls(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,String(v));}catch(e){}}
function beans(){var v=ls("mj:beans");return v==null?10000:Math.max(0,Number(v)||0);}
function n(v){return Number(v||0).toLocaleString("en-US");}
function sgn(v){return(v>0?"+":"")+n(v);}
function tile(t,cls,attr){return'<i class="mj-t mj-s'+((t/9)|0)+(cls||"")+'"'+(attr||"")+"><b>"+(t%9+1)+"</b><em>"+SUIT[(t/9)|0]+"</em></i>";}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
function lobby(){run++;G=null;pend=null;var b=beans(),base=Number(ls("mj:base"))||100;A.app.innerHTML='<a class="px-back" href="#/play">← 销毁乐园</a><section class="card mj" id="mj-root"><h1>🀄 血流成河麻将 <small class="mj-tag">试玩版</small></h1>'+'<p class="sub">四川麻将，你一个人对三个机器人。胡了不下桌，一局能胡好多次。</p>'+'<div class="mj-bean"><span>我的欢乐豆</span><b>'+n(b)+"</b>"+(b<2000?'<button type="button" class="ghost" data-act="refill">免费领 10,000 豆</button>':"")+"</div>"+'<p class="mj-lb">选底分（底分越大，输赢越大）</p><div class="mj-bases">'+[50,100,500,1000].map(function(x){return'<button type="button" class="'+(x===base?"on":"")+'" data-base="'+x+'">'+n(x)+"</button>";}).join("")+"</div>"+'<button type="button" class="mj-start" data-act="start">开一局</button>'+'<p class="mj-warn">⚠️ 欢乐豆只是游戏里的记分，只存在你这台手机上：不能提现、不能转赠、不能兑换任何东西。现在是试玩，不收费。</p></section>'+'<section class="card mj"><h2>怎么玩</h2><ol class="mj-rules">'+"<li><b>牌</b>：只有万、条、筒，一共 108 张。不能吃，可以碰、可以杠。</li>"+"<li><b>换三张</b>：开局先挑 3 张同一花色的牌，和别人交换。</li>"+"<li><b>定缺</b>：选一门不要的花色。这门牌必须先打完，才能胡。</li>"+"<li><b>血流成河</b>：胡了不下桌。手牌锁住继续摸，摸到或别人打出你要的牌，就再胡一次，直到牌摸完。</li>"+"<li><b>算分</b>：底分 × 2 的「番」次方，6 番封顶（64 倍）。自摸三家都给，点炮谁打的谁给。</li>"+"<li><b>番</b>：平胡 0 番；对对胡 1 番；七对、金钩钓、清一色各 2 番；手里每有 4 张一样的（根）加 1 番；自摸、杠上开花、杠上炮、抢杠胡、海底各加 1 番。</li>"+"<li><b>杠</b>：暗杠三家各给 2 倍底分；补杠三家各给 1 倍；杠别人打的牌，他给 2 倍。</li>"+"<li><b>牌摸完时</b>：缺的那门没打完（花猪）赔每人 16 倍；没胡过又没听牌的，要赔给听牌的人，杠来的豆也退回去。</li></ol></section>";}
function melds(s){var g=G;return g.melds[s].map(function(m){var k=m.k==="peng"?3:4,h="",i;for(i=0;i<k;i++)h+=tile(m.tile," sm");return'<span class="mj-meld'+(m.k==="an"?" an":"")+'">'+h+"</span>";}).join("")+
(g.hus[s].length?'<span class="mj-meld hu"><u>胡</u>'+g.hus[s].map(function(h){return tile(h.tile," sm");}).join("")+"</span>":"");}
function head(s){var g=G,d=g.delta[s];return'<div class="mj-oh"><b>'+NAMES[s]+(g.dealer===s?"<sup>庄</sup>":"")+"</b>"+(g.que[s]>=0?'<span class="mj-que mj-s'+g.que[s]+'">缺'+SUIT[g.que[s]]+"</span>":"")+
(g.hus[s].length?'<span class="mj-hun">胡×'+g.hus[s].length+"</span>":"")+(s?'<span class="mj-cnt">'+sum(g.hand[s])+" 张</span>":"")+'<span class="mj-sc'+(g.score[s]<0?" neg":g.score[s]>0?" pos":"")+'">'+sgn(g.score[s])+"</span>"+(d?'<span class="mj-fl '+(d>0?"up":"dn")+'">'+sgn(d)+"</span>":"")+"</div>";}
function river(s){var g=G,r=g.river[s];return'<div class="mj-river">'+r.map(function(t,i){return tile(t," sm"+(g.last&&g.last.seat===s&&i===r.length-1?" last":""));}).join("")+"</div>";}
function myList(){var g=G,c=g.hand[0].slice(),q=g.que[0],out=[],t,k,dr=g.turn===0?g.drawn:-1;if(dr>=0&&c[dr]>0)c[dr]--;else dr=-1;for(t=0;t<27;t++)if(((t/9)|0)!==q)for(k=0;k<c[t];k++)out.push(t);if(q>=0)for(t=q*9;t<q*9+9;t++)for(k=0;k<c[t];k++)out.push(t);if(dr>=0)out.push(dr);return{list:out,drawn:dr};}
function acts(){var g=G,q=pend&&pend.req,h="",tip="",w,c;if(!q){if(g.hus[0].length){w=waits(g.hand[0],g.que[0]);tip="你已经胡了，手牌锁住自动打。还在等："+w.map(function(t){return tile(t," sm");}).join("");}
else tip=g.turn>0?"等"+NAMES[g.turn]+"出牌…":"";}else if(q.type==="swap"){tip="换三张：挑 3 张同一花色的牌换出去。已经帮你挑好了，想改就点牌。";h='<button type="button" class="pri" data-act="swap"'+(sel.length===3?"":" disabled")+">换这三张</button>";}else if(q.type==="que"){c=botQue(g.hand[0]);tip="定缺：选一门不要的花色，这门牌要先打完才能胡。";h=[0,1,2].map(function(s){return'<button type="button" class="'+(s===c?"pri":"")+'" data-act="que'+s+'">缺'+SUIT[s]+(s===c?"（推荐）":"")+"</button>";}).join("");}else if(q.type==="turn"){if(q.hu)h+='<button type="button" class="hu" data-act="zimo">自摸，胡！</button>';q.gangs.forEach(function(x,i){h+='<button type="button" class="pri" data-act="gang'+i+'">杠 '+tn(x.tile)+"</button>";});if(pick>=0){c=g.hand[0].slice();c[myList().list[pick]]--;w=waits(c,g.que[0]);tip=w.length?"打这张后听："+w.map(function(t){return tile(t," sm");}).join("")+" 再点一下打出":"再点一下打出";}
else tip=((q.discards[0]/9)|0)===g.que[0]?"轮到你：先把缺的那门（灰色的牌）打完。点一下选牌，再点一下打出。":"轮到你：点一下选牌，再点一下打出。";}else{tip=NAMES[q.from]+(q.qiang?"要补杠 ":"打出 ")+tile(q.tile," sm")+" 你要不要？";if(q.hu)h+='<button type="button" class="hu" data-act="hu">胡！</button>';if(q.gang)h+='<button type="button" class="pri" data-act="cgang">杠</button>';if(q.peng)h+='<button type="button" class="pri" data-act="peng">碰</button>';h+='<button type="button" data-act="pass">过</button>';}
return'<div class="mj-acts">'+h+'</div><p class="mj-tip">'+tip+"</p>";}
function paint(){var g=G,root=document.getElementById("mj-root"),q=pend&&pend.req,can=q&&q.type==="turn"?q.discards:null,ml,hand;if(!g||!root)return;ml=myList();hand=ml.list.map(function(t,i){var isNew=ml.drawn>=0&&i===ml.list.length-1;return tile(t,(isNew?" new":"")+(sel.indexOf(i)>=0||pick===i?" up":"")+(((t/9)|0)===g.que[0]?" q":"")+(can&&can.indexOf(t)<0?" dim":""),' data-t="'+t+'" data-i="'+i+'"');}).join("");root.innerHTML='<div class="mj-top"><span>底分 <b>'+n(g.base)+"</b></span><span>还剩 <b>"+g.wall.length+'</b> 张</span><button type="button" class="mj-quit" data-act="quit">退出</button></div>'+
[1,2,3].map(function(s){return'<div class="mj-opp'+(g.turn===s?" on":"")+'">'+head(s)+'<div class="mj-row">'+melds(s)+"</div>"+river(s)+"</div>";}).join("")+'<div class="mj-msg'+(g.flash?" big":"")+'">'+(g.msg||"发牌中…")+"</div>"+'<div class="mj-me'+(g.turn===0?" on":"")+'">'+head(0)+river(0)+'<div class="mj-row">'+melds(0)+'</div><div class="mj-hand">'+hand+"</div>"+acts()+"</div>";}
function finish(){var g=G,me=g.score[0],b=Math.max(0,beans()+me),root=document.getElementById("mj-root");lsSet("mj:beans",b);G=null;pend=null;if(!root)return;root.innerHTML="<h1>这局结束</h1>"+'<div class="mj-res '+(me>=0?"pos":"neg")+'"><span>你这局</span><b>'+sgn(me)+' 豆</b><small>现在有 '+n(b)+" 豆</small></div>"+'<table class="mj-tbl"><tr><th>谁</th><th>胡了几次</th><th>输赢</th></tr>'+[0,1,2,3].map(function(s){return"<tr><td>"+NAMES[s]+"</td><td>"+g.hus[s].length+'</td><td class="'+(g.score[s]>=0?"pos":"neg")+'">'+sgn(g.score[s])+"</td></tr>";}).join("")+"</table>"+
(g.hus[0].length?'<p class="mj-lb">你胡的牌</p><ul class="mj-list">'+g.hus[0].map(function(h){return"<li>"+tile(h.tile," sm")+" "+h.names.join(" ")+"，"+h.fan+" 番 <b>+"+n(h.got)+"</b></li>";}).join("")+"</ul>":'<p class="mj-lb">这局你没胡到，再来一局。</p>')+
(g.endNotes.length?'<p class="mj-lb">牌摸完时的结算</p><ul class="mj-list">'+g.endNotes.map(function(x){return"<li>"+x+"</li>";}).join("")+"</ul>":"")+'<button type="button" class="mj-start" data-act="start">再来一局</button><button type="button" class="ghost mj-back" data-act="lobby">回大厅</button>'+'<p class="mj-warn">欢乐豆只是记分，不能提现、不能转赠、不能兑换任何东西。</p>';}
function start(){var base=Number(ls("mj:base"))||100,my=++run,g=G=newGame({base:base,dealer:(Math.random()*4)|0}),it=play(g),r;pend=null;sel=[];pick=-1;function alive(){return my===run&&!!document.getElementById("mj-root");}
function ask(q){return new Promise(function(res){pend={req:q,res:res};pick=-1;sel=[];if(q.type==="swap"){var want=botSwap(g.hand[0]),l=myList().list,used={};want.forEach(function(t){var i=l.indexOf(t);while(used[i])i=l.indexOf(t,i+1);used[i]=1;sel.push(i);});}paint();});}
function loop(){if(!alive())return;if(r.done){finish();return;}
var q=r.value,p,ans;if(q.type==="ev"){paint();p=sleep(DELAY[q.ev]||400);}
else if(q.seat===0&&!q.locked)p=ask(q);else{ans=bot(g,q);if(q.type==="turn"||(q.type==="claim"&&ans!=="pass")){paint();p=sleep(q.seat===0?650:480).then(function(){return ans;});}
else p=Promise.resolve(ans);}
p.then(function(v){if(!alive())return;pend=null;sel=[];pick=-1;r=it.next(v);loop();}).catch(fail);}
function fail(e){if(!alive())return;G=null;pend=null;var root=document.getElementById("mj-root");if(root)root.innerHTML='<h1>这局出了点问题</h1><p class="sub">这局不算，豆子没有变化。</p><button type="button" class="mj-start" data-act="lobby">回大厅</button>';if(window.console)console.error("mj",e);}
document.getElementById("mj-root").className="card mj mj-tb";try{r=it.next();loop();}catch(e){fail(e);}}
function answer(v){var p=pend;if(!p)return;pend=null;p.res(v);}
function onClick(e){if(!document.getElementById("mj-root")||!e.target.closest)return;var el=e.target.closest("[data-act],[data-base],[data-t]"),a,q,i,t,l;if(!el||!el.closest(".mj"))return;try{if(el.getAttribute("data-base")){lsSet("mj:base",el.getAttribute("data-base"));lobby();return;}
a=el.getAttribute("data-act");q=pend&&pend.req;if(a==="start"){if(!document.querySelector("#mj-root .mj-top")){if(beans()<=0)lsSet("mj:beans",10000);start();}return;}
if(a==="refill"){lsSet("mj:beans",10000);lobby();return;}
if(a==="lobby"||a==="quit"){lobby();return;}
if(!q)return;if(a==="swap"){if(sel.length===3){l=myList().list;answer(sel.map(function(x){return l[x];}));}return;}
if(a&&a.indexOf("que")===0){answer(Number(a.slice(3)));return;}
if(a==="zimo"){answer({hu:true});return;}
if(a&&a.indexOf("gang")===0){answer({gang:Number(a.slice(4))});return;}
if(a==="hu"||a==="peng"||a==="pass"){answer(a);return;}
if(a==="cgang"){answer("gang");return;}
if(el.getAttribute("data-t")==null)return;i=Number(el.getAttribute("data-i"));t=Number(el.getAttribute("data-t"));if(q.type==="swap"){l=myList().list;if(sel.indexOf(i)>=0)sel.splice(sel.indexOf(i),1);else if(sel.length&&((l[sel[0]]/9)|0)!==((t/9)|0))sel=[i];else if(sel.length<3)sel.push(i);paint();}else if(q.type==="turn"){if(q.discards.indexOf(t)<0)return;if(pick===i)answer({discard:t});else{pick=i;paint();}}}catch(err){if(window.console)console.error("mj",err);}}
A.pages.mj=function(){try{if(!bound){bound=true;document.addEventListener("click",onClick);}lobby();}
catch(e){A.app.innerHTML='<section class="card"><p class="note">麻将页面打开失败，请刷新再试。</p></section>';}};})();}catch(e){console.error('[bundle] mj.js',e);}