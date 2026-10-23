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
fog.update(0,weather,visual,true);assert.equal(fog.diagnostics().fogAmount,0);assert.ok(fog.diagnostics().amount>0,'fog removal keeps particle concentration patches');
let hook=0;const mat={onBeforeCompile(s){s.keep=++hook;},customProgramCacheKey(){return'original';}},scene={traverse(fn){fn({material:mat});}};
fog.install(scene);fog.install(scene);const shader={uniforms:{}};mat.onBeforeCompile(shader,{});assert.equal(hook,1);assert.equal(shader.keep,1);assert.equal(shader.uniforms.rainFogShift,fog.uniforms.rainFogShift);assert.ok(mat.customProgramCacheKey().startsWith('original'));
assert.ok(chunks.fog_fragment.includes('opticalVariation'));assert.ok(!chunks.fog_fragment.includes('float fogFactor = 1.0 - exp'));
console.log('PASS: moving and deforming world-space rain field, bounded concentration, pause, fog-removal separation and material hook preservation.');
