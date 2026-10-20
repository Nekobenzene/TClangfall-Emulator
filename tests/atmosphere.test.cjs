const assert=require('node:assert/strict'),A=require('../src/view-effects.js'),M=require('../src/model.js');
const rain={rain:150,sunshine:0,visibility:90},dry={rain:3,sunshine:0,visibility:6000},sun={rain:0,sunshine:1,visibility:12000};
const wetLook=A.sample(rain,false),clearLook=A.sample(rain,true),dryLook=A.sample(dry,false),sunLook=A.sample(sun,false);
assert.ok(clearLook.fogDensity<wetLook.fogDensity/100);assert.equal(clearLook.direct,wetLook.direct);assert.equal(clearLook.exposure,wetLook.exposure);
assert.deepEqual(rain,{rain:150,sunshine:0,visibility:90});
assert.ok(sunLook.direct>dryLook.direct&&dryLook.direct>wetLook.direct);assert.ok(sunLook.ambient>wetLook.ambient);assert.ok(sunLook.blue>wetLook.blue);
assert.ok(sunLook.shadows);assert.ok(!wetLook.shadows);
assert.equal(M.damageKinds.hut.threshold,120);assert.equal(M.advanceDamage(0,'hut',119,1e8),0);assert.ok(M.advanceDamage(0,'hut',130,600)>0);
console.log('PASS: display-only fog removal preserves weather and lighting; sunny and low-rain daylight, shadow gating, 120 kt shed threshold.');
