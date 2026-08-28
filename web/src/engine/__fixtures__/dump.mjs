import fs from 'node:fs'
const core = fs.readFileSync(process.argv[2], 'utf8')
const mod = new Function(core + `
  return {RANKS,RFI,ISO,VS_RAISE,VS_3BET,WEAK_O,TEMPTING,TIGHTER2,ALL_HANDS,WEIGHTED,pct,combos,parseToken,union,handAt};
`)()
const {RFI,ISO,VS_RAISE,VS_3BET,WEAK_O,TEMPTING,ALL_HANDS,WEIGHTED,pct,parseToken,union} = mod

const sorted = s => [...s].sort()
const out = {}
out.rfi = {}
for (const p of ["UTG","UTG+1","MP","LJ","HJ","CO","BTN","SB"])
  out.rfi[p] = {n: RFI[p].size, pct: +pct(RFI[p]).toFixed(4), hands: sorted(RFI[p])}
out.iso = {}
for (const p of ["UTG","UTG+1","MP","LJ","HJ","CO","BTN","SB"])
  out.iso[p] = {n: ISO[p].size, pct: +pct(ISO[p]).toFixed(4), hands: sorted(ISO[p])}
out.vsRaise = {}
for (const b of ["EARLY","MID","LATE"]) {
  out.vsRaise[b] = {raise: sorted(VS_RAISE[b].raise), rpct: +pct(VS_RAISE[b].raise).toFixed(4), call: {}}
  for (const c of ["POS","SB","BB"])
    out.vsRaise[b].call[c] = {hands: sorted(VS_RAISE[b].call[c]), pct: +pct(VS_RAISE[b].call[c]).toFixed(4)}
}
out.vs3bet = {raise: sorted(VS_3BET.raise), call: sorted(VS_3BET.call),
              rpct:+pct(VS_3BET.raise).toFixed(4), cpct:+pct(VS_3BET.call).toFixed(4)}
out.weakO = sorted(WEAK_O)
out.tempting = {n: TEMPTING.size, hands: sorted(TEMPTING)}
out.allHandsN = ALL_HANDS.length
out.weightedN = WEIGHTED.length
out.tokens = {}
for (const t of ["66+","AA","22+","AKs","ATs+","A4s-A5s","K5s-K7s","A2o-A8o","T9s","QQ+","22-JJ","JJ-22","A2s-AKs","KTs+","98o","K8o-K9o","AQo+","A2o-A4o","55","JTs"])
  out.tokens[t] = parseToken(t)
out.unionRfiBtnTempting = union(RFI["BTN"], TEMPTING).size
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 2))
console.log('RFI sizes:', Object.entries(out.rfi).map(([k,v])=>`${k}=${v.n}/${v.pct}%`).join(' '))
console.log('ISO sizes:', Object.entries(out.iso).map(([k,v])=>`${k}=${v.n}/${v.pct}%`).join(' '))
console.log('vs3bet:', out.vs3bet.raise, out.vs3bet.call)
console.log('ALL_HANDS:', out.allHandsN, 'WEIGHTED:', out.weightedN)
