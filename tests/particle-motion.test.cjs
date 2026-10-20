const assert=require('node:assert/strict'),C=require('../src/camera.js');
const air={x:20,y:-32,z:-10};
let m=C.particleMotion(air,{x:4,y:1,z:-2},.1,.1);
assert.deepEqual([m.x,m.y,m.z],[-2,-4.2,1]);assert.deepEqual([m.vx,m.vy,m.vz],[-20,-42,10]);
// A moving particle volume must not carry the rain along with its camera anchor.
const camera={x:100,y:20,z:55},delta={x:15,y:-6,z:-9},local={x:1,y:2,z:3};
m=C.particleMotion(air,delta,.25,.25);
for(const axis of ['x','y','z'])assert.ok(Math.abs((camera[axis]+delta[axis]+local[axis]+m[axis])-(camera[axis]+local[axis]+air[axis]*.25))<1e-9);
m=C.particleMotion(air,{x:10,y:0,z:0},0,.5);assert.equal(m.x,-10,'paused weather stays fixed in world during flight');
m=C.particleMotion(air,{x:0,y:0,z:0},.5,.5);assert.deepEqual([m.x,m.y,m.z],[10,-16,-5]);
assert.equal(C.wrap(1065,-105,105),15);assert.equal(C.wrap(-1065,-105,105),-15);assert.ok(C.wrap(10000,1,57)>=1&&C.wrap(10000,1,57)<57);
console.log('PASS: relative particle velocity in all axes, world position conservation, paused-camera movement and multi-volume wrapping.');
