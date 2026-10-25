const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),M=require('../src/model.js');
const context={console:{warn(){}}};vm.createContext(context);
vm.runInContext(fs.readFileSync(require.resolve('../three-vendor.min.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(require.resolve('../src/scenery.js'),'utf8'),context);
const T=context.THREE,scene=new T.Scene();let kt=55,sustained=55,seed=10;
const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const scenery=context.createWindScenery({T,scene,M,random,randomRange:(a,b)=>a+(b-a)*random(),sampleAt:()=>({sustained,gust:kt,ms:kt*M.KT,ve:kt*M.KT,vn:0})});
const huts=scene.children.filter(o=>o.children.some(c=>c.children.some(m=>m.geometry?.type==='BoxGeometry'))&&o.position.x===34);
assert.equal(huts.length,5);const roofs=huts.map(g=>g.children[3]);const poses=roofs.map(r=>r.position.clone());
kt=20;sustained=200;scenery.update(.1,1e6,0);assert.equal(scenery.stats().destroyed,0,'a lull below all thresholds does not damage objects despite high mean wind');
kt=130;sustained=20;scenery.update(1,3600,0);assert.ok(roofs.some((r,i)=>r.position.distanceTo(poses[i])>1),'full gust speed crosses the 120 kt shed threshold without the old 0.87 reduction');scenery.restore();
// Strong sustained exposure removes lightweight roofs; pause freezes flying pieces; restore repairs.
kt=180;scenery.update(.5,60,1);assert.equal(scenery.stats().destroyed,scenery.stats().total,'all registered props fail within one simulated minute above their thresholds by at least 20 kt');scenery.update(1,0,2);
assert.ok(roofs.some((r,i)=>r.position.distanceTo(poses[i])>1));
const moved=roofs.map(r=>r.position.clone());scenery.update(0,0,2);roofs.forEach((r,i)=>assert.equal(r.position.distanceTo(moved[i]),0));
scenery.restore();roofs.forEach((r,i)=>{assert.equal(r.position.distanceTo(poses[i]),0);assert.equal(Math.hypot(r.rotation.x,r.rotation.y,r.rotation.z),0);});
assert.equal(scenery.stats().destroyed,0);
console.log('PASS: five sheds, wind exposure, roof movement, paused debris and complete restoration in a real Three.js CPU scene.');
