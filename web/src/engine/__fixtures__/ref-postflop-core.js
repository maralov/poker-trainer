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

function hasStraight(rset){
  const s=new Set(rset); if(s.has(14)) s.add(1);
  for(let lo=1;lo<=10;lo++){let ok=true;for(let k=0;k<5;k++)if(!s.has(lo+k)){ok=false;break;}if(ok)return lo;}
  return 0;
}
function straightDraw(all,holeVals){
  const rset=all.map(c=>c.v); let outs=0;
  for(let r=2;r<=14;r++){
    if(rset.includes(r)) continue;
    const lo=hasStraight(rset.concat([r])); if(!lo) continue;
    const win=[];for(let k=0;k<5;k++)win.push(lo+k);
    const hv=holeVals.map(v=>v===14?[14,1]:[v]).flat();
    if(hv.some(v=>win.includes(v))) outs++;
  }
  return outs>=2?"oesd":(outs===1?"gutshot":null);
}
function evaluate(hole,board){
  const all=hole.concat(board);
  const bv=board.map(c=>c.v).sort((a,b)=>b-a), hv=hole.map(c=>c.v).sort((a,b)=>b-a);
  const cnt={}; all.forEach(c=>cnt[c.v]=(cnt[c.v]||0)+1);
  const suitCnt={}; all.forEach(c=>suitCnt[c.s]=(suitCnt[c.s]||0)+1);
  const holeSuits=hole.map(c=>c.s);
  const flushMade=Object.keys(suitCnt).some(s=>suitCnt[s]>=5);
  const straightMade=!!hasStraight(all.map(c=>c.v));
  const isPocket=hv[0]===hv[1];
  let made=null,label="";
  if(flushMade){made="STRONG";label="флеш";}
  else if(straightMade){made="STRONG";label="стріт";}
  else if(isPocket&&bv.includes(hv[0])){made="STRONG";label="сет";}
  else if(!isPocket&&(cnt[hv[0]]===3||cnt[hv[1]]===3)){made="STRONG";label="трипс";}
  else if(!isPocket&&bv.includes(hv[0])&&bv.includes(hv[1])){made="STRONG";label="дві пари";}
  else if(isPocket){
    if(hv[0]>bv[0]){made="STRONG";label="оверпара";}
    else if(hv[0]>bv[1]){made="MEDIUM";label="середня кишенькова пара";}
    else{made="WEAK";label="андерпара";}
  } else {
    const m=bv.includes(hv[0])?hv[0]:(bv.includes(hv[1])?hv[1]:null);
    if(m===null){made=null;label="без пари";}
    else{
      const kicker=(m===hv[0])?hv[1]:hv[0];
      if(m===bv[0]){ if(kicker>=10){made="STRONG";label="топ-пара, сильний кікер";}
                     else{made="MEDIUM";label="топ-пара, слабкий кікер";} }
      else if(m===bv[1]){made="MEDIUM";label="друга пара";}
      else{made="WEAK";label="третя пара";}
    }
  }
  const fd=Object.keys(suitCnt).find(s=>suitCnt[s]===4&&holeSuits.includes(+s));
  const bd=Object.keys(suitCnt).find(s=>suitCnt[s]===3&&holeSuits.includes(+s));
  const sd=straightDraw(all,hv);
  const over=!made&&hv[0]>bv[0]&&hv[1]>bv[0];
  const dl=[];
  if(fd&&!flushMade) dl.push("флеш-дро");
  if(sd==="oesd") dl.push("двосторонній стріт-дро");
  if(sd==="gutshot") dl.push("гатшот");
  if(!fd&&bd&&!dl.length) dl.push("беквдор-флеш");
  let cat;
  if(made==="STRONG") cat="STRONG";
  else if((fd&&!flushMade)||sd==="oesd") cat=made==="MEDIUM"?"STRONG":"DRAW";
  else if(made==="MEDIUM") cat="MEDIUM";
  else if(made==="WEAK") cat="WEAK";
  else if(sd==="gutshot"||over) cat="WEAKDRAW";
  else cat="AIR";
  let full=label;
  if(dl.length) full=(made?label+" + ":"")+dl.join(" + ");
  if(!made&&!dl.length) full=over?"дві оверкарти":"нічого";
  return {cat,label:full};
}
function texture(board){
  const v=board.map(c=>c.v).sort((a,b)=>b-a);
  if(v[0]===v[1]||v[1]===v[2]) return {t:"PAIRED",label:"спарена"};
  const su={}; board.forEach(c=>su[c.s]=(su[c.s]||0)+1);
  const mx=Math.max(...Object.values(su));
  let sc=0;
  if(mx===3) sc+=2; else if(mx===2) sc+=1;
  if(v[0]-v[1]<=2||v[1]-v[2]<=2) sc+=1;
  if(v[0]-v[2]<=4) sc+=1;
  return sc>=2?{t:"WET",label:"мокра"}:{t:"DRY",label:"суха"};
}
function decide(cat,tex,nOpp,ip){
  if(nOpp>=2){
    if(cat==="STRONG") return "b66";
    if(cat==="DRAW") return ip?"b66":"check";
    return "check";
  }
  if(cat==="STRONG"||cat==="DRAW") return tex==="WET"?"b66":"b33";
  if(cat==="MEDIUM") return tex==="WET"?"check":"b33";
  if(cat==="WEAK") return "check";
  if(tex==="WET") return "check";
  return ip?"b33":"check";
}