const assert=require('node:assert/strict'),M=require('../src/model.js');
// 170 kt storm translating at 30 kt: retain water throughout the eye and until >500 km away.
const memory={};
for(let t=0;t<3*3600;t+=30)M.advanceSurge(memory,{sustained:170,intensity:170,radius:28,simDt:30});
assert.ok(memory.level>2.9);const crest=memory.level;
for(let distance=0;distance<=500;distance+=1){
  M.advanceSurge(memory,{sustained:0,intensity:170,radius:distance,simDt:3600/(30*1.852)});
  assert.ok(memory.level>=crest-.00001,`premature recession at ${distance} km`);
}
assert.equal(memory.retained,true);
for(let t=0;t<7*3600;t+=30)M.advanceSurge(memory,{sustained:0,intensity:170,radius:900,simDt:30});
assert.equal(memory.level,0);
// A larger time multiplier advances both rising and falling water by the same simulated duration.
const simulate=(scale,seconds,initial,conditions)=>{const s={...initial};for(let t=0;t<seconds;t++)M.advanceSurge(s,{...conditions,simDt:scale});return s;};
const rise={sustained:170,intensity:170,radius:28},fall={sustained:0,intensity:170,radius:800};
const a=simulate(1,600,{},rise),b=simulate(60,10,{},rise);assert.ok(Math.abs(a.level-b.level)<1e-9);
const c=simulate(1,600,{level:3,crest:3,holdRadius:500},fall),d=simulate(60,10,{level:3,crest:3,holdRadius:500},fall);assert.ok(Math.abs(c.level-d.level)<1e-9);
const step60=simulate(60,1,{},rise),step1=simulate(1,1,{},rise);assert.ok(step60.level>step1.level*50);
for(const kind of Object.keys(M.damageKinds)){
  const threshold=M.damageKinds[kind].threshold;assert.equal(M.survivalTime(kind,threshold),Infinity);
  assert.ok(M.survivalTime(kind,200)<=M.survivalTime(kind,150));
  assert.equal(M.advanceDamage(0,kind,threshold,1e6),0);
  const times=[1,5,10,15,20,30].map(excess=>M.survivalTime(kind,threshold+excess,1.6));
  for(let i=1;i<times.length;i++)assert.ok(times[i]<times[i-1],'faster damage above threshold for '+kind);
  assert.ok(times[4]<=60,'all default resistances fail within a minute at +20 kt: '+kind);
  assert.ok(times[2]/times[4]>6,'damage accelerates sharply between +10 and +20 kt');
  assert.equal(M.advanceDamage(0,kind,threshold+20,60,1.6),1);
  assert.equal(M.advanceDamage(.25,kind,threshold+20,0,1.6),.25,'pause freezes damage');
  let incremental=0;for(let i=0;i<60;i++)incremental=M.advanceDamage(incremental,kind,threshold+10,1,1.6);
  assert.ok(Math.abs(incremental-M.advanceDamage(0,kind,threshold+10,60,1.6))<1e-12,'same simulated exposure at different time scales');
  const life=M.survivalTime(kind,170);let damage=M.advanceDamage(0,kind,170,life*.4);assert.ok(damage>.39&&damage<.41);
  damage=M.advanceDamage(damage,kind,170,life*.6);assert.equal(damage,1);
}
assert.ok(M.survivalTime('bin',170)<M.survivalTime('tree',170));
for(const [kind,threshold]of [['tree',145],['lamp',155],['window',160]]){
  assert.equal(M.damageKinds[kind].threshold,threshold);
  assert.equal(M.advanceDamage(0,kind,threshold-1,1e8),0);
  assert.ok(M.advanceDamage(0,kind,threshold+1,60)>0);
  assert.ok(M.survivalTime(kind,200)<M.survivalTime(kind,185));
  assert.ok(M.survivalTime(kind,185)<M.survivalTime(kind,170));
}
assert.ok(M.debrisSupply(-80,0)<M.debrisSupply(80,0)*.25);assert.ok(M.debrisSupply(80,0)<1);
console.log('PASS: 170 kt / 30 kt water retention through 500 km, eventual slow recession, time scaling of rise/fall, wind thresholds and exposure fatigue, and reduced onshore debris.');
