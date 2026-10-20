const assert=require('node:assert/strict'),C=require('../src/wind-colors.js');
for(const preset of C.presets){const scale=C.validate(preset),map=C.mapper(scale);assert.ok(scale.nodes.length>=2);for(let speed=0;speed<=300;speed++)assert.ok(map(speed).every(v=>Number.isInteger(v)&&v>=0&&v<=255));assert.deepEqual(C.validate(JSON.parse(JSON.stringify(scale))),scale);}
const scale={name:'Test',unit:'kt',nodes:[{value:0,color:'#000000'},{value:100,color:'#ffffff'}]};
assert.deepEqual(C.mapper(scale)(50),[128,128,128]);assert.deepEqual(C.mapper(scale)(-1),[0,0,0]);assert.deepEqual(C.mapper(scale)(300),[255,255,255]);
assert.deepEqual(C.mapper({...scale,interpolation:'step'})(99),[0,0,0]);
assert.deepEqual(C.mapper({...scale,nodes:[{value:0,color:'#000000'},{value:50,color:'#ff0000'},{value:50,color:'#0000ff'},{value:100,color:'#ffffff'}]})(50),[0,0,255]);
for(const raw of [{...scale,unit:'K'},{...scale,nodes:[{value:0,color:'bad'},{value:100,color:'#ffffff'}]},{...scale,nodes:[{value:NaN,color:'#ffffff'},{value:100,color:'#ffffff'}]},{...scale,nodes:[]},{...scale,nodes:[{value:1,color:'#000000'},{value:1,color:'#ffffff'}]}])assert.throws(()=>C.validate(raw));
const invalid=structuredClone(scale);invalid.nodes.push({value:0,color:'#111111'},{value:0,color:'#222222'});assert.throws(()=>C.validate(invalid));
console.log('PASS: six palettes, RGB interpolation, step mapping, duplicate-node jumps, endpoint clamping, JSON round trip and invalid configuration rejection.');
