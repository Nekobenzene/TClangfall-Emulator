const assert=require('node:assert/strict'),M=require('../src/model.js');
for(const volume of [.025,.1,.65]){
  assert.ok(M.floatingMotion(170,volume,2).speed>M.floatingMotion(50,volume,2).speed);
  assert.equal(M.floatingMotion(0,volume,2).speed,0);
  assert.equal(M.floatingMotion(170,volume,0).afloat,false);
  assert.equal(M.floatingMotion(170,volume,0).speed,0);
}
const light=M.floatingMotion(120,.025,2),large=M.floatingMotion(120,.65,2);
assert.ok(light.speed>large.speed);assert.ok(light.response<large.response);assert.ok(light.draft<large.draft);
assert.ok(M.floatingMotion(120,.025,.13).afloat);assert.equal(M.floatingMotion(120,.65,.13).afloat,false);
assert.ok(M.floatingMotion(120,.025,.12).speed<light.speed);
// Real Three.js scene: litter appears after inundation, moves, freezes on pause and strands on dry land.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),context={console:{warn(){}}};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../three-vendor.min.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/flood-debris.js'),'utf8'),context);
const T=context.THREE,scene=new T.Scene(),floats=context.createFloodDebris({T,scene,M}),wind={ve:-40,vn:10};
floats.addObstacle(-35,-19,42,34);
floats.update(.1,1,0,wind);assert.equal(floats.stats().visible,0);
floats.update(.1,1,1.5,wind);const floodedCount=floats.stats().afloat;assert.ok(floodedCount>50);
const matrices=()=>scene.children.map(mesh=>Array.from(mesh.instanceMatrix.array));
const before=matrices();floats.update(0,1,1.5,wind);assert.deepEqual(matrices(),before);
floats.update(.5,1.5,1.5,wind);assert.notDeepEqual(matrices(),before);
floats.update(.1,2,0,wind);assert.ok(floats.stats().afloat<floodedCount);assert.ok(floats.stats().stranded>0);
floats.reset();assert.equal(floats.stats().visible,0);assert.ok(scene.children.every(mesh=>mesh.count===0));
console.log('PASS: surface drift follows wind strength and volume; larger objects accelerate slowly, require deeper water and strand when shallow.');
