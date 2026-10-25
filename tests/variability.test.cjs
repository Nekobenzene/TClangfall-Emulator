const assert=require('node:assert/strict'),M=require('../src/model.js'),Sound=require('../src/sound.js');
const near=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const widths={gust:[.02,.10,.25],stormGust:[.03,.12,.25],stormRain:[.02,.08,.15],wallRain:[.01,.04,.08]};
const process=M.createVariability(17),counts={},logs={},tails={};
for(const key of Object.keys(widths)){counts[key]=[0,0,0];logs[key]=[];tails[key]={run:0,total:0,count:0,max:0};}
const n=1000000,step=.1;
for(let i=0;i<n;i++){
 const sample=process.advance(step);
 for(const [key,bands] of Object.entries(widths)){
  const x=Math.log(sample[key]);if(i<100000)logs[key].push(x);
  bands.forEach((p,j)=>{if(Math.abs(x)<=Math.log1p(p))counts[key][j]++;});
  const tail=tails[key];
  if(Math.abs(x)>Math.log1p(bands[2]))tail.run+=step;
  else if(tail.run){tail.total+=tail.run;tail.count++;tail.max=Math.max(tail.max,tail.run);tail.run=0;}
 }
}
const correlation=(a,lag)=>{
 const mean=a.reduce((s,x)=>s+x,0)/a.length,variance=a.reduce((s,x)=>s+(x-mean)**2,0)/a.length;
 return a.slice(lag).reduce((s,x,i)=>s+(x-mean)*(a[i]-mean),0)/(a.length-lag)/variance;
};
for(const [key,bands] of Object.entries(widths)){
 counts[key].forEach((count,i)=>near(count/n,[.05,.50,.95][i],.008));
 const a=logs[key];near(a.reduce((s,x)=>s+x,0)/a.length,0,.007);
 assert(correlation(a,100)>.15&&correlation(a,100)<.55,'roughly ten real seconds of memory: '+key);
 assert(Math.abs(correlation(a,1000))<.13,'no repeating long cycle: '+key);
 assert(tails[key].total/tails[key].count<1.4,'extremes are brief excursions: '+key);
 console.log(key,{coverage:counts[key].map(c=>c/n),tailSeconds:tails[key].total/tails[key].count});
}
// The clock can be partitioned arbitrarily; pause consumes no RNG or process time.
const large=M.createVariability(518),small=M.createVariability(518),before=small.snapshot();
assert.deepEqual(small.advance(0),before);
for(let i=0;i<12000;i++)small.advance(.01);
const after=large.advance(120);
for(const key of Object.keys(widths))near(small.snapshot()[key],after[key],1e-8);
assert.notDeepEqual(M.createVariability(519).advance(120),after);
// A finite log speed guarantees continuous paths, including density boundaries.
const fine=M.createVariability(984);let last=fine.snapshot();
for(let i=0;i<30000;i++){
 const next=fine.advance(.01);
 for(const [key,bands] of Object.entries(widths))assert(Math.abs(Math.log(next[key]/last[key]))<=Math.log1p(bands[2])/3*1.45*.01+1e-12);
 last=next;
}
const draw={gust:1.25,stormRain:1.15,wallRain:1.08};
const regionDraw={...draw,gust:.9,stormGust:1.2};
near(M.sample(70,0,170,{},0,regionDraw).gustRatio,1.2);
near(M.sample(28,0,170,{},0,regionDraw).gustRatio,.9);
near(M.sample(180,0,170,{},0,regionDraw).gustRatio,.9);
for(const radius of [33,36,40,110,167]){
 const a=M.sample(radius-.000001,0,170,{},0,regionDraw),b=M.sample(radius+.000001,0,170,{},0,regionDraw);
 for(const key of ['sustained','gust','meanRain','rain'])assert(Math.abs(a[key]-b[key])<.001,'continuous storm background and variability at '+radius+' for '+key);
}
const background=[40,55,70,90,110].map(r=>M.sample(r,0,170,{},0));
for(let i=1;i<background.length;i++)assert(background[i].backgroundWeight<background[i-1].backgroundWeight);
near(background.at(-1).backgroundWeight,0);
assert(background.at(-1).rain>28&&background.at(-1).rain<30,'storm rain floor is raised');
for(const [radius,factor] of [[70,1.15],[28,1.08]]){
 const w=M.sample(radius,0,170,{},0,draw),mean=M.sample(radius,0,170,{},0);
 near(w.gust/w.sustained,1.25);near(w.rain/mean.rain,factor);near(w.meanRain,mean.rain);
 near(w.ms,w.gust*M.KT);near(Math.hypot(w.ve,w.vn),w.ms);
}
for(const radius of [33,40,110,167]){
 const a=M.sample(radius-.000001,0,170,{},2,draw),b=M.sample(radius+.000001,0,170,{},2,draw);
 assert(Math.abs(a.rain-b.rain)<.001,'rain distributions blend across region boundaries');
}
assert.equal(M.sample(0,0,190,{},2,draw).rain,0);
assert.equal(M.sample(70,0,170,{rainStrength:0},2,draw).rain,0);
// The deliberately nonlinear response leaves ordinary gusts restrained.
const weather=ratio=>({sustained:160,gust:160*ratio,ms:160*ratio*M.KT,rain:65});
near(M.gustResponse(weather(1)).frequency,1);
near(M.gustResponse(weather(1.25)).frequency,2);near(M.gustResponse(weather(1.25)).speed,1.3);
assert(M.gustResponse(weather(1.15)).burst<.1);
const rising={...weather(1.03),gustRiseRate:3.2},falling={...rising,gustRiseRate:-3.2};
assert(M.gustResponse(rising).rise>.8,'sensitive response before reaching a gust crest');
near(M.gustResponse(falling).rise,0);near(M.gustResponse({...falling,gustRiseRate:0}).rise,0);
assert(M.weatherVisuals(rising).rainOpacity>M.weatherVisuals(falling).rainOpacity);
const risingSound=Sound.profile(rising,M),fallingSound=Sound.profile(falling,M);
near(risingSound.whistleFrequency,fallingSound.whistleFrequency);
assert(risingSound.whistleBoost>fallingSound.whistleBoost);
assert(Sound.profile(weather(1.25),M).whistleFrequency>Sound.profile(weather(1.03),M).whistleFrequency);
near(Sound.profile(weather(1.25),M).whistleFrequency,1.05*1260);
let visualRise=0;
for(let i=0;i<60;i++)visualRise=M.advanceGustVisualRise(visualRise,rising,1/60);
const beforeTurn=visualRise;
visualRise=M.advanceGustVisualRise(visualRise,falling,1/60);
assert(visualRise>beforeTurn*.96&&visualRise<beforeTurn,'visual rise releases continuously after a sharp reversal');
const visualBefore=M.weatherVisuals({...rising,gustVisualRise:beforeTurn});
const visualAfter=M.weatherVisuals({...falling,gustVisualRise:visualRise});
assert(Math.abs(visualAfter.rainOpacity-visualBefore.rainOpacity)<.012);
near(M.advanceGustVisualRise(visualRise,falling,0),visualRise);
let partitioned=visualRise;
for(let i=0;i<60;i++)partitioned=M.advanceGustVisualRise(partitioned,falling,1/60);
near(partitioned,M.advanceGustVisualRise(visualRise,falling,1),1e-10);
const calm=M.gustResponse({...weather(1.25),sustained:40,gust:50});near(calm.speed,1);
const base=M.visuals(170,65),crest=M.weatherVisuals({...weather(1.25),sustained:170,gust:200});
assert(crest.gustSpeed>1);assert(crest.rainFall>base.rainFall);
const regular=Sound.profile(weather(1),M),peak=Sound.profile(weather(1.25),M);
near(peak.kt,200);assert(peak.windLevel>regular.windLevel);near(peak.whistleBoost,4);
const normalVisual=M.weatherVisuals(weather(1)),peakVisual=M.weatherVisuals(weather(1.25));
near(peakVisual.rainOpacity,1.35);assert(peakVisual.rainDensity>normalVisual.rainDensity);
near(M.visibility({rain:65,gust:170,sustained:40}),276.34,1);
near(M.visibility({rain:65,gust:200,sustained:40}),250,1);
near(M.visibility({rain:0,gust:250,sustained:40}),11000);
assert(M.visibility({rain:75,gust:170,sustained:40})<M.visibility({rain:65,gust:170,sustained:40}),'visibility follows instantaneous rain at unchanged gust');
const lowGust=M.sample(28,0,170,{},0,{...draw,gust:.8}),highGust=M.sample(28,0,170,{},0,draw);
assert(highGust.visibility<lowGust.visibility,'optical extinction uses gusts even at unchanged sustained wind and rain');
near(peak.speed,Math.hypot(weather(1.25).ms*M.weatherVisuals(weather(1.25)).rainSpeed,M.weatherVisuals(weather(1.25)).rainFall));
assert(Sound.profile({...weather(1),rain:80},M).rainLevel>regular.rainLevel);
console.log('PASS: stationary logarithmic coverage, brief tails, continuous nonperiodic paths, frame-independent real clock, regional rain and instantaneous sound/crest response.');
