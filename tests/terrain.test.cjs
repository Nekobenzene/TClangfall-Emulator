const assert=require('node:assert/strict'),M=require('../src/model.js');
// Each terrace must remain dry below its own elevation, regardless of lower terraces flooding.
for(const terrace of M.coastTerraces){
  assert.equal(M.coastalHeight(terrace.x),terrace.height);
  assert.equal(M.floodDepth(terrace.x,terrace.height-.01),0);
  assert.ok(Math.abs(M.floodDepth(terrace.x,terrace.height+.3)-.3)<1e-8);
}
assert.ok(M.floodDepth(14,.7)>0);assert.equal(M.floodDepth(-30,.7),0);
assert.ok(M.floodDepth(-30,1.1)>0);assert.equal(M.floodDepth(-85,1.1),0);
assert.ok(M.floodDepth(-145,3)>0);assert.equal(M.floodDepth(-230,4.5),0);
// The water boundary must come from terrain intersection and remain connected to the sea.
let previous=Infinity;
for(const level of [0,.1,.4,.7,1.1,2,3,4.5]){
  const edge=M.waterEdge(level);assert.ok(edge<previous);previous=edge;
  assert.ok(Math.abs(M.coastalHeight(edge)-level)<1e-8);
  for(let x=-250;x<80;x+=.7)assert.equal(M.floodDepth(x,level)>0,x>edge);
}
// Inland terrain rises monotonically, including short connecting slopes.
for(let x=-300;x<80;x+=.1)assert.ok(M.coastalHeight(x)>=M.coastalHeight(x+.1)-1e-10);
console.log('PASS: fixed terrain elevations, staged inundation, dry high ground, connected terrain-derived shoreline and depth.');
