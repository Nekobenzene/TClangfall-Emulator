const assert=require('node:assert/strict'),{RainField:F,createRainFog}=require('../src/view-effects.js');
const zero={x:0,y:0,z:0},shift={x:12,y:-7,z:24},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10);
const samples=[];
for(let x=-500;x<=500;x+=13){const d=F.density(x,30,x*.7,zero,0);assert.ok(d>=.76&&d<=1.24);samples.push(d);near(d,F.density(x+shift.x,30+shift.y,x*.7+shift.z,shift,0,{axis:{x:1,y:0,z:0},wavelength:12,travel:shift.x*Math.PI*2/12}));}
assert.ok(Math.max(...samples)-Math.min(...samples)>.25,'gentle spatial modulation without rain-free holes');
assert.notEqual(F.density(50,20,-40,zero,0),F.density(50,20,-40,zero,8),'field deforms over time');
class Vector3{constructor(){this.x=this.y=this.z=0;}}
const chunks={fog_pars_vertex:'',fog_vertex:'',fog_pars_fragment:'',fog_fragment:'float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );'};
const fog=createRainFog({Vector3,ShaderChunk:chunks}),weather={ve:10,vn:5,rain:100},visual={curtainDrift:.5,curtainFall:3,mistMix:0};
fog.update(2,weather,visual,false);assert.deepEqual(fog.diagnostics().shift,{x:10,y:-6,z:-5});assert.ok(fog.diagnostics().fogAmount>0);
const frozen=fog.diagnostics();fog.update(0,weather,visual,false);assert.deepEqual(fog.diagnostics(),frozen);
// Count concentration cycles at a stationary observer, with fixed flow.
const drop=[],mist=[];for(let i=0;i<1200;i++){fog.update(1/120,weather,visual,false);drop.push(fog.densityAt(3,20,-4));mist.push(fog.fogDensityAt(3,20,-4));}
const peaks=a=>a.slice(1,-1).filter((v,i)=>v>a[i]&&v>a[i+2]).length;
assert.ok(peaks(drop)>=10&&peaks(drop)<=20,'rain ripples pass 1–2 times/second');assert.ok(peaks(mist)>=8&&peaks(mist)<=12,'fog modulation ~1 Hz');
const range=a=>Math.max(...a)-Math.min(...a);assert.ok(range(drop)<.49&&range(mist)<.49);assert.ok(range(mist)/range(drop)>.5&&range(mist)/range(drop)<2,'comparable rain and fog modulation amplitudes');
for(const [kt,hz]of [[120,2],[150,3],[200,F.frequencies(200).fog],[250,F.frequencies(250).fog]]){
 const field=createRainFog({Vector3,ShaderChunk:chunks}),w={...weather,sustained:kt,ve:kt*1852/3600,vn:0},rain=[],mist=[],cadence=[];
 for(let i=0;i<1800;i++){field.update(1/120,w,visual,false);cadence.push(field.diagnostics().cadenceFactor);if(i>=600){rain.push(field.densityAt(3,20,-4));mist.push(field.fogDensityAt(3,20,-4));}}
 assert.ok(Math.min(...cadence)>=.7&&Math.min(...cadence)<.71&&Math.max(...cadence)>1.29&&Math.max(...cadence)<=1.3,'frequency surges are limited to ±30%');
 near(field.diagnostics().fogFrequency,hz);assert.ok(Math.abs(peaks(mist)/10-hz)<.35,'actual fog cadence at '+kt);assert.ok(Math.abs(peaks(rain)/10-F.frequencies(kt).rain)<.35,'actual rain cadence at '+kt);
}
assert.ok(F.frequencies(250).fog<3.5&&F.frequencies(250).fog-F.frequencies(200).fog<.15,'cadence approaches a finite ceiling');
// A gust crest doubles the phase rate while transport gains only 30 percent.
const baseField=createRainFog({Vector3,ShaderChunk:chunks}),crestField=createRainFog({Vector3,ShaderChunk:chunks});
baseField.update(.1,weather,visual,false);
crestField.update(.1,weather,{...visual,curtainDrift:visual.curtainDrift*1.3,curtainFall:visual.curtainFall*1.3,gustFrequency:2,gustSpeed:1.3},false);
const baseRate=baseField.diagnostics(),crestRate=crestField.diagnostics();
near(crestRate.instantFogFrequency/baseRate.instantFogFrequency,2);near(crestRate.travel/baseRate.travel,2);
near(crestRate.shift.x/baseRate.shift.x,1.3);near(crestRate.shift.y/baseRate.shift.y,1.3);
near(crestRate.wavelength,baseRate.wavelength);
const factors=[];let factorPrior=1,maxFactorStep=0;
for(let i=0;i<36000;i++){const f=F.variation(i/120);factors.push(f);maxFactorStep=Math.max(maxFactorStep,Math.abs(f-factorPrior));factorPrior=f;}
assert.ok(Math.min(...factors)>=.3&&Math.min(...factors)<.31&&Math.max(...factors)>1.69&&Math.max(...factors)<=1.7,'surges reach ±70% without exceeding their bounds');
assert.ok(Math.abs(factors.reduce((a,b)=>a+b,0)/factors.length-1)<.015,'long-run mean cadence stays calibrated');assert.ok(maxFactorStep<.02,'surges change continuously');
fog.update(0,weather,visual,true);assert.equal(fog.diagnostics().fogAmount,0);assert.ok(fog.diagnostics().amount>0,'fog removal keeps particle concentration patches');
let hook=0;const mat={onBeforeCompile(s){s.keep=++hook;},customProgramCacheKey(){return'original';}},scene={traverse(fn){fn({material:mat});}};
fog.install(scene);fog.install(scene);const shader={uniforms:{}};mat.onBeforeCompile(shader,{});assert.equal(hook,1);assert.equal(shader.keep,1);assert.equal(shader.uniforms.rainFogShift,fog.uniforms.rainFogShift);assert.ok(mat.customProgramCacheKey().startsWith('original'));
assert.ok(chunks.fog_fragment.includes('opticalVariation'));assert.ok(!chunks.fog_fragment.includes('float fogFactor = 1.0 - exp'));
// The actual Three.js scene verifies volume proportions and world-space transport.
const fs=require('node:fs'),vm=require('node:vm'),context={console:{warn(){}}};vm.createContext(context);
vm.runInContext(fs.readFileSync(require.resolve('../three-vendor.min.js'),'utf8'),context);vm.runInContext(fs.readFileSync(require.resolve('../src/view-effects.js'),'utf8'),context);
const T=context.THREE,scenery=new T.Scene(),camera=new T.PerspectiveCamera();camera.position.set(0,19,0);
let seed=17;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const curtains=context.createMistCurtains(T,scenery,random),v={mistOpacity:1,curtainFall:3,curtainDrift:.8};
curtains.update(0,0,weather,v,camera,()=>.9);const first=curtains.diagnostics();
assert.equal(first.groundCount,288);assert.equal(first.wallCount,1062);
assert.ok(first.halfExtent-first.fadeEnd>60,'recycling has a fully transparent buffer wider than the largest wall half-length');
for(const p of first.items){
 if(p.ground)assert.ok(p.world.y+p.height/2<5,'thin spray stays within a few metres of terrain');
 else{assert.ok(p.height>=32&&p.thickness>=40&&p.thickness<=163);assert.ok(Math.abs(Math.sin(p.angle)*10-Math.cos(p.angle)*5)<2.5,'curtain transport axes approximately follow the wind');}
}
assert.ok(Math.max(...first.items.map(p=>p.strength))/Math.min(...first.items.map(p=>p.strength))>2,'curtains have distinct concentrations');
curtains.update(.05,.05,weather,v,camera,()=>.9);const moved=curtains.diagnostics();let compared=0;
for(let i=0;i<first.items.length;i++){const a=first.items[i],b=moved.items[i];if(Math.abs(a.world.x-b.world.x)>10||Math.abs(a.world.z-b.world.z)>10)continue;near(b.world.x-a.world.x,.5);near(b.world.z-a.world.z,-.25);compared++;}assert.ok(compared>100);
camera.position.set(1,20,1);camera.rotation.y=1.2;curtains.update(0,.05,weather,v,camera,()=>.9);const flying=curtains.diagnostics();
for(let i=0;i<moved.items.length;i++){const a=moved.items[i],b=flying.items[i];if(Math.hypot(a.world.x-b.world.x,a.world.z-b.world.z)>10)continue;near(a.world.x,b.world.x);near(a.world.y,b.world.y);near(a.world.z,b.world.z);near(a.angle,b.angle);near(a.length,b.length);}
assert.equal(flying.clock,moved.clock,'deformation freezes while the camera moves through paused mist');
// Follow full wrap cycles at severe wind speed, including a flying observer.
// Recycling must be invisible, and distance fading must vary continuously.
let prior=flying,recycles=0,maxFadeRate=0,minDepth=2,maxDepth=0;
const severe={ve:90,vn:24,rain:100},step=1/120;
for(let frame=0;frame<1800;frame++){
 camera.position.x+=12*step;camera.position.z-=4*step;
 curtains.update(step,.05+(frame+1)*step,severe,v,camera,()=>.9);
 const next=curtains.diagnostics();
 for(const b of next.items){
  const a=prior.items[b.index],rate=Math.abs(a.fade-b.fade)/step;
  if(!b.ground){minDepth=Math.min(minDepth,b.depthFactor);maxDepth=Math.max(maxDepth,b.depthFactor);near(b.length,b.baseLength*b.depthFactor);}else near(b.depthFactor,1);
  maxFadeRate=Math.max(maxFadeRate,rate);
  if(b.recycled){assert.equal(b.fade,0,'a recycled curtain is fully invisible');assert.equal(a.fade,0,'a curtain disappears before it is recycled');recycles++;}
 }
 prior=next;
}
assert.ok(recycles>300,'test crosses an entire horizontal recycle domain');
assert.ok(minDepth>=.3&&minDepth<.31&&maxDepth>1.69&&maxDepth<=1.7,'actual curtain dimensions span ±70% while ground spray stays flat');
assert.ok(maxFadeRate<.6,'no step change in curtain visibility during wind transport and camera flight');
// A building masks the supported volume, including its leading/trailing edges.
// Once it clears the facade, opacity returns gradually rather than popping on.
camera.position.set(0,19,0);
const building={minX:-10,maxX:10,minZ:-10,maxZ:10,minY:-5,maxY:200};
const sheltered=context.createMistCurtains(T,new T.Scene(),()=>.5,[building]),shelterVisual={mistOpacity:1,curtainFall:0,curtainDrift:1},shelterWind={ve:20,vn:0};
sheltered.update(0,0,shelterWind,shelterVisual,camera,()=>.9);
let shelteredWall=sheltered.diagnostics().items.find(p=>!p.ground),lastFade=0,emerging=0;
assert.equal(shelteredWall.buildingFade,0);assert.equal(shelteredWall.blocked,true);
for(let frame=1;frame<=95;frame++){
 sheltered.update(.1,frame*.1,shelterWind,shelterVisual,camera,()=>.9);
 shelteredWall=sheltered.diagnostics().items[shelteredWall.index];
 if(shelteredWall.blocked)assert.equal(shelteredWall.buildingFade,0,'no part of the mist appears through the building');
 else if(shelteredWall.recovery<1){assert.ok(shelteredWall.buildingFade<1);emerging++;}
 assert.ok(shelteredWall.buildingFade>=lastFade&&shelteredWall.buildingFade-lastFade<.085,'smooth reappearance behind the facade '+JSON.stringify({frame,lastFade,wall:shelteredWall}));
 lastFade=shelteredWall.buildingFade;
 if(emerging===10){const frozen=shelteredWall.buildingFade;sheltered.update(0,frame*.1,shelterWind,shelterVisual,camera,()=>.9);near(sheltered.diagnostics().items[shelteredWall.index].buildingFade,frozen);}
}
assert.ok(emerging>=24,'reappearance spans about 2.5 weather seconds');near(shelteredWall.buildingFade,1);
curtains.update(0,.05,weather,{...v,mistOpacity:0},camera,()=>.9);assert.equal(curtains.diagnostics().count,0,'no rain means no motion fog');
console.log('PASS: advected rain field, wind-aligned volumes, paused-camera parallax, invisible recycling and gradual post-building emergence.');
