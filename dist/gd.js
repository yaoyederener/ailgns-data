try{(function(){var W=typeof window!=="undefined"?window:null,A=W&&W.AIL;var RN={11:"J",12:"Q",13:"K",14:"A",16:"小王",17:"大王"},SUITS=["♠","♥","♣","♦"];function rn(n){return RN[n]||String(n);}
function cid(c){return c%54;}
function isJ(c){return cid(c)>=52;}
function suit(c){return(cid(c)/13)|0;}
function nat(c){var x=cid(c);return x>=52?x-36:x%13+2;}
function pw(c,L){var n=nat(c);return n===L?15:n;}
function wild(c,L){return cid(c)<52&&nat(c)===L&&suit(c)===1;}
function sortH(h,L){return h.sort(function(a,b){return pw(b,L)-pw(a,L)||suit(a)-suit(b)||a-b;});}
function minus(hand,cards){var m={},i;for(i=0;i<cards.length;i++)m[cards[i]]=1;return hand.filter(function(c){return!m[c];});}
function seqTop(ns,len,per){var t,lo,i,n,x,cnt,ok;for(t=14;t>=len;t--){lo=t-len+1;cnt=[];ok=true;for(i=0;i<ns.length;i++){n=ns[i];x=(lo===1&&n===14)?0:n-lo;if(x<0||x>=len){ok=false;break;}
cnt[x]=(cnt[x]||0)+1;if(cnt[x]>per){ok=false;break;}}
if(ok)return t;}
return 0;}
function kinds(cards,L){var n=cards.length,ws=0,norm=[],i,c,out=[],p,t;if(!n)return out;if(n===1)return[{t:"single",r:pw(cards[0],L),n:1}];for(i=0;i<n;i++){c=cards[i];if(wild(c,L))ws++;else norm.push(c);}
var p0=norm.length?pw(norm[0],L):15,same=true,jk=0,cnt={},ns=[];for(i=0;i<norm.length;i++){p=pw(norm[i],L);if(p!==p0)same=false;if(isJ(norm[i]))jk++;else ns.push(nat(norm[i]));cnt[p]=(cnt[p]||0)+1;}
if(n===4&&jk===4)return[{t:"king",r:99,n:4}];if(same&&!(jk&&ws)){if(n===2)return[{t:"pair",r:p0,n:2}];if(jk)return out;if(n===3)return[{t:"triple",r:p0,n:3}];return[{t:"bomb",r:p0,n:n}];}
if(n===5){var best=0,ks=Object.keys(cnt),j,x,y,need,ny,others;for(j=0;j<ks.length;j++){x=+ks[j];if(x>=16||cnt[x]>3)continue;others=ks.filter(function(k){return+k!==x;});if(others.length>1)continue;need=3-cnt[x];if(others.length){y=+others[0];if(cnt[y]>2)continue;ny=2-cnt[y];if(y>=16&&ny)continue;}else ny=2;if(need+ny===ws&&x>best)best=x;}
if(best)out.push({t:"full",r:best,n:5});if(!jk){t=seqTop(ns,5,1);if(t){var fl=true;for(i=1;i<norm.length;i++)if(suit(norm[i])!==suit(norm[0]))fl=false;out.push({t:fl?"sf":"straight",r:t,n:5});}}}
if(n===6&&!jk){t=seqTop(ns,2,3);if(t)out.push({t:"plate",r:t,n:6});t=seqTop(ns,3,2);if(t)out.push({t:"tube",r:t,n:6});}
return out;}
function isB(k){return k.t==="bomb"||k.t==="sf"||k.t==="king";}
function bs(k){return k.t==="king"?9999:k.t==="sf"?550+k.r:k.n*100+k.r;}
function beats(a,b){if(isB(a))return isB(b)?bs(a)>bs(b):true;return!isB(b)&&a.t===b.t&&a.n===b.n&&a.r>b.r;}
function gen(hand,L,last){var byP={},byN={},bySN={},ws=[],i,c,p,res=[],idx={},g,k2,t,r,rr,cs,miss,s,pairs=[],trips=[];for(i=0;i<hand.length;i++){c=hand[i];if(wild(c,L)){ws.push(c);continue;}
p=pw(c,L);(byP[p]=byP[p]||[]).push(c);if(!isJ(c)){(byN[nat(c)]=byN[nat(c)]||[]).push(c);bySN[suit(c)*20+nat(c)]=c;}}
function add(cards){var ks=kinds(cards,L),k=null,j,wu=0,key,o;for(j=0;j<ks.length;j++)if(!last||beats(ks[j],last)){k=ks[j];break;}
if(!k)return;for(j=0;j<cards.length;j++)if(wild(cards[j],L))wu++;key=k.t+":"+k.n+":"+k.r;o={cards:cards,k:k,wu:wu};if(idx[key]==null){idx[key]=res.length;res.push(o);}else if(res[idx[key]].wu>wu)res[idx[key]]=o;}
var P=Object.keys(byP).map(Number);for(i=0;i<P.length;i++){p=P[i];g=byP[p];add([g[0]]);if(g.length>=2){add(g.slice(0,2));pairs.push({p:p,c:g.slice(0,2),w:p+(g.length===2?0:g.length===3?6:20)+(p>=15?10:0)});}
else if(p<16&&ws.length)add([g[0],ws[0]]);if(p>=16)continue;if(g.length>=3){add(g.slice(0,3));trips.push({p:p,c:g.slice(0,3)});}
else if(g.length===2&&ws.length){add(g.concat(ws[0]));trips.push({p:p,c:g.concat(ws[0])});}
if(g.length>=4)add(g.slice());for(k2=1;k2<=ws.length;k2++)if(g.length>=2&&g.length+k2>=4)add(g.concat(ws.slice(0,k2)));}
if(ws.length)add([ws[0]]);if(ws.length>=2)add([ws[0],ws[1]]);if((byP[16]||[]).length===2&&(byP[17]||[]).length===2)add(byP[16].concat(byP[17]));pairs.sort(function(a,b){return a.w-b.w;});for(i=0;i<trips.length;i++)for(k2=0;k2<pairs.length;k2++)if(pairs[k2].p!==trips[i].p){add(trips[i].c.concat(pairs[k2].c));break;}
for(t=5;t<=14;t++){cs=[];miss=0;for(r=t-4;r<=t;r++){rr=r===1?14:r;if(byN[rr])cs.push(byN[rr][0]);else miss++;}
if(miss<=ws.length){if(cs.length>1&&cs.every(function(x){return suit(x)===suit(cs[0]);})){for(r=0;r<cs.length;r++){g=byN[nat(cs[r])].filter(function(x){return suit(x)!==suit(cs[0]);});if(g.length){cs[r]=g[0];break;}}}
add(cs.concat(ws.slice(0,miss)));}
for(s=0;s<4;s++){cs=[];miss=0;for(r=t-4;r<=t;r++){rr=r===1?14:r;c=bySN[s*20+rr];if(c!=null)cs.push(c);else miss++;}
if(miss<=ws.length)add(cs.concat(ws.slice(0,miss)));}}
for(t=3;t<=14;t++){cs=[];miss=0;for(r=t-2;r<=t;r++){rr=r===1?14:r;g=byN[rr]||[];cs=cs.concat(g.slice(0,2));miss+=Math.max(0,2-g.length);}
if(miss<=ws.length)add(cs.concat(ws.slice(0,miss)));}
for(t=2;t<=14;t++){cs=[];miss=0;for(r=t-1;r<=t;r++){rr=r===1?14:r;g=byN[rr]||[];cs=cs.concat(g.slice(0,3));miss+=Math.max(0,3-g.length);}
if(miss<=ws.length)add(cs.concat(ws.slice(0,miss)));}
res.sort(function(a,b){var x=isB(a.k),y=isB(b.k);return x!==y?(x?1:-1):x?bs(a.k)-bs(b.k):(a.k.r-b.k.r)||(a.wu-b.wu);});return res;}
function cost(hand,L){if(!hand.length)return-100;var cn=[],i,c,n,nw=0,js=0,jb=0,v=0,t,r,rr,best,k,T=0,pc=[],p;for(i=0;i<=14;i++)cn[i]=0;for(i=0;i<hand.length;i++){c=hand[i];if(wild(c,L))nw++;else if(isJ(c)){if(nat(c)===16)js++;else jb++;}else cn[nat(c)]++;}
if(js===2&&jb===2)v-=1.2;else{if(js)v+=0.45;if(jb)v+=0.3;}
for(r=2;r<=14;r++)if(cn[r]>=4){v-=0.6+0.15*(cn[r]-4);cn[r]=0;}
for(r=2;r<=14&&nw;r++)if(cn[r]===3&&r!==L){v-=0.6;cn[r]=0;nw--;}
for(;;){best=0;k=2;for(t=5;t<=14;t++){n=0;for(r=t-4;r<=t;r++){rr=r===1?14:r;if(!cn[rr]){n=-9;break;}if(cn[rr]===1&&rr!==L)n++;}
if(n>k){k=n;best=t;}}
if(!best)break;for(r=best-4;r<=best;r++)cn[r===1?14:r]--;v+=0.9;}
for(t=3;t<=14;t++){rr=t-2===1?14:t-2;if(cn[rr]===2&&cn[t-1]===2&&cn[t]===2){cn[rr]=cn[t-1]=cn[t]=0;v+=0.9;}}
for(t=2;t<=14;t++){rr=t-1===1?14:t-1;if(cn[rr]===3&&cn[t]===3){cn[rr]=cn[t]=0;v+=0.9;}}
for(r=2;r<=14;r++){n=cn[r];if(!n)continue;p=r===L?15:r;k=p===15?0.5:p===14?0.75:1+(14-p)*0.012+(n===1?0.15:0);v+=k;if(n===3)T++;else if(n===2)pc.push(k);}
pc.sort(function(a,b){return b-a;});for(i=0;i<T&&i<pc.length;i++)v-=pc[i]*0.9;return v+nw*0.1;}
function bot(G,s){var L=G.L,hand=G.hands[s],last=G.last?G.last.k:null,who=G.last?G.last.who:-1,mate=(s+2)%4;var opts=gen(hand,L,last),c0=cost(hand,L),i,o,x,d;if(!opts.length)return null;for(i=0;i<opts.length;i++){o=opts[i];o.c=cost(minus(hand,o.cards),L);if(o.c<=-100)return o.cards;}
var n1=G.hands[(s+1)%4].length,n2=G.hands[(s+3)%4].length,nm=G.hands[mate].length,danger=Math.min(n1||99,n2||99);var nb=opts.filter(function(y){return!isB(y.k);}),bb=opts.filter(function(y){return isB(y.k);});function pick(list,f){var b=null,bv=1e9,j,v;for(j=0;j<list.length;j++){v=f(list[j]);if(v<bv){bv=v;b=list[j];}}return b;}
if(!last){if(!nb.length)return bb[0].cards;var pool=nb;if(nm===1){x=nb.filter(function(y){return y.k.t==="single";});if(x.length&&x[0].k.r<14)return x[0].cards;}
if(nm===2){x=nb.filter(function(y){return y.k.t==="pair";});if(x.length&&x[0].k.r<12)return x[0].cards;}
if(danger===1){x=nb.filter(function(y){return y.k.t!=="single";});if(x.length)pool=x;else return nb[nb.length-1].cards;}
else if(danger===2){x=nb.filter(function(y){return y.k.t!=="pair";});if(x.length)pool=x;}
return pick(pool,function(y){return y.c+y.k.r*0.02-y.k.n*0.04;}).cards;}
if(who===mate){if((last.t==="single"||last.t==="pair"||last.t==="triple")&&last.r<=10&&nm>2){x=nb.filter(function(y){return y.c-c0<=-0.6&&y.k.r<=14;});if(x.length)return x[0].cards;}
return null;}
var urgent=G.hands[who].length<=6;o=pick(nb,function(y){return y.c+y.k.r*0.02;});if(o){d=o.c-c0;if(d<=0.35||urgent||(d<=1.2&&danger<=10))return o.cards;}
if(bb.length){o=bb[0];if(urgent||o.c<=1.3||(isB(last)&&(bb.length>=2||G.hands[who].length<=12))||(last.n>=5&&bb.length>=2)||bb.length>=3)return o.cards;}
return null;}
function backPick(hand,L){var cnt={},i,p,best=-1,bv=1e9,v;for(i=0;i<hand.length;i++){p=pw(hand[i],L);cnt[p]=(cnt[p]||0)+1;}
for(i=0;i<hand.length;i++){if(wild(hand[i],L))continue;p=pw(hand[i],L);v=p+(cnt[p]===1?0:cnt[p]===2?20:40)+(p>10?100:0);if(v<bv){bv=v;best=hand[i];}}
return best;}
function canBack(hand,c,L){if(hand.indexOf(c)<0)return false;if(pw(c,L)<=10)return true;return!hand.some(function(x){return pw(x,L)<=10;});}
function newMatch(){return{lv:[2,2],cur:-1,L:2,hands:[[],[],[],[]],turn:0,last:null,tb:[null,null,null,null],out:[],ph:"idle",prev:null,trib:null,rd:0,res:null,wind:-1};}
function bigOf(hand,L){var b=-1,i;for(i=0;i<hand.length;i++)if(!wild(hand[i],L)&&(b<0||pw(hand[i],L)>pw(b,L)))b=hand[i];return b;}
function nBJ(hand){var n=0,i;for(i=0;i<hand.length;i++)if(cid(hand[i])===53)n++;return n;}
function move(G,f,t,c){G.hands[f].splice(G.hands[f].indexOf(c),1);G.hands[t].push(c);sortH(G.hands[t],G.L);}
function tribute(G){var o=G.prev,L=G.L,items=[],a,b,ca,cb,anti=false;if(o[0]%2===o[1]%2){a=o[2];b=o[3];if(nBJ(G.hands[a])+nBJ(G.hands[b])===2)anti=true;else{ca=bigOf(G.hands[a],L);cb=bigOf(G.hands[b],L);if(pw(cb,L)>pw(ca,L))items.push({f:b,t:o[0],c:cb,b:-1},{f:a,t:o[1],c:ca,b:-1});else items.push({f:a,t:o[0],c:ca,b:-1},{f:b,t:o[1],c:cb,b:-1});}}else{a=o[3];if(nBJ(G.hands[a])===2)anti=true;else items.push({f:a,t:o[0],c:bigOf(G.hands[a],L),b:-1});}
for(a=0;a<items.length;a++)move(G,items[a].f,items[a].t,items[a].c);G.trib={items:items,anti:anti,lead:anti?o[0]:items[0].f,i:0};G.turn=G.trib.lead;G.ph=items.length?"trib":"play";}
function giveBack(G,c){var T=G.trib,it;if(G.ph!=="trib"||!T)return false;it=T.items[T.i];if(!canBack(G.hands[it.t],c,G.L))return false;move(G,it.t,it.f,c);it.b=c;T.i++;if(T.i>=T.items.length)G.ph="play";return true;}
function startRound(G,rnd){var d=[],i,j,x;for(i=0;i<108;i++)d.push(i);for(i=107;i>0;i--){j=(rnd()*(i+1))|0;x=d[i];d[i]=d[j];d[j]=x;}
G.rd++;G.L=G.cur<0?2:G.lv[G.cur];G.hands=[[],[],[],[]];for(i=0;i<108;i++)G.hands[i%4].push(d[i]);for(i=0;i<4;i++)sortH(G.hands[i],G.L);G.out=[];G.last=null;G.tb=[null,null,null,null];G.res=null;G.wind=-1;G.trib=null;if(!G.prev){G.turn=(rnd()*4)|0;G.ph="play";return;}
tribute(G);}
function settle(G){var o=G.out,w=o[0]%2,pos=o.indexOf((o[0]+2)%4),up=pos===1?3:pos===2?2:1,from=G.lv[w],win=false;if(G.cur===w&&G.L===14&&up>=2)win=true;else G.lv[w]=Math.min(14,from+up);G.res={o:o.slice(),w:w,up:up,from:from,to:G.lv[w],win:win,L:G.L};G.cur=w;G.prev=o.slice();G.ph=win?"over":"done";}
function next(G,s){var i,c,m;for(i=1;i<=4;i++){c=(s+i)%4;if(c===G.last.who){G.last=null;if(G.hands[c].length){G.turn=c;return;}
m=(c+2)%4;if(G.hands[m].length){G.turn=m;G.wind=m;return;}
for(i=1;i<=3;i++)if(G.hands[(c+i)%4].length){G.turn=(c+i)%4;return;}
return;}
if(G.hands[c].length){G.turn=c;return;}}}
function check(G,s,cards){var h=G.hands[s],i,ks,m={};if(G.ph!=="play"||G.turn!==s||!cards||!cards.length)return null;for(i=0;i<cards.length;i++){if(h.indexOf(cards[i])<0||m[cards[i]])return null;m[cards[i]]=1;}
ks=kinds(cards,G.L);for(i=0;i<ks.length;i++)if(!G.last||beats(ks[i],G.last.k))return ks[i];return null;}
function play(G,s,cards){var h=G.hands[s],k=check(G,s,cards),rest;if(!k)return null;if(!G.last)G.tb=[null,null,null,null];G.hands[s]=minus(h,cards);G.wind=-1;G.last={who:s,k:k};G.tb[s]={cards:cards.slice(),k:k};if(!G.hands[s].length){G.out.push(s);if((G.out.length===2&&G.out[0]%2===G.out[1]%2)||G.out.length===3){rest=[0,1,2,3].filter(function(x){return G.out.indexOf(x)<0;}).sort(function(a,b){return G.hands[a].length-G.hands[b].length;});G.out=G.out.concat(rest);settle(G);return k;}}
next(G,s);return k;}
function pass(G,s){if(G.ph!=="play"||G.turn!==s||!G.last)return false;G.tb[s]={pass:1};next(G,s);return true;}
var E={kinds:kinds,beats:beats,isB:isB,gen:gen,cost:cost,bot:bot,backPick:backPick,canBack:canBack,newMatch:newMatch,startRound:startRound,giveBack:giveBack,check:check,play:play,pass:pass,pw:pw,nat:nat,suit:suit,wild:wild,isJ:isJ};if(!W){(typeof globalThis!=="undefined"?globalThis:this).GD=E;return;}
if(!A)return;var G=null,sel={},hints=null,hi=0,tm=0,bound=false,drag=null,toastT=0,toastTxt="",toastEnd=0,just=-1,showRule=false,resetArm=false,ST={};var ON=null,MYQ=null,BUY=null,CARDS=null,OPEN=null,SID="",SAY="",doneQid=0,cdTimer=0,busy=false;var NAMES=["你","下家","对家","上家"],FACE=["🧑","🐯","🐼","🦊"],PLACE=["头游","二游","三游","末游"],MEDAL=["🥇","🥈","🥉","🐢"];var KN={single:"单张",pair:"对子",triple:"三张",full:"三带二",straight:"顺子",tube:"三连对",plate:"钢板",bomb:"炸弹",sf:"同花顺",king:"天王炸"};function ls(k){try{return localStorage.getItem(k)||"";}catch(e){return"";}}
function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}
function save(){lsSet("gd:g",G?JSON.stringify(G):"");}
function load(){try{var g=JSON.parse(ls("gd:g")||"null");if(g&&g.lv&&g.hands&&g.hands.length===4&&g.ph&&g.ph!=="idle")return g;}catch(e){}return null;}
function stats(){try{ST=JSON.parse(ls("gd:st")||"{}")||{};}catch(e){ST={};}ST.w=ST.w||0;ST.l=ST.l||0;ST.best=ST.best||2;return ST;}
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return"&#"+c.charCodeAt(0)+";";});}
function nf(v){return Number(v||0).toLocaleString("en-US");}
function nm(s){var g=ON&&ON.v&&ON.v.g;return s&&g&&g.names&&g.names[s]?esc(g.names[s]):NAMES[s];}
function offH(s){var x=ON&&ON.v&&ON.v.seats&&ON.v.seats[s];return x&&!x.bot&&(x.off||x.auto)?'<small class="off">'+(x.off?"离线":"托管")+"</small>":"";}
function cn(c){return isJ(c)?rn(nat(c)):SUITS[suit(c)]+rn(nat(c));}
function cardH(c,extra,L){var j=isJ(c),n=nat(c),s=suit(c),red=j?n===17:(s===1||s===3),lv=!j&&n===L;var inner=j?"<b>"+(n===17?"大":"小")+"<br>王</b><u>"+(n===17?"♛":"♚")+"</u>":"<b>"+rn(n)+"</b><em>"+SUITS[s]+"</em><u>"+SUITS[s]+"</u>";return'<i class="gdn-c '+(red?"r":"k")+(j?" jk":"")+(lv?(s===1?" wd":" lv"):"")+(extra?" "+extra:"")+'" data-c="'+c+'">'+inner+(lv?"<span>"+(s===1?"配":"级")+"</span>":"")+"</i>";}
function showOrder(t,L){var cs=t.cards.slice(),k=t.k.t,cnt={},low;if(k==="straight"||k==="sf"||k==="tube"||k==="plate"){low=t.k.r===(k==="plate"?2:k==="tube"?3:5);return cs.sort(function(a,b){function key(c){return wild(c,L)?99:(low&&nat(c)===14)?1:nat(c);}return key(a)-key(b);});}
cs.forEach(function(c){var p=wild(c,L)?0:pw(c,L);cnt[p]=(cnt[p]||0)+1;});return cs.sort(function(a,b){var pa=wild(a,L)?0:pw(a,L),pb=wild(b,L)?0:pw(b,L);return(cnt[pb]-cnt[pa])||(pb-pa)||(a-b);});}
function playH(seat){var t=G.tb[seat],w=(seat===0||seat===2)?232:108,cw=32,n,step,i,h="",cs,lab="";if(!t)return"";if(t.pass)return'<span class="gdn-pass'+(seat===just?" in":"")+'">不出</span>';n=t.cards.length;step=n>1?Math.min(19,(w-cw)/(n-1)):0;cs=showOrder(t,G.L);for(i=0;i<n;i++)h+=cardH(cs[i],"sm",G.L).replace('data-c=','style="left:'+(i*step).toFixed(1)+'px" data-c=');if(isB(t.k))lab=(t.k.t==="bomb"?"💥 "+t.k.n+" 张炸弹":t.k.t==="sf"?"🌈 同花顺":"👑 天王炸");else if(t.k.n>=5)lab=KN[t.k.t];return'<span class="gdn-pl'+(isB(t.k)?" boom":"")+(seat===just?" in":"")+'" style="width:'+(cw+(n-1)*step).toFixed(0)+'px">'+h+"</span>"+(lab?'<span class="gdn-kn">'+lab+"</span>":"");}
function seatH(s){var n=G.hands[s].length,pos=G.out.indexOf(s),on=G.ph==="play"&&G.turn===s;return'<div class="gdn-seat s'+s+(on?" on":"")+(s===2?" mate":"")+'"><span class="gdn-av">'+FACE[s]+(pos>=0?'<i class="gdn-md">'+MEDAL[pos]+"</i>":"")+'</span><span class="gdn-nm">'+nm(s)+(s===2?"<small>队友</small>":"")+offH(s)+'</span><span class="gdn-n'+(pos<0&&n<=5?" hot":"")+'">'+(pos>=0?PLACE[pos]:"剩 "+n+" 张")+"</span></div>";}
function topH(){return'<div class="gdn-top"><button type="button" class="gdn-x" data-gd="home" aria-label="返回">‹</button><span class="gdn-tm me'+(G.cur===0?" cur":"")+'">我方 打 <b>'+rn(G.lv[0])+'</b></span><span class="gdn-cur">本局级牌 <b>'+rn(G.L)+"</b><i>♥"+rn(G.L)+" 百搭"+(ON&&ON.v?" · 第 "+ON.v.k+"/"+ON.v.n+" 局":"")+'</i></span><span class="gdn-tm op'+(G.cur===1?" cur":"")+'">对方 打 <b>'+rn(G.lv[1])+'</b></span><button class="gdn-q" data-gd="rule" aria-label="规则">?</button></div>';}
function midH(){var t=G.turn,it;if(G.ph==="trib"){it=G.trib.items[G.trib.i];return ON&&it&&!MYQ?"等"+nm(it.t)+"还贡…":"进贡 · 还贡";}
if(G.ph!=="play")return"";if(t===0&&ON&&!MYQ)return ON.v.q?"出牌中…":G.last?"要不起，自动不出":"机器人在替你出牌…";if(t===0)return G.last?"轮到你 · 要压过"+nm(G.last.who):(G.wind===0?"对家走完了，你接风 · 随便出":"轮到你 · 随便出一手");return(G.wind===t?nm(t)+"接风 · ":"")+"等"+nm(t)+"出牌…";}
function noteH(){var T=G.trib,left=G.hands[0].length+G.hands[1].length+G.hands[2].length+G.hands[3].length,t;if(!T||(G.ph!=="trib"&&left!==108))return"";if(T.anti)t="抗贡：垫底的一方抓到两个大王，这局不用进贡，"+nm(T.lead)+"先出。";else t=T.items.map(function(it){return nm(it.f)+"进贡 <b>"+cn(it.c)+"</b> 给"+nm(it.t)+(it.b>=0?"，"+nm(it.t)+"还 <b>"+cn(it.b)+"</b>":"");}).join("；")+"。";return'<p class="gdn-note">'+t+"</p>";}
function barH(){var it,pos=G.out.indexOf(0),cd=ON?'<span class="gdn-cd" id="gdn-cd"></span>':"",my;if(G.ph==="trib"){it=G.trib.items[G.trib.i];if(it&&it.t===0&&(!ON||(MYQ&&MYQ.type==="gback")))return'<div class="gdn-bar">'+cd+'<span class="gdn-tip">点一张 10 以下的牌还给'+nm(it.f)+'</span><button class="gdn-b go" data-gd="back" id="gdn-go">还这张</button></div>';}
my=ON?!!MYQ&&MYQ.type==="gturn":G.ph==="play"&&G.turn===0;if(my)return'<div class="gdn-bar">'+cd+(G.last?'<button class="gdn-b" data-gd="pass">不出</button>':"")+'<button class="gdn-b" data-gd="hint">提示</button><button class="gdn-b go" data-gd="play" id="gdn-go">出牌</button></div>';if(ON&&ON.v.auto&&ON.v.st==="play")return'<div class="gdn-bar"><span class="gdn-tip">托管中，机器人在替你打</span><button class="gdn-b go ok" data-gd="unauto">我回来了</button></div>';return'<div class="gdn-bar"><span class="gdn-tip">'+(pos>=0&&G.ph==="play"?"你是"+PLACE[pos]+" "+MEDAL[pos]+"，看队友的了":G.ph==="play"?"等别人出牌，可以先把牌选好":"")+"</span></div>";}
function handH(){var h=G.hands[0],i,s="";for(i=0;i<h.length;i++)s+=cardH(h[i],"",G.L);return'<div class="gdn-hand" id="gdn-hand">'+s+"</div>";}
function resParts(){var R=G.res,me=R.w===0,o=R.o,i,rows="",how=R.up===3?"头游 + 二游（双下）":R.up===2?"头游 + 三游":"头游 + 末游",side=me?"我方":"对方",line;for(i=0;i<4;i++)rows+='<span class="'+(o[i]%2===0?"me":"")+'">'+MEDAL[i]+" "+PLACE[i]+" · "+nm(o[i])+"</span>";if(R.win)line=side+"打过了 A，整场结束。";else if(R.to===R.from)line=side+how+"，还在打 A（要头游、而且队友不垫底才算过）。";else line=side+how+"，升 "+(R.to-R.from)+" 级：打 "+rn(R.from)+" → 打 "+rn(R.to)+"。";return{me:me,rows:rows,line:line,win:R.win};}
function resH(){var p=resParts();return'<div class="gdn-ov"><div class="gdn-res '+(p.me?"win":"lose")+'"><div class="gdn-rt">'+(p.win?(p.me?"🏆 打过 A，通关！":"这场输了，再来"):(p.me?"🎉 这局赢了":"😵 这局输了"))+'</div><div class="gdn-rs">'+p.line+'</div><div class="gdn-ro">'+p.rows+'</div><button class="gdn-b go ok" data-gd="'+(p.win?"new":"next")+'">'+(p.win?"再来一场":"下一局")+"</button></div></div>";}
function onResH(v){var p=resParts(),done=v.st==="done",rdy=v.seats[0]&&v.seats[0].ready,a=G.lv[0],b=G.lv[1],fin="";if(done)fin=p.win?(p.me?"我方打过了 A，赢下这一桌！":"对方打过了 A，这一桌输了。"):a===b?"两边都打到 "+rn(a)+"，打平。":a>b?"我方打到 "+rn(a)+"，对方打到 "+rn(b)+"，我方赢。":"对方打到 "+rn(b)+"，我方打到 "+rn(a)+"，对方赢。";return'<div class="gdn-ov"><div class="gdn-res '+(p.me?"win":"lose")+'"><div class="gdn-rt">'+(done?"打完了，一共 "+v.k+" 局":"第 "+v.k+"/"+v.n+" 局 · "+(p.me?"🎉 赢了":"😵 输了"))+'</div><div class="gdn-rs">'+p.line+(fin?"<br><b>"+fin+"</b>":"")+'</div><div class="gdn-ro">'+p.rows+"</div>"+
(done?'<button class="gdn-b go ok" data-gd="olobby">回大厅</button><p class="gdn-rs gdn-rs2">打到几级只是这一桌的记分，到这里就清零了。</p>':'<button class="gdn-b go'+(rdy?"":" ok")+'" data-gd="ready">'+(rdy?"准备好了，等其他人…":"下一局")+'</button><p class="gdn-rs gdn-rs2"><span id="gdn-cd"></span> 秒后自动开始下一局</p>')+"</div></div>";}
var RULES="<li>四个人打两副牌。你和对面的<b>对家</b>是一队，一起打上家、下家。</li>"+"<li>谁先把手里的牌出完谁是<b>头游</b>。头游的队友是二游，升 3 级；是三游，升 2 级；是末游，升 1 级。</li>"+"<li>从 2 打起，<b>打过 A 就赢一整场</b>。打 A 那局要头游、而且队友不垫底才算过。</li>"+"<li><b>级牌</b>：这局打几，几就比 A 大，只比王小。<b>红桃级牌是百搭</b>，可以当任何一张牌用（不能当王）。</li>"+"<li>牌型：单张、对子、三张、三带二、顺子（5 张）、三连对、钢板（两个连着的三张）。</li>"+"<li>炸弹从小到大：4 张炸 → 5 张炸 → 同花顺 → 6 张及以上 → 四个王。炸弹能压任何别的牌型。</li>"+"<li><b>进贡</b>：上一局垫底的，要把最大的一张牌给头游，头游还一张 10 以下的牌。双下两个人都要进贡。垫底的一方抓到两个大王可以不进贡。</li>"+"<li>队友走完了、没人压他最后一手，就由你<b>接风</b>先出。</li>";function ruleH(){return'<div class="gdn-sheet" data-gd="rule"><div class="gdn-sh" data-gd="noop"><h3>掼蛋怎么打</h3><ul>'+RULES+'</ul><p class="gdn-safe">纯娱乐：不收费、不用连钱包、没有任何币进出。</p><div class="gdn-shb">'+(ON?'<button class="gdn-b" data-gd="quit">离开房间'+(ON.v&&(ON.v.st==="play"||ON.v.st==="between")?"（机器人替我打）":"")+"</button>":'<button class="gdn-b" data-gd="reset">'+(resetArm?"再点一次，确认重开":"重新开一场")+"</button>")+'<button class="gdn-b go ok" data-gd="rule">继续打牌</button></div></div></div>';}
function layHand(){var box=document.getElementById("gdn-hand"),els,n,w,rows,per,r,i,k,step,off,el,z=1;if(!box)return;els=box.children;n=els.length;w=box.clientWidth;rows=n>14?2:1;per=Math.ceil(n/rows);for(r=0;r<rows;r++){k=r===0?per:n-per;step=k>1?Math.min(36,(w-48)/(k-1)):0;off=(w-(48+(k-1)*step))/2;for(i=0;i<k;i++){el=els[r*per+i];el.style.left=(off+i*step).toFixed(1)+"px";el.style.top=(18+r*54)+"px";el.style.zIndex=z++;}}
box.style.height=(n?(rows===2?144:90):36)+"px";}
function selected(){return G.hands[0].filter(function(c){return sel[c];});}
function refreshSel(){var box=document.getElementById("gdn-hand"),go=document.getElementById("gdn-go"),i,el,cs,ks,k=null;if(!box||!G)return;for(i=0;i<box.children.length;i++){el=box.children[i];el.classList.toggle("up",!!sel[el.getAttribute("data-c")]);}
if(!go)return;cs=selected();if(G.ph==="trib"){go.classList.toggle("ok",cs.length===1&&E.canBack(G.hands[0],cs[0],G.L));return;}
ks=kinds(cs,G.L);for(i=0;i<ks.length;i++)if(!G.last||beats(ks[i],G.last.k)){k=ks[i];break;}
go.classList.toggle("ok",!!k);go.textContent=k?"出牌 · "+KN[k.t]:"出牌";}
function toast(t){toastTxt=t;toastEnd=Date.now()+1300;showToast();}
function showToast(){var tb=document.querySelector("#gdn-root .gdn-table"),el=document.getElementById("gdn-toast");if(el)el.parentNode.removeChild(el);if(!tb||!toastTxt||Date.now()>toastEnd)return;el=document.createElement("div");el.id="gdn-toast";el.className="gdn-toast";el.textContent=toastTxt;tb.appendChild(el);clearTimeout(toastT);toastT=setTimeout(function(){var e2=document.getElementById("gdn-toast");if(e2)e2.parentNode.removeChild(e2);},Math.max(200,toastEnd-Date.now()));}
function draw(){if(!G||G.ph==="idle")return lobby();A.app.innerHTML='<section class="gdn" id="gdn-root">'+topH()+'<div class="gdn-table">'+seatH(2)+seatH(3)+seatH(1)+'<div class="gdn-p p2">'+playH(2)+'</div><div class="gdn-p p3">'+playH(3)+'</div><div class="gdn-p p1">'+playH(1)+'</div><div class="gdn-p p0">'+playH(0)+"</div>"+'<div class="gdn-mid">'+midH()+"</div>"+(G.ph==="done"||G.ph==="over"?(ON?onResH(ON.v):resH()):"")+"</div>"+noteH()+barH()+handH()+(showRule?ruleH():"")+"</section>";layHand();refreshSel();showToast();}
function lobby(){var fan=[12,24,53,49,35],i,f="",sv=load();stats();clearTimeout(tm);G=null;ON=null;MYQ=null;showRule=false;for(i=0;i<fan.length;i++)f+=cardH(fan[i],"",0);A.app.innerHTML='<section class="gdn" id="gdn-root"><div class="gdn-hero"><div class="gdn-fan">'+f+'</div><h2>掼蛋</h2><p>两副牌 · 你和对家一队 · 从 2 一路打到 A</p>'+
(sv?'<button class="gdn-b go ok big" data-gd="resume">接着打单机这一局</button><button class="gdn-b gdn-sub" data-gd="new">重开一场单机</button>':'<button class="gdn-b go ok big" data-gd="new">单机练习（打电脑）</button>')+
(ST.w+ST.l?'<div class="gdn-st">单机战绩：赢 '+ST.w+" 场 · 输 "+ST.l+" 场 · 最高打到 "+rn(ST.best)+"</div>":"")+'<p class="gdn-safe">单机不收费、不用连钱包。打到一半关掉，下次接着打。</p></div><div id="gdn-on">'+onCard()+'</div><details class="gdn-rules"><summary>掼蛋怎么打（一分钟看懂）</summary><ul>'+RULES+"</ul></details></section>";probe();loadCards();}
function step(){var it;clearTimeout(tm);if(ON||!G)return;while(G.ph==="trib"){it=G.trib.items[G.trib.i];if(it.t===0)break;E.giveBack(G,backPick(G.hands[it.t],G.L));}
if((G.ph==="done"||G.ph==="over")&&G.sc!==G.rd){G.sc=G.rd;toastTxt="";stats();if(G.lv[0]>ST.best)ST.best=G.lv[0];if(G.ph==="over"){if(G.res.w===0)ST.w++;else ST.l++;}
lsSet("gd:st",JSON.stringify(ST));}
save();draw();just=-1;if(G.ph!=="play")return;if(G.turn!==0){tm=setTimeout(botAct,G.hands[0].length?(G.last?750:1100):380);return;}
hints=null;hi=0;if(G.last&&!gen(G.hands[0],G.L,G.last.k).length){toast("要不起");tm=setTimeout(function(){if(!ON&&G&&G.ph==="play"&&G.turn===0&&G.last&&document.getElementById("gdn-root")){E.pass(G,0);sel={};just=0;step();}},900);}}
function botAct(){var s,cs;try{if(ON||!G||G.ph!=="play"||G.turn===0||!document.getElementById("gdn-root"))return;s=G.turn;cs=bot(G,s);if(!cs||!play(G,s,cs)){if(G.last)pass(G,s);else play(G,s,[G.hands[s][G.hands[s].length-1]]);}
just=s;step();}catch(e){}}
function doAct(a,el){var cs,k,b,i;if(a==="noop")return;if(a==="new"){ON=null;MYQ=null;G=newMatch();sel={};showRule=false;startRound(G,Math.random);return step();}
if(a==="resume"){ON=null;MYQ=null;G=load();sel={};if(G)return step();return lobby();}
if(a==="home"){if(ON){showRule=true;resetArm=false;return draw();}clearTimeout(tm);if(G)save();return lobby();}
if(onAct(a,el))return;if(!G)return;if(a==="rule"){showRule=!showRule;resetArm=false;return draw();}
if(a==="reset"){if(!resetArm){resetArm=true;return draw();}clearTimeout(tm);G=null;sel={};showRule=false;resetArm=false;save();return lobby();}
if(a==="next"){if(G.ph!=="done")return;sel={};startRound(G,Math.random);return step();}
if(a==="back"){cs=selected();if(ON){if(!MYQ||MYQ.type!=="gback")return;if(cs.length!==1||!canBack(G.hands[0],cs[0],G.L))return toast("要选一张 10 以下的牌（级牌不算）");return sendAct(cs[0]);}
if(cs.length!==1||!E.giveBack(G,cs[0]))return toast("要选一张 10 以下的牌（级牌不算）");sel={};return step();}
if(G.ph!=="play"||G.turn!==0||(ON&&!MYQ))return;if(a==="pass"&&ON){if(G.last)sendAct("pass");return;}
if(a==="pass"){if(pass(G,0)){sel={};just=0;step();}return;}
if(a==="hint"){if(!hints){hints=gen(G.hands[0],G.L,G.last?G.last.k:null);hi=0;if(!G.last){b=bot(G,0);if(b){for(i=0;i<hints.length;i++)if(hints[i].cards.join()===b.join()){hints.unshift(hints.splice(i,1)[0]);break;}}}}
if(!hints.length)return toast("没有能压过的牌");sel={};hints[hi%hints.length].cards.forEach(function(c){sel[c]=1;});hi++;return refreshSel();}
if(a==="play"){cs=selected();if(!cs.length)return toast("先点要出的牌");if(ON){if(!check(G,0,cs))return toast(G.last&&kinds(cs,G.L).length?"这手压不过，换一手":"这几张凑不成牌型");return sendAct(cs);}
k=play(G,0,cs);if(!k)return toast(G.last&&kinds(cs,G.L).length?"这手压不过，换一手":"这几张凑不成牌型");sel={};just=0;return step();}}
function onClick(e){try{var t=e.target&&e.target.closest?e.target:null,bn,el;if(!t||!document.getElementById("gdn-root"))return;bn=t.closest("#gdn-buy [data-n], #gdn-buy [data-tk]");if(bn){if(BUY&&!BUY.busy){if(bn.hasAttribute("data-n"))BUY.n=Number(bn.getAttribute("data-n"));else BUY.tk=bn.getAttribute("data-tk");buyQuote();}return;}
el=t.closest("[data-gd]");if(el)doAct(el.getAttribute("data-gd"),el);}catch(err){}}
function handCard(el){while(el&&el.nodeType===1){if(el.classList.contains("gdn-c")&&el.parentNode&&el.parentNode.id==="gdn-hand")return el;el=el.parentNode;}return null;}
function onDown(e){try{var el=handCard(e.target),c;if(!el||!G)return;c=el.getAttribute("data-c");drag={on:!sel[c],seen:{}};drag.seen[c]=1;if(drag.on)sel[c]=1;else delete sel[c];refreshSel();e.preventDefault();}catch(err){drag=null;}}
function onMove(e){if(!drag)return;try{var el=handCard(document.elementFromPoint(e.clientX,e.clientY)),c;if(!el)return;c=el.getAttribute("data-c");if(drag.seen[c])return;drag.seen[c]=1;if(drag.on)sel[c]=1;else delete sel[c];refreshSel();}catch(err){drag=null;}}
function onUp(){drag=null;}
var GAPI="https://ailgnsotc.cc/mj/api",PAYTO="0xedb9c6900a11d2dd37da6b59f3604c35a39db1e6",TOK={dai:"0x83fd06f0846d9d90b3016bf670efe2e0b11cde14",ailgns:"0x256edb652db43e721ec6a12b6b51b6967d3bb8cb",lgns:"0x4d1d808a081fdac440703b3765fc61f8028c06b8"},TKN={dai:"DAI",ailgns:"AiLGNS",lgns:"LGNS"};function waitMs(ms){return new Promise(function(r){setTimeout(r,ms);});}
function u256(v){return BigInt(v).toString(16).padStart(64,"0");}
function utf8hex(str){var b=unescape(encodeURIComponent(str)),h="0x",i;for(i=0;i<b.length;i++)h+=b.charCodeAt(i).toString(16).padStart(2,"0");return h;}
function api(o){function net(){var e=new Error("连不上联机服务器，请检查网络，过一会儿再试。");e.net=true;throw e;}
var ac=W.AbortController?new AbortController():null,t=ac&&setTimeout(function(){ac.abort();},35000);return fetch(GAPI,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify(o),signal:ac?ac.signal:undefined}).then(function(r){return r.json();}).then(function(j){clearTimeout(t);return j;},function(){clearTimeout(t);net();}).then(function(j){if(!j||j.err){var e=new Error((j&&j.err)||"服务器开小差了，稍后再试");e.srv=true;throw e;}return j;});}
function sid(){var v=SID||ls("mj:sid")||"",a,i;if(!/^[0-9a-f]{32}$/.test(v)){a=new Uint8Array(16);crypto.getRandomValues(a);v="";for(i=0;i<16;i++)v+=(a[i]+256).toString(16).slice(1);lsSet("mj:sid",v);}
SID=v;return v;}
function nameNow(){var el=document.getElementById("gdn-name");if(el)lsSet("mj:name",el.value.trim().slice(0,8));return ls("mj:name")||"";}
function note(t){var el=document.getElementById("gdn-say");SAY=t||"";if(el)el.textContent=SAY;}
function setCards(v){CARDS=v;var el=document.getElementById("gdn-cards");if(el)el.textContent=nf(v)+" 张";}
function onCard(){var room=ls("gd:room"),head='<section class="card mj"><h2>🧑‍🤝‍🧑 和朋友开房（真人联机）</h2>';if(OPEN===false)return head+'<p class="sub">联机房间正在准备，很快开放。现在可以先玩单机练手。</p></section>';if(OPEN===null)return head+'<p class="sub" id="gdn-say">'+esc(SAY||"正在连接联机服务器…")+"</p></section>";return head+'<p class="sub">开一个房间，把房号发给朋友，4 个人一起打：你和坐你对面的人一队。人不够可以加机器人。</p>'+
(room?'<button type="button" class="mj-start" data-gd="rejoin">回到牌局（房号 '+esc(room)+"）</button>":"")+'<div class="mj-bean"><span>我的房卡</span><b id="gdn-cards">'+(CARDS==null?"—":nf(CARDS)+" 张")+'</b><button type="button" class="ghost" data-gd="buy">买房卡</button></div><div id="gdn-buy"></div>'+'<p class="mj-lb">我的昵称（桌上别人看到的名字）</p><input class="mj-in" id="gdn-name" maxlength="8" placeholder="最多 8 个字，不填就随机起一个" value="'+esc(ls("mj:name")||"")+'">'+'<div class="mj-two"><button type="button" class="pri" data-gd="mk4">开房间 · 4 局<small>用 1 张房卡</small></button><button type="button" data-gd="mk8">开房间 · 8 局<small>用 2 张房卡</small></button></div>'+'<p class="mj-lb">朋友开好了？输入房号加入（不用房卡，也不用钱包）</p><div class="mj-join"><input class="mj-in" id="gdn-code" inputmode="numeric" maxlength="6" placeholder="6 位房号"><button type="button" data-gd="join">加入</button></div>'+'<p class="mj-say" id="gdn-say">'+esc(SAY)+"</p>"+'<p class="mj-warn">⚠️ 房卡是开房间的服务费，1 张 = 1 DAI，可以用 DAI、AiLGNS 或 LGNS 付；和麻将的房卡是同一种，通用。房卡在按「开始」的时候才扣；买了不退、不能转给别人、不能换回钱。桌上打到几级只是这一桌的记分，打完就清零：不能提现、不能转赠、不能兑换任何东西。</p></section>';}
function onDraw(){var el=document.getElementById("gdn-on");if(el&&!ON){el.innerHTML=onCard();buyDraw();}}
function probe(){if(OPEN===true)return;api({act:"gdinfo"}).then(function(){OPEN=true;SAY="";onDraw();loadCards();},function(e){OPEN=e.srv?false:null;SAY=e.srv?"":e.message;onDraw();});}
function loadCards(){var a=ls("mj:addr"),tx=ls("mj:tx");if(OPEN!==true)return;if(a)api({act:"cards",addr:a}).then(function(j){setCards(j.cards);},function(){});if(tx&&!(BUY&&BUY.busy))api({act:"buy",tx:tx}).then(function(j){lsSet("mj:tx","");setCards(j.cards);if(j.n)note("上次付的款已经记上了，到账 "+j.n+" 张房卡。");},function(e){if(e.srv&&!/查不到/.test(e.message))lsSet("mj:tx","");});}
function buyDraw(){var el=document.getElementById("gdn-buy"),b=BUY;if(!el)return;if(!b){el.innerHTML="";return;}
el.innerHTML='<div class="mj-buy"><p class="mj-lb">买几张</p><div class="mj-bases">'+[1,5,10].map(function(x){return'<button type="button" class="'+(x===b.n?"on":"")+'" data-n="'+x+'">'+x+" 张</button>";}).join("")+"</div>"+'<p class="mj-lb">用什么付</p><div class="mj-bases">'+["dai","ailgns","lgns"].map(function(k){return'<button type="button" class="'+(k===b.tk?"on":"")+'" data-tk="'+k+'">'+TKN[k]+"</button>";}).join("")+"</div>"+'<div class="mj-res"><span>要付</span><b>'+(b.q?esc(b.q.show)+" "+TKN[b.tk]:b.err?"—":"正在算…")+"</b><small>"+b.n+" 张房卡 = "+b.n+" DAI"+(b.tk==="dai"?"":b.tk==="lgns"?"，LGNS 按池子价的一半折算（和本站其他地方一样）":"，按现在的价格折算")+"</small></div>"+'<p class="mj-say">'+esc(b.err||"")+"</p>"+'<button type="button" class="mj-start" data-gd="pay"'+(b.q&&!b.busy?"":" disabled")+">"+esc(b.busy||"去钱包付款")+'</button><button type="button" class="ghost mj-back" data-gd="buyx">先不买</button></div>';}
function buyQuote(){var b=BUY,my;if(!b)return;b.q=null;b.err="";my=b.seq=(b.seq||0)+1;buyDraw();api({act:"quote",n:b.n,tk:b.tk}).then(function(q){if(BUY===b&&b.seq===my){b.q=q;buyDraw();}},function(e){if(BUY===b&&b.seq===my){b.err=e.message;buyDraw();}});}
function confirmTx(tx,left){return api({act:"buy",tx:tx}).then(null,function(e){if(left>0&&(e.net||/查不到/.test(e.message)))return waitMs(3000).then(function(){return confirmTx(tx,left-1);});throw e;});}
function payCards(){var b=BUY,WL=A.wallet,eth,me,q,data,sent=false;if(!b||!b.q||b.busy)return;function st(t){b.busy=t;b.err="";if(BUY===b)buyDraw();}
st("正在打开钱包…");A.wallets.choose().then(function(p){eth=p;return A.wallets.ask(eth,{method:"eth_requestAccounts"});}).then(function(acc){me=String(acc[0]).toLowerCase();st("正在切换到 Anubis 链…");return WL.switchTo(eth,"anubis");}).then(function(){st("正在核对价格…");return api({act:"quote",n:b.n,tk:b.tk});}).then(function(x){q=x;if(String(q.payTo).toLowerCase()!==PAYTO||String(q.token).toLowerCase()!==TOK[b.tk]||!/^[0-9a-f]{30}$/.test(q.tag)||!/^[1-9]\d*$/.test(q.amount)||(b.tk==="dai"&&q.amount!==String(b.n)+"000000000000000000"))throw new Error("报价核对不上，为了安全先不付款。请提交工单告诉技术人员。");b.q=q;data="0xa9059cbb"+A.pad(q.payTo)+u256(q.amount)+q.tag;return WL.rpcOn("anubis","eth_call",[{from:me,to:q.token,data:data},"latest"]).then(null,function(){throw new Error("钱包里的 "+TKN[b.tk]+" 不够（要 "+q.show+"），或者没有 DAI 付 Gas。可以换一种币付。");});}).then(function(){st("请在钱包里确认：付 "+q.show+" "+TKN[b.tk]);return A.wallets.ask(eth,{method:"eth_sendTransaction",params:[{from:me,to:q.token,data:data}]});}).then(function(tx){sent=true;lsSet("mj:tx",tx);lsSet("mj:addr",me);if((ls("mj:tok")||"").split(".")[0]!==me)lsSet("mj:tok","");st("已付款，等链上确认…");return WL.waitOn("anubis",tx).then(function(){st("正在记账…");return confirmTx(tx,8);});}).then(function(j){lsSet("mj:tx","");BUY=null;buyDraw();setCards(j.cards);note(j.n?"买好了，到账 "+j.n+" 张房卡。":"这笔付款之前已经记过账了。");}).then(null,function(e){b.busy="";b.err=sent?"付款已经发出，但还没记上账。不用再付一次：过一会儿回到这个页面会自动补记；一直没到就提交工单。":WL.error(e);if(BUY===b)buyDraw();});}
function token(){var t=ls("mj:tok")||"",p=t.split(".");return p.length===3&&Number(p[1])>Date.now()/1000+3600?t:"";}
function login(){var t=token(),eth,me,ts;if(t)return Promise.resolve(t);return A.wallets.choose().then(function(p){eth=p;return A.wallets.ask(eth,{method:"eth_requestAccounts"});}).then(function(acc){me=String(acc[0]).toLowerCase();ts=Math.floor(Date.now()/1000);return A.wallets.ask(eth,{method:"personal_sign",params:[utf8hex("AiLGNS 掼蛋登录\n钱包: "+me+"\n时间: "+ts),me]});}).then(function(sig){return api({act:"login",addr:me,ts:ts,sig:sig});}).then(function(j){lsSet("mj:tok",j.token);lsSet("mj:addr",j.addr);setCards(j.cards);return j.token;});}
function make(rounds){if(busy)return;busy=true;var name=nameNow();note(token()?"正在开房间…":"请在钱包里签个名，证明这是你的钱包（不花钱）…");login().then(function(t){return api({act:"create",game:"gd",token:t,sid:sid(),name:name,rounds:rounds});}).then(function(j){busy=false;CARDS=j.cards;enter(j.room);},function(e){busy=false;var m=A.wallet.error(e);if(e&&e.srv&&/登录|签名/.test(m))lsSet("mj:tok","");note(m);if(e&&e.srv&&/房卡不够/.test(m)&&!BUY){BUY={n:1,tk:"dai"};buyQuote();}});}
function join(code){code=String(code||"").replace(/\D/g,"");if(code.length!==6){note("房号是 6 位数字，问开房间的朋友要。");return;}
if(busy)return;busy=true;note("正在进房间…");api({act:"join",game:"gd",room:code,sid:sid(),name:nameNow()}).then(function(){busy=false;enter(code);},function(e){busy=false;note(e.message);if(e.srv&&ls("gd:room")===code){lsSet("gd:room","");onDraw();}});}
function enter(code){clearTimeout(tm);G=null;MYQ=null;sel={};BUY=null;doneQid=0;showRule=false;SAY="";ON={room:code,ver:0,v:null,at:0,fail:0,tot:-1};lsSet("gd:room",code);A.app.innerHTML='<section class="gdn" id="gdn-root"><section class="card mj"><p class="sub">正在进房间…</p></section></section>';if(!cdTimer)cdTimer=setInterval(tick,500);pollLoop(ON);}
function pollLoop(o){var t0=Date.now();if(ON!==o)return;if(!document.getElementById("gdn-root")){ON=null;return;}
api({act:"poll",room:o.room,sid:sid(),ver:o.ver}).then(function(v){if(ON!==o)return;o.fail=0;if(v.st){o.ver=v.ver;o.v=v;o.at=Date.now();try{show();}catch(e){}if(ON!==o)return;if(v.st==="done"){lsSet("gd:room","");return;}}
if(!v.st&&Date.now()-t0<1500)setTimeout(function(){pollLoop(o);},1500);else pollLoop(o);},function(e){if(ON!==o)return;if(e.srv){lsSet("gd:room","");lobby();note(e.message);return;}
if(++o.fail===3&&o.v&&o.v.st==="wait")note("网络不太好，正在重连…");setTimeout(function(){pollLoop(o);},2000);});}
function cmd(act,extra){var o=ON,b={act:act,room:o.room,sid:sid()},k;for(k in extra||{})b[k]=extra[k];return api(b).then(null,function(e){if(ON===o){note(e.message);toast(e.message);}});}
function sendAct(v){var o=ON,q=MYQ;if(!o||!q)return;doneQid=q.qid;MYQ=null;sel={};draw();tick();api({act:"act",room:o.room,sid:sid(),qid:q.qid,v:v}).then(null,function(e){if(ON!==o)return;if(o.v&&o.v.q&&o.v.q.qid===q.qid){doneQid=0;MYQ=o.v.q;draw();tick();}
toast(e.srv?e.message:"网络不好，没发出去，再点一次");});}
function tick(){var o=ON,v=o&&o.v,el=document.getElementById("gdn-cd"),ms,s;if(!o){clearInterval(cdTimer);cdTimer=0;return;}
if(!el||!v)return;ms=v.st==="between"?v.left:MYQ?MYQ.left:-1;if(ms<0){el.textContent="";return;}
s=Math.max(0,Math.ceil((ms-(Date.now()-o.at))/1000));el.textContent=v.st==="between"?s:"⏱ "+s;el.className="gdn-cd"+(s<=5&&v.st==="play"?" hot":"");}
function waitHtml(v){var full=v.seats.every(function(x){return!!x;}),mine=v.seats[0].i,who=["我","对手（下家）","我的队友（对家）","对手（上家）"];return"<h1>等人到齐</h1>"+'<div class="mj-code"><span>房号</span><b>'+esc(v.code)+'</b><button type="button" class="ghost" data-gd="copy">复制邀请链接</button></div>'+'<p class="sub">把房号或链接发给朋友，朋友打开就能进来，不用房卡。一共打 '+v.n+" 局。坐对面的两个人是一队。</p>"+'<ul class="mj-seats">'+v.seats.map(function(x,k){return x?"<li><b>"+esc(x.name)+"</b><i>"+who[k]+"</i>"+(x.host?"<i>房主</i>":"")+(x.bot?"<i>机器人</i>":x.off?"<i>离线</i>":"")+(v.host&&k?'<button type="button" class="ghost" data-gd="kick" data-seat="'+x.i+'">请离开</button>':"")+"</li>":'<li class="empty">空位 · '+who[k]+(v.host?"":' <button type="button" class="ghost" data-gd="sit" data-seat="'+((mine+k)%4)+'">坐这里</button>')+"</li>";}).join("")+"</ul>"+
(v.host?(full?"":'<button type="button" class="ghost mj-back" data-gd="addbot">加一个机器人</button>')+'<button type="button" class="mj-start" data-gd="go"'+(full?"":" disabled")+">"+(full?"开始（用 "+v.need+" 张房卡）":"坐满 4 个才能开始")+"</button>":'<p class="mj-lb">等房主点开始…</p>')+'<p class="mj-say" id="gdn-say">'+esc(SAY)+"</p>"+'<button type="button" class="ghost mj-back" data-gd="quit">'+(v.host?"解散房间（不扣房卡）":"离开房间")+"</button>";}
function toG(v){var g=v.g,h=[g.hand.slice()],i;for(i=1;i<4;i++)h.push(new Array(g.cnt[i]));return{lv:g.lv,cur:g.cur,L:g.L,hands:h,turn:g.turn,last:g.last,tb:g.tb,out:g.out,ph:g.ph,trib:g.trib,res:g.res,wind:g.wind,rd:g.rd};}
function show(){var o=ON,v=o.v,tot;if(!document.getElementById("gdn-root"))return;if(v.game!=="gd"){api({act:"leave",room:o.room,sid:sid()}).then(null,function(){});lsSet("gd:room","");lobby();note("这个房号不是掼蛋房间。");return;}
if(v.st==="wait"||!v.g){G=null;MYQ=null;A.app.innerHTML='<section class="gdn" id="gdn-root"><section class="card mj">'+waitHtml(v)+"</section></section>";return;}
G=toG(v);tot=v.g.cnt[0]+v.g.cnt[1]+v.g.cnt[2]+v.g.cnt[3];just=o.tot!==tot?v.g.just:-1;o.tot=tot;MYQ=v.st==="play"&&v.q&&v.q.qid!==doneQid?v.q:null;draw();just=-1;tick();}
function copy(t){function fb(){W.prompt("长按复制：",t);}try{navigator.clipboard.writeText(t).then(function(){note("邀请链接已复制，发给朋友就行。");},fb);}catch(e){fb();}}
function onAct(a,el){var o=ON,v=o&&o.v,st;if(a==="buy"){if(BUY&&BUY.busy)return true;BUY=BUY?null:{n:1,tk:"dai"};if(BUY)buyQuote();else buyDraw();return true;}
if(a==="buyx"){if(!BUY||!BUY.busy){BUY=null;buyDraw();}return true;}
if(a==="pay"){payCards();return true;}
if(a==="mk4"||a==="mk8"){make(a==="mk4"?4:8);return true;}
if(a==="join"){join((document.getElementById("gdn-code")||{}).value);return true;}
if(a==="rejoin"){join(ls("gd:room"));return true;}
if(!o)return false;if(a==="copy"){copy(location.origin+"/#/gd/"+o.room);return true;}
if(a==="addbot"){cmd("bot");return true;}
if(a==="kick"){cmd("kick",{seat:Number(el.getAttribute("data-seat"))});return true;}
if(a==="sit"){cmd("sit",{to:Number(el.getAttribute("data-seat"))});return true;}
if(a==="go"){cmd("start");return true;}
if(a==="ready"){cmd("ready");return true;}
if(a==="unauto"){cmd("back");return true;}
if(a==="quit"||a==="olobby"){st=v&&v.st;if(st!=="done")api({act:"leave",room:o.room,sid:sid()}).then(null,function(){});if(st!=="play"&&st!=="between")lsSet("gd:room","");lobby();return true;}
return false;}
A.pages.gd=function(){try{if(!bound){bound=true;document.addEventListener("click",onClick);document.addEventListener("pointerdown",onDown);document.addEventListener("pointermove",onMove);document.addEventListener("pointerup",onUp);document.addEventListener("pointercancel",onUp);W.addEventListener("resize",function(){try{layHand();}catch(e){}});}
var m=/^#\/?gd\/(\d{6})/.exec(location.hash);if(m){try{history.replaceState(null,"","#/gd");}catch(e2){}if(!ON||ON.room!==m[1]){lobby();join(m[1]);}return;}
if(document.getElementById("gdn-root"))return;lobby();}catch(e){A.app.innerHTML='<section class="card"><p class="note">掼蛋页面打开失败，请刷新再试。</p></section>';}};})();}catch(e){console.error('[bundle] gd.js',e);}
;(window.AIL_LOADED=window.AIL_LOADED||{})["gd"]="h0de6573220";
/*v:h0de6573220*/