const assert=require('node:assert/strict'),C=require('../src/camera.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
near(C.fov(1),58);assert.ok(C.fov(8)<8);near(Math.tan(C.fov(1)*Math.PI/360)/Math.tan(C.fov(4)*Math.PI/360),4);
assert.ok(C.fov(.35)>115&&C.fov(.35)<116);near(C.fov(0),C.fov(.35));near(C.fov(99),C.fov(12));assert.ok(C.fov(12)<6);near(C.bearing(1090),10);near(C.bearing(-1090),-10);
const init=()=>({freeCamera:true,freeX:0,freeY:20,freeZ:55,yaw:0,pitch:0,flightSpeed:35});
let s=init();C.move(s,new Set(['KeyW']),2);near(s.freeZ,-15);near(s.freeX,0);
s=init();C.move(s,new Set(['KeyW','KeyD']),2);near(Math.hypot(s.freeX,s.freeZ-55),70);
s=init();s.yaw=90;C.move(s,new Set(['KeyW']),2);near(s.freeX,70);near(s.freeZ,55);
for(const pitch of [-89,-60,0,60,89]){s=init();s.pitch=pitch;C.move(s,new Set(['KeyW']),2);near(s.freeY,20);near(s.freeZ,-15);}
s=init();C.move(s,new Set(['KeyE','ShiftLeft']),2);near(s.freeY,300);
C.move(s,new Set(['KeyQ','ShiftRight']),3);assert.ok(s.freeY<0,'flight has no altitude clamp');
const before={...s};C.move(s,new Set(['KeyW','KeyS']),2);assert.deepEqual(s,before);
s.freeCamera=false;const fixed={...s};C.move(s,new Set(['KeyW']),2);assert.deepEqual(s,fixed);
const site={x:0,z:55,east:0,north:0,ground:.9};s=init();s.floor=6;s.freeCamera=false;near(C.observer(s,site).y,18.9);
s.freeCamera=true;Object.assign(s,{freeX:1200,freeY:150,freeZ:-945});const o=C.observer(s,site);near(o.east,1.2);near(o.north,1);near(o.y,150);
console.log('PASS: optical FOV, full heading wrap, independent flight axes, normalized diagonal speed, altitude freedom, building/flight coordinates.');
