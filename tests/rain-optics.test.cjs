const assert=require('node:assert/strict'),M=require('../src/model.js');
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
// A change in drop size changes concentration, never the supplied rain-water flux.
for(const rate of [0,.1,10,50,200,500])for(const kt of [0,65,80,95,110,200]){
 const o=M.rainOptics(kt,rate);near(o.liquidWater*o.fallSpeed*3.6,rate);
 assert.ok(o.extinction>=0&&Number.isFinite(o.numberDensity));
 assert.ok(o.fallSpeed>0&&o.fallSpeed<9.65);
}
const base=M.rainOptics(65,50);let previous=base;
for(let kt=66;kt<=110;kt++){
 const o=M.rainOptics(kt,50);assert.ok(o.diameter<previous.diameter);assert.ok(o.numberDensity>previous.numberDensity);assert.ok(o.extinction>previous.extinction);previous=o;
 const a=M.visuals(kt-1,50),b=M.visuals(kt,50);assert.ok(b.rainDensity>a.rainDensity&&b.rainTrail<a.rainTrail);
}
assert.ok(previous.numberDensity>base.numberDensity*100);
assert.equal(M.visuals(110,50).mistMix,1);
// Heavy-rain curtains exist without high winds; they settle, and drift more slowly than drops.
const curtain=M.visuals(20,120);assert.ok(curtain.mistOpacity>.5);assert.ok(curtain.curtainFall>1);assert.ok(curtain.curtainDrift<.6);
assert.equal(M.visuals(150,0).mistOpacity,0);
// Dry air has no wind-only visibility penalty; changing the spectrum affects wet visibility.
for(const kt of [20,65,110,190])near(M.sample(M.structure({},kt).rmw,0,kt,{rainStrength:0}).visibility,11000);
const wet=k=>M.sample(M.structure({},k).rmw,0,k,{rainStrength:100},0).visibility;
assert.ok(wet(110)<wet(65));
// Mature dry eyes last to the inner cloud-wall footprint, including custom-sized eyes.
for(const eyeRadius of [3,15,60])for(const intensity of [150,180,200]){
 const cfg=M.structure({eyeRadius,wallRadius:eyeRadius+25},intensity),at=r=>M.sample(r,0,intensity,cfg,0).rain;
 near(at(eyeRadius*.99),0);near(at(eyeRadius),0);assert.ok(at(eyeRadius+1.5)>60);
 assert.ok(at(eyeRadius+.2)<at(eyeRadius+.7)&&at(eyeRadius+.7)<at(eyeRadius+1.2));
}
assert.ok(M.sample(0,0,80,{}).rain>10);
// Peak joins smoothly, while no artificial kink is imposed at mapped rain-circle edges.
for(const intensity of [30,80,130,190]){
 const cfg=M.structure({},intensity),v=r=>M.meanWind(r,0,intensity,cfg).sustained;
 for(const r of [cfg.rmw,cfg.wallRadius,cfg.stormRadius,cfg.influenceRadius]){
  const h=.001,left=(v(r)-v(r-h))/h,right=(v(r+h)-v(r))/h;
  assert.ok(Math.abs(left-right)<.02,`wind slope kink at ${r} km`);
 }
 const nearPeak=(v(cfg.rmw+5)-v(cfg.rmw+15))/10,tail=(v(180)-v(240))/60;
 assert.ok(nearPeak>tail);
}
console.log('PASS: conserved rain flux, finer/denser 65–110 kt transition, low-wind rain curtains, extinction-based visibility, dry mature eye to inner wall, smooth long-tail radial wind.');
