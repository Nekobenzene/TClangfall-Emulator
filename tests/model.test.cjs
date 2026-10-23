const assert=require('node:assert/strict'),M=require('../src/model.js');
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
for(const intensity of [20,33,34,66,67,100,180,200])for(const eyeRadius of [5,15,50]){
  const cfg=M.structure({eyeRadius,wallRadius:eyeRadius+25,influenceRadius:eyeRadius+260},intensity),peak=M.sample(cfg.rmw,0,intensity,cfg),centre=M.sample(0,0,intensity,cfg);
  near(peak.sustained,intensity);near(centre.sustained,0);assert.equal(centre.bearing,null);near(peak.meanMs,intensity*M.KT);
  assert.equal(cfg.hasEye,intensity>=67);assert.equal(cfg.hasStorm,intensity>=34);
  if(intensity<67){assert.ok(!['eye','wall'].includes(centre.region));assert.ok(centre.rain>10);}
  if(intensity<34)assert.notEqual(centre.region,'storm');
  let previous=0;for(let r=0;r<cfg.rmw;r+=.3){let v=M.meanWind(r,0,intensity,cfg).sustained;assert.ok(v>=previous-1e-8&&v<=intensity+1e-8);previous=v;}
  previous=intensity;for(let r=cfg.rmw;r<cfg.influenceRadius+2;r+=.3){let v=M.meanWind(r,0,intensity,cfg).sustained;assert.ok(v<=previous+1e-8);previous=v;}
  for(const r of [cfg.rmw,cfg.wallRadius,cfg.stormRadius,cfg.influenceRadius])for(const t of [0,1.8,6.9]){const a=M.sample(r-.00001,0,intensity,cfg,t),b=M.sample(r+.00001,0,intensity,cfg,t);assert.ok(Math.abs(a.sustained-b.sustained)<.001);assert.ok(Math.abs(a.rain-b.rain)<.01);assert.ok(Math.abs(a.gust-b.gust)<.001);}
}
for(let h=0;h<360;h+=30){const cfg=M.structure({heading:h,motionSpeed:25},110),a=h*Math.PI/180,r=cfg.rmw,danger=M.sample(-Math.cos(a)*r,Math.sin(a)*r,110,cfg),safe=M.sample(Math.cos(a)*r,-Math.sin(a)*r,110,cfg);assert.equal(danger.semicircle,'danger');assert.equal(safe.semicircle,'safe');assert.ok(danger.sustained>safe.sustained);}
assert.equal(M.sample(0,0,190,{}).sunshine,1);assert.equal(M.sample(28,0,190,{}).sunshine,0);assert.ok(M.sample(0,0,80,{}).rain>1);
const outside=M.sample(300,0,180,{});assert.ok(outside.ms>0&&outside.sustained<12);assert.equal(outside.rain,0);assert.equal(outside.region,'clear');assert.ok(outside.sunshine>=.9);
// The mapped quantity is exactly the stationary mean, independent of random squalls and rain setting.
for(const intensity of [30,60,100,190])for(const r of [1,20,70,190,260]){const f=M.meanWind(r,30,intensity,{},8),w=M.sample(r,30,intensity,{},8);near(f.sustained,w.sustained);near(w.ms,w.gust*M.KT);near(M.meanWind(r,30,intensity,{rainStrength:0},8).sustained,f.sustained);}
const anisotropy=k=>{const r=M.structure({},k).rmw*.6,a=M.meanWind(r,0,k,{}).sustained,b=M.meanWind(-r,0,k,{}).sustained;return Math.abs(a-b)/k;};assert.ok(anisotropy(190)<anisotropy(70)*.15);
const c=M.structure({}),w=r=>M.sample(r,0,130,{}),steep=(w(c.rmw).sustained-w(c.wallRadius).sustained)/(c.wallRadius-c.rmw),gentle=(w(c.wallRadius).sustained-w(c.stormRadius).sustained)/(c.stormRadius-c.wallRadius);assert.ok(steep>gentle*2);
const series=r=>Array.from({length:8000},(_,i)=>M.sample(r,0,130,{},i*.2));
const inner=series(70),nearOuter=series(150),outer=series(190),far=series(220),edgeIn=series(259.99),edgeOut=series(260.01);
const frequency=(a,key,threshold)=>a.filter(x=>x[key]>threshold).length/a.length;
assert.ok(frequency(nearOuter,'pulse',.1)>frequency(outer,'pulse',.1));assert.ok(frequency(outer,'pulse',.1)>frequency(far,'pulse',.1));
assert.ok(frequency(nearOuter,'rain',1)>frequency(outer,'rain',1));assert.ok(frequency(outer,'rain',1)>frequency(far,'rain',1));
near(frequency(edgeIn,'pulse',.1),frequency(edgeOut,'pulse',.1),.001);assert.ok(frequency(edgeIn,'rain',1)<.002);assert.equal(frequency(edgeOut,'rain',1),0);
const edge1=M.sample(259.99,0,130,{}),edge2=M.sample(260.01,0,130,{});assert.ok(Math.abs(edge1.gustEventChance-edge2.gustEventChance)<1e-6);assert.ok(edge1.rainEventChance<1e-10&&edge2.rainEventChance===0);
const spread=a=>(Math.max(...a.map(x=>x.gust))-Math.min(...a.map(x=>x.gust)))/a[0].sustained;assert.ok(spread(inner)<spread(nearOuter)&&spread(nearOuter)<spread(outer));
const rare=frequency(outer,'rain',150);assert.ok(rare>0&&rare<.03);assert.ok(Math.max(...outer.map(x=>x.rain))>w(c.rmw).rain*2);assert.ok(Math.min(...outer.map(x=>x.visibility))<1000);assert.ok(outer.some(x=>x.sunshine>.65&&x.rain<1));
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length,rs=outer.map(x=>x.rain),gs=outer.map(x=>x.gust),ma=avg(rs),mb=avg(gs),corr=rs.reduce((s,x,i)=>s+(x-ma)*(gs[i]-mb),0)/Math.sqrt(rs.reduce((s,x)=>s+(x-ma)**2,0)*gs.reduce((s,x)=>s+(x-mb)**2,0));assert.ok(corr>.25&&corr<.98);
const rainAt=(r,f)=>M.sample(r,0,130,{rainStrength:f},5).rain;near(rainAt(70,50)/rainAt(70,100),.5);near(rainAt(70,0),0);assert.ok(rainAt(190,50)/rainAt(190,100)>.8);
const weak=M.visuals(45,20),normal=M.visuals(100,80),strong=M.visuals(180,100);assert.ok(strong.debrisCount>normal.debrisCount*3&&weak.debrisCount<5);assert.ok(M.visuals(150,80).treeBend>M.visuals(100,80).treeBend*4);assert.equal(M.visuals(65,80).mistMix,0);assert.equal(M.visuals(110,80).mistMix,1);
assert.ok(M.debrisMotion(80,.2).active&&!M.debrisMotion(80,.9).active);for(const k of [120,180,200]){const light=M.debrisMotion(k,.2),medium=M.debrisMotion(k,.6),heavy=M.debrisMotion(k,.9);assert.ok(light.speed>medium.speed&&medium.speed>heavy.speed);assert.ok(light.height>medium.height&&medium.height>heavy.height);}
assert.equal(M.surge(0),0);near(M.surge(170),3);assert.ok(M.surge(200)<4.5);assert.equal(M.surge(250),4.5);assert.ok(M.surgeResponse(170)>40);assert.ok(M.surgeResponse(185,false)>M.surgeResponse(185));
// Formation is continuous in intensity, including customized dormant geometry.
for(const options of [{},{eyeRadius:35,wallRadius:65,stormRadius:55},{eyeRadius:5,wallRadius:15,stormRadius:180}]){
  for(const k of [67,100,110,145,150,180])for(const r of [0,4,12,20,28,40,55,80,110,200]){
    const a=M.sample(r,0,k-.0001,options,3),b=M.sample(r,0,k+.0001,options,3);
    for(const key of ['sustained','rain','sunshine'])assert.ok(Math.abs(a[key]-b[key])<.005,`${key} discontinuity at ${k} kt, ${r} km`);
  }
}
assert.equal(M.structure({},67).eyeDevelopment,0);assert.equal(M.structure({},110).eyeDevelopment,1);
assert.ok(M.sample(0,0,90,{}).rain>1);assert.ok(M.sample(0,0,100,{}).rain<.1);
assert.equal(M.sample(0,0,145,{}).sunshine,0);assert.ok(M.sample(0,0,150,{}).sunshine>.01);assert.ok(M.sample(0,0,150,{}).sunshine<.15);
// Strong-system storm-circle rain is almost uniform, then rises over a narrow wall ramp.
const rainfall=(r,k=130)=>M.sample(r,0,k,{},0).rain;
assert.ok(rainfall(45)/rainfall(105)<1.13);assert.ok(rainfall(34)>rainfall(40)*2);
near(rainfall(20),rainfall(28));near(rainfall(28),rainfall(33));
assert.ok(rainfall(20,60)/rainfall(100,60)>1.8);
const corrected=M.structure({eyeRadius:100,wallRadius:10,stormRadius:4,influenceRadius:5},110);assert.ok(corrected.eyeRadius<corrected.rmw&&corrected.rmw<corrected.wallRadius&&corrected.wallRadius<corrected.stormRadius&&corrected.stormRadius<corrected.influenceRadius);
console.log('PASS: continuous eye/eyewall formation and clearing, flat storm rain and eyewall plateau, stronger weak-system rain gradient, 170 kt = 3 m slow surge, plus previous wind, boundary, squall, debris and rain controls.');
