const assert=require('node:assert/strict'),S=require('../src/sliders.js');
for(const [value,position]of [[1,0],[10,1000/3],[100,2000/3],[1000,1000]]){
 assert.ok(Math.abs(S.timeToSlider(value)-position)<1e-8);assert.equal(S.timeFromSlider(position),value);
}
for(let value=1;value<=1000;value++)assert.equal(S.timeFromSlider(S.timeToSlider(value)),value);
assert.equal(S.timeFromSlider(-1),1);assert.equal(S.timeFromSlider(1100),1000);
assert.deepEqual(S.ticks('floorRange',1,40).map(t=>t.label),['1F','21F','40F']);
assert.equal(S.ticks('wallRadiusRange',19,240)[0].label,'19km');
for(const id of ['extentRange','largeExtentRange','timeScaleRange','eastRange','intensity']){
 const ticks=S.ticks(id,id==='eastRange'?-1600:id==='intensity'?20:0,id==='eastRange'?1600:id==='intensity'?200:1000);
 assert.equal(ticks[0].position,0);assert.equal(ticks.at(-1).position,100);assert.ok(ticks.every((t,i)=>!i||t.position>ticks[i-1].position));
}
console.log('PASS: 1–1000 logarithmic multiplier, all integer round trips, ruler endpoints and dynamic bounds.');
