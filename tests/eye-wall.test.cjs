const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),E=require('../src/eye-wall.js');
const small=E.shape(180,10,22),large=E.shape(180,30,55),early=E.shape(150,15,40),strong=E.shape(185,15,40);
assert.equal(small.inner,10000);assert.equal(large.outer,55000);
assert.equal(E.shape(95,15,40).formation,0);assert.ok(E.shape(100,15,40).formation>0);assert.equal(early.formation,1);
assert.ok(strong.height>early.height&&strong.ragged<early.ragged);
for(let i=0;i<80;i++)for(let q=0;q<=1;q+=.1){const p=E.section(small,i/80*Math.PI*2,q);assert.ok(p.outer>p.inner&&Number.isFinite(p.y));}
const elevation=s=>Math.atan2(s.height,E.section(s,0,1).inner);
assert.ok(elevation(small)>elevation(large),'larger real-radius eyes have lower angular cloud walls');
assert.ok(E.intersects(strong,{x:0,y:20,z:0},{x:1,y:0.5,z:0}));
assert.ok(!E.intersects(strong,{x:0,y:20,z:0},{x:0,y:1,z:0}),'zenith remains open');
assert.ok(!E.intersects(strong,{x:0,y:20,z:0},{x:1,y:2,z:0}),'high sun can clear cloud top');
const context={console:{warn(){}}};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../three-vendor.min.js'),'utf8'),context);vm.runInContext(fs.readFileSync(require.resolve('../src/eye-wall.js'),'utf8'),context);
const T=context.THREE,scene=new T.Scene(),wall=context.createEyeWall(T,scene),haze=new T.Color('#aabbcc');
const state={intensity:180,eyeRadius:15,wallRadius:40,east:0,north:0,simTime:0,clearFog:false},weather={visibility:11000},observer={x:0,y:20,z:55,east:0,north:0};
wall.update(state,weather,observer,haze);assert.ok(wall.group.visible);assert.equal(wall.group.children.length,1,'continuous shell without sphere puffs');
const geometry=wall.group.children[0].geometry;state.east=1;state.north=2;wall.update(state,weather,observer,haze);assert.equal(wall.group.children[0].geometry,geometry,'translation does not rebuild geometry');assert.equal(wall.group.position.x,1000);assert.equal(wall.group.position.z,-1945);
state.eyeRadius=22;wall.update(state,weather,observer,haze);assert.notEqual(wall.group.children[0].geometry,geometry);
state.intensity=100;wall.update(state,weather,observer,haze);assert.ok(wall.group.visible,'wall already exists as the central rain stops');
state.intensity=180;state.east=300;wall.update(state,weather,observer,haze);assert.ok(!wall.group.visible,'outside sunny sky gets no observer-centred ring');
for(const radius of [15,20,40,80,110,300]){const env=E.environment(180,15,110,radius);assert.equal(env.wallVisibility,0,'inner wall hidden outside eye, including the boundary');}
assert.equal(E.environment(180,15,110,60).deck,1);assert.equal(E.environment(180,15,110,20).deck,1);assert.equal(E.environment(180,15,110,0).deck,0);assert.equal(E.environment(180,15,110,120).deck,0);
for(let v=100;v<=200;v++){const a=E.environment(v,15,110,0),b=E.environment(v+1,15,110,0);assert.ok(a.lowClouds>=b.lowClouds&&a.midClouds>=b.midClouds);if(v>=190)assert.equal(a.lowClouds+a.midClouds,0);}
assert.equal(E.environment(66,15,110,0).lowClouds,0);
state.east=0;state.north=0;state.eyeRadius=15;state.rmw=28;state.simTime=0;wall.update(state,weather,observer,haze);
const phase=wall.group.rotation.y;state.simTime=600;wall.update(state,weather,observer,haze);
assert.ok(Math.abs(wall.group.rotation.y-phase-E.angularSpeed(180,28)*600)<1e-10,'rotation uses simulated seconds and Vmax/RMW');
const paused=wall.group.rotation.y;state.intensity=185;wall.update(state,weather,observer,haze);assert.equal(wall.group.rotation.y,paused,'paused or strength edits do not jump cloud phase');
state.east=200;state.simTime+=60;wall.update(state,weather,observer,haze);assert.ok(wall.group.rotation.y>paused,'rotation continues while observer outside eye');
state.simTime+=5000;wall.update(state,weather,observer,haze);assert.ok(wall.group.rotation.y>Math.PI*2,'unwrapped phase keeps slower interior cloud rotation continuous across full wall turns');
state.simTime=0;wall.update(state,weather,observer,haze);assert.equal(wall.group.rotation.y,0);
const clouds=context.createEyeClouds(T);state.east=state.north=0;state.intensity=150;state.stormRadius=110;
clouds.update(state,observer,{visibility:11000,sunshine:.1},haze,.8);assert.ok(clouds.uniforms.eyeLow.value>.5&&clouds.uniforms.eyeMid.value>.5);
// Track an actual point rotating east -> north (negative world z). Sampling its
// material coordinates must recover the same cloud, as with the rotating wall.
for(const phase of [0,.8,6.28,25,100]){
  clouds.update(state,observer,{visibility:11000,sunshine:.1},haze,phase);
  const point=new T.Vector3(100,0,0).applyAxisAngle(new T.Vector3(0,1,0),phase*.28),r=clouds.uniforms.eyeRotation.value;
  assert.ok(Math.abs(r.x*point.x+r.z*point.z-100)<1e-9&&Math.abs(r.y*point.x+r.w*point.z)<1e-9,'clouds follow northern-hemisphere counterclockwise circulation');
}
const sharedSky=context.createStormSky(T,clouds.uniforms),sharedWall=context.createEyeWall(T,scene,clouds.uniforms);
sharedWall.update(state,weather,observer,haze);
assert.equal(sharedSky.material.uniforms.eyeLow,sharedWall.group.children[0].material.uniforms.eyeLow,'sky gaps and wall occlusion trace the same cloud coverage');
state.intensity=190;clouds.update(state,observer,weather,haze,0);assert.equal(clouds.uniforms.eyeLow.value+clouds.uniforms.eyeMid.value,0,'all interior cloud layers clear at 190 kt');
state.intensity=150;state.east=20;clouds.update(state,observer,weather,haze,0);assert.equal(clouds.uniforms.eyeLow.value,0,'interior clouds not visible from eyewall');
console.log('PASS: real scale, early formation, eye-only wall, low overcast, fading low/middle clouds, 190 kt clear eye, simulated rotation and solar occlusion.');
