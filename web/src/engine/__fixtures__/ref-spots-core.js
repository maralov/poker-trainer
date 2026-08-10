const RANKS=["A","K","Q","J","T","9","8","7","6","5","4","3","2"];
const RI=r=>RANKS.indexOf(r);
const VAL={A:14,K:13,Q:12,J:11,T:10,"9":9,"8":8,"7":7,"6":6,"5":5,"4":4,"3":3,"2":2};
const SUITS=[{g:"♠",red:0},{g:"♥",red:1},{g:"♦",red:1},{g:"♣",red:0}];
const RX="[AKQJT98765432]";
const pick=a=>a[Math.floor(Math.random()*a.length)];
const combos=h=>h.length===2?6:(h.endsWith("s")?4:12);
const handAt=(i,j)=>i===j?RANKS[i]+RANKS[i]:(j>i?RANKS[i]+RANKS[j]+"s":RANKS[j]+RANKS[i]+"o");
const ALL_HANDS=(()=>{const o=[];for(let i=0;i<13;i++)for(let j=0;j<13;j++)o.push(handAt(i,j));return o;})();
const pct=set=>([...set].reduce((s,h)=>s+combos(h),0)/1326*100);
const union=(...s)=>new Set(s.flatMap(x=>[...x]));
const minus=(a,b)=>new Set([...a].filter(h=>!b.has(h)));

function parseToken(t){
  let m,out=[];
  if(m=t.match(new RegExp(`^(${RX})\\1\\+$`))){for(let i=RI(m[1]);i>=0;i--)out.push(RANKS[i]+RANKS[i]);return out;}
  if(m=t.match(new RegExp(`^(${RX})\\1-(${RX})\\2$`))){let a=RI(m[1]),b=RI(m[2]);if(a>b)[a,b]=[b,a];
    for(let i=a;i<=b;i++)out.push(RANKS[i]+RANKS[i]);return out;}
  if(m=t.match(new RegExp(`^(${RX})(${RX})([so])-(${RX})(${RX})\\3$`))){const hi=RI(m[1]);
    let a=RI(m[2]),b=RI(m[5]);if(a>b)[a,b]=[b,a];
    for(let i=a;i<=b;i++)out.push(RANKS[hi]+RANKS[i]+m[3]);return out;}
  if(m=t.match(new RegExp(`^(${RX})(${RX})([so])\\+$`))){const hi=RI(m[1]);
    for(let i=RI(m[2]);i>hi;i--)out.push(RANKS[hi]+RANKS[i]+m[3]);return out;}
  return [t];
}
const S=(...t)=>new Set(t.flatMap(parseToken));

const cardHTML=(c,hero)=>`<div class="card${c.red?" red":""}${hero?" hero":""}">
  <div class="r">${c.rk}</div><div class="s">${c.g}</div></div>`;
function dealFromHand(hand){
  const [a,b]=[hand[0],hand[1]];
  const mk=(rk,si)=>({rk,v:VAL[rk],s:si,g:SUITS[si].g,red:SUITS[si].red});
  if(hand.length===2||hand.endsWith("o")){
    const i=Math.floor(Math.random()*4);let j=Math.floor(Math.random()*4);
    if(j===i) j=(j+1+Math.floor(Math.random()*3))%4;
    return [mk(a,i),mk(b,j)];
  }
  const i=Math.floor(Math.random()*4);return [mk(a,i),mk(b,i)];
}
/* ══════════════════════ ДІАПАЗОНИ ══════════════════════ */
const RFI_ADD={
  "UTG":["66+","ATs+","KTs+","QTs+","JTs","T9s","AQo+"],
  "UTG+1":["55","A9s","98s","AJo"],
  "MP":["44","A8s","K9s","J9s","KQo"],
  "LJ":["33","A7s","A4s-A5s","Q9s","T8s","ATo"],
  "HJ":["22","A6s","A2s-A3s","K8s","87s","KJo","QJo"],
  "CO":["K5s-K7s","Q8s","J8s","T7s","97s","76s","65s","A9o","KTo","QTo","JTo"],
  "BTN":["K2s-K4s","Q5s-Q7s","J6s-J7s","T6s","96s","86s","75s","64s","54s",
         "A2o-A8o","K8o-K9o","Q9o","J9o","T9o","98o"]
};
const OPEN_ORDER=["UTG","UTG+1","MP","LJ","HJ","CO","BTN"];
const RFI={};
(function(){let acc=[];OPEN_ORDER.forEach(p=>{acc=acc.concat(RFI_ADD[p]);RFI[p]=S(...acc);});
  RFI["SB"]=minus(RFI["BTN"],S("A2o-A4o","K8o","98o","64s","86s","T6s"));})();

const WEAK_O=S("A2o-A9o","K8o-K9o","KTo","Q9o","QTo","J9o","JTo","T9o","98o","ATo");
const ISO={};
["UTG","UTG+1","MP","LJ","HJ","CO","BTN","SB"].forEach(p=>ISO[p]=minus(RFI[p],WEAK_O));
ISO["BB"]=ISO["SB"];
const TIGHTER2={"UTG":"UTG","UTG+1":"UTG","MP":"UTG","LJ":"UTG+1","HJ":"MP","CO":"LJ","BTN":"HJ","SB":"CO","BB":"CO"};

const VS_RAISE={
  EARLY:{label:"ранньої позиції (UTG–MP)",raise:S("QQ+","AKs","AKo"),
    call:{POS:S("22-JJ","AQs","AJs","KQs","QJs","JTs"),SB:S("88-JJ","AQs","AJs","KQs"),
          BB:S("22-JJ","AQs","AJs","ATs","KQs","KJs","QJs","JTs","AQo")},
    note:"Рейз з UTG–MP на 9-max — це майже завжди справжня рука. Не вигадуй тут блефових 3-бетів: колуй у позиції з потенціалом, решту скидай."},
  MID:{label:"середньої позиції (LJ–CO)",raise:S("TT+","AJs+","AQo+"),
    call:{POS:S("22-99","ATs","KJs","KQs","QJs","JTs","T9s","AJo"),SB:S("77-99","ATs","KQs","AJo"),
          BB:S("22-99","A2s-ATs","KTs+","Q9s+","J9s+","T9s","98s","87s","ATo","AJo","KQo","KJo","QJo","JTo")},
    note:"Діапазон опенера вже ширший, тому 3-бетиш валью-руками, які б'ють його калл-діапазон. AJs і TT тут — рейз, а не колл."},
  LATE:{label:"BTN або SB (стіл-рейз)",raise:S("99+","AJs+","KQs","AQo+","A4s-A5s"),
    call:{POS:S("22-88","A7s-ATs","KJs","QJs","JTs","T9s","AJo","KQo"),SB:S("66-88","ATs","KQs"),
          BB:S("22-88","A2s-ATs","K7s+","Q8s+","J8s+","T8s+","97s+","86s+","75s+","65s","54s",
               "A8o-AJo","KTo+","QTo+","JTo","T9o")},
    note:"Найширший діапазон опенера за столом. З BB захищайся широко — ти вже вклав блайнд і закриваєш торги. З SB навпаки: 3-бет або фолд."}
};
const VS_3BET={raise:S("KK+","AKs"),call:S("TT-QQ","AKo","AQs"),
  note:"На 5/10 3-бет майже завжди означає реальну руку. Це той спот, де дисциплінований фолд коштує дешевше за будь-яку креативність."};

const NOTES={
  "UTG":"Дев'ять гравців за спиною. Відкривай лише те, що не соромно грати в мультипоті.",
  "UTG+1":"Майже те саме, що UTG. Спокуса «трохи розширитись» тут коштує найдорожче.",
  "MP":"З'являється місце для маневру, але попереду ще п'ять гравців.",
  "LJ":"Перша позиція, де можна відкривати ATo і слабкі тузи. Слабкі — лише в масті.",
  "HJ":"Три позиції до баттона. Додаються бродвейні офсьюти і дрібні конектори в масті.",
  "CO":"Відкриваєш, щоб забрати пот одразу або грати в позиції проти блайндів.",
  "BTN":"Найприбутковіша позиція за столом. Вінрейт тут будується на частоті відкриття.",
  "SB":"Ніколи не лімпи з SB. Або рейз, або фолд.",
  "BB":"Ти вже вклав блайнд і закриваєш торги — тому захищаєшся значно ширше."
};
const ACTION_ORDER=["UTG","UTG+1","MP","LJ","HJ","CO","BTN","SB","BB"];
const POSTFLOP_ORDER=["SB","BB","UTG","UTG+1","MP","LJ","HJ","CO","BTN"];
const BUCKET=p=>["UTG","UTG+1","MP"].includes(p)?"EARLY":(["LJ","HJ","CO"].includes(p)?"MID":"LATE");
const HERO_CTX=p=>p==="BB"?"BB":(p==="SB"?"SB":"POS");
const SCENARIOS={rfi:{label:"Відкриття",short:"RFI"},iso:{label:"Проти лімперів",short:"ІЗО"},
  vsraise:{label:"Проти рейзу",short:"3-БЕТ"},vs3bet:{label:"Проти 3-бету",short:"vs3Б"}};
const WEIGHTED=(()=>{const o=[];ALL_HANDS.forEach(h=>{const n=combos(h)/2;for(let k=0;k<n;k++)o.push(h);});return o;})();
const TEMPTING=S("22-AA","A2s-AKs","KTs+","QTs+","JTs","T9s","98s","ATo-AKo","KJo-KQo","QJo","JTo","A9o","KTo");

function preBuildSpot(force){
  const P=DB.pre;
  const scen=force?force.scen:pick([...activeScenarios]);
  const seats={}; ACTION_ORDER.forEach(p=>seats[p]=null);
  let heroPos,ranges,options,prompt,potBB,explainExtra="";

  if(scen==="rfi"){
    heroPos=force?force.heroPos:pick(ACTION_ORDER.slice(0,8));
    ACTION_ORDER.slice(0,ACTION_ORDER.indexOf(heroPos)).forEach(p=>seats[p]="fold");
    ranges={raise:RFI[heroPos],call:new Set()};
    options=[{k:"raise",l:"Рейз 3bb",c:"primary"},{k:"fold",l:"Фолд",c:"ghost"}];
    prompt="Усі перед тобою скинули. Твій хід."; potBB=1.5; explainExtra=NOTES[heroPos];
  } else if(scen==="iso"){
    const hi=force?Math.max(1,ACTION_ORDER.indexOf(force.heroPos)):1+Math.floor(Math.random()*8);
    heroPos=ACTION_ORDER[hi];
    const before=ACTION_ORDER.slice(0,hi);
    const nLimp=Math.random()<0.55?1:2;
    const limpers=[],pool=[...before];
    for(let k=0;k<Math.min(nLimp,pool.length);k++)
      limpers.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
    before.forEach(p=>seats[p]=limpers.includes(p)?"limp":"fold");
    const useRange=limpers.length>=2?ISO[TIGHTER2[heroPos]]:ISO[heroPos];
    ranges={raise:useRange,call:new Set()};
    options=[{k:"raise",l:"Ізо-рейз",c:"primary"},{k:"fold",l:"Фолд",c:"ghost"}];
    prompt=`${limpers.length===1?"Лімпер":"Два лімпери"} попереду. Розмір ізо-рейзу: ${4+limpers.length}bb.`;
    potBB=1.5+limpers.length;
    explainExtra=limpers.length>=2
      ?"Проти двох лімперів звужуйся на дві позиції: мультипот з'їдає маргінальні руки."
      :"Оверлімп тут свідомо відсутній — на мікролімітах це чистий злив. Або ізолюйся, або скидай.";
  } else if(scen==="vsraise"){
    let ri,hi;
    if(force){ hi=Math.max(1,ACTION_ORDER.indexOf(force.heroPos));
               ri=Math.floor(Math.random()*Math.min(hi,7)); }
    else { ri=Math.floor(Math.random()*7); hi=ri+1+Math.floor(Math.random()*(8-ri)); }
    const raiser=ACTION_ORDER[ri]; heroPos=ACTION_ORDER[hi];
    ACTION_ORDER.slice(0,ri).forEach(p=>seats[p]="fold");
    seats[raiser]="raise";
    ACTION_ORDER.slice(ri+1,hi).forEach(p=>seats[p]="fold");
    const def=VS_RAISE[BUCKET(raiser)];
    ranges={raise:def.raise,call:def.call[HERO_CTX(heroPos)]};
    options=[{k:"raise",l:"3-бет",c:"primary"},{k:"call",l:"Колл",c:"mid"},{k:"fold",l:"Фолд",c:"ghost"}];
    prompt=`Рейз 3bb з ${raiser}. Ти на ${heroPos}.`; potBB=4.5; explainExtra=def.note;
  } else {
    const hi=force?Math.min(6,ACTION_ORDER.indexOf(force.heroPos)):Math.floor(Math.random()*7);
    heroPos=ACTION_ORDER[hi];
    const ti=hi+1+Math.floor(Math.random()*(8-hi)),tb=ACTION_ORDER[ti];
    ACTION_ORDER.slice(0,hi).forEach(p=>seats[p]="fold");
    seats[heroPos]="raise";
    ACTION_ORDER.slice(hi+1,ti).forEach(p=>seats[p]="fold");
    seats[tb]="3bet";
    ranges={raise:VS_3BET.raise,call:VS_3BET.call};
    options=[{k:"raise",l:"4-бет",c:"primary"},{k:"call",l:"Колл",c:"mid"},{k:"fold",l:"Фолд",c:"ghost"}];
    prompt=`Ти відкрив з ${heroPos}, ${tb} поставив 3-бет 10bb.`; potBB=14.5; explainExtra=VS_3BET.note;
  }

  const relevant=[...union(ranges.raise,ranges.call,TEMPTING)];
  let hand,isControl=false;
  if(force&&force.hand){
    hand=force.hand;
  } else if(force){
    /* контрольна рука: та сама позиція, але НЕ з пулу помилок */
    isControl=true;
    const ban=new Set(force.ban||[]);
    const cand=relevant.filter(h=>!ban.has(h));
    hand=pick(cand.length?cand:relevant);
  } else {
    const missedKeys=Object.keys(P.missed).filter(k=>P.missed[k]>0&&k.startsWith(scen+"|"));
    const r=Math.random();
    if(missedKeys.length>=4&&r<0.25) hand=pick(missedKeys).split("|")[2];
    else hand=r<0.70?pick(relevant):pick(WEIGHTED);
  }

  const correct=ranges.raise.has(hand)?"raise":(ranges.call.has(hand)?"call":"fold");
  return {scen,heroPos,seats,ranges,options,prompt,potBB,correct,hand,
    cards:dealFromHand(hand),explainExtra,drill:!!force,isControl};
}