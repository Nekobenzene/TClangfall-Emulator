/* Isolate the new motion fog from streaks and background extinction. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{chromium}=require('playwright'),{PNG}=require('pngjs');
const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{res.setHeader('content-type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,'台风模拟器.html')));});
fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
function difference(a,b){const x=PNG.sync.read(a),y=PNG.sync.read(b);let sum=0,n=0;for(let j=Math.round(x.height*.27);j<x.height*.78;j++)for(let i=Math.round(x.width*.4);i<x.width*.9;i++){const k=(j*x.width+i)*4;sum+=Math.abs(x.data[k]-y.data[k])+Math.abs(x.data[k+1]-y.data[k+1])+Math.abs(x.data[k+2]-y.data[k+2]);n+=3;}return sum/n;}
function skyDifference(a,b){const x=PNG.sync.read(a),y=PNG.sync.read(b);let sum=0,n=0;for(let j=Math.round(x.height*.10);j<x.height*.32;j++)for(let i=Math.round(x.width*.57);i<x.width*.88;i++){const k=(j*x.width+i)*4;sum+=Math.abs(x.data[k]-y.data[k])+Math.abs(x.data[k+1]-y.data[k+1])+Math.abs(x.data[k+2]-y.data[k+2]);n+=3;}return sum/n;}
async function verifyVolume(browser,errors){
 const page=await browser.newPage({viewport:{width:512,height:384}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.setContent('<body style="margin:0"></body>');await page.addScriptTag({path:path.join(root,'three-vendor.min.js')});await page.addScriptTag({path:path.join(root,'src/view-effects.js')});
 const shots=await page.evaluate(()=>{
  const T=THREE,scene=new T.Scene(),renderer=new T.WebGLRenderer({antialias:true,logarithmicDepthBuffer:true,preserveDrawingBuffer:true});renderer.setSize(512,384);renderer.setClearColor('#24343b');document.body.appendChild(renderer.domElement);
  const camera=new T.PerspectiveCamera(55,512/384,.15,2000),mist=createMistCurtains(T,scene,()=>.5);camera.position.set(0,30,90);
  mist.update(0,0,{ve:80,vn:0},{mistOpacity:1,curtainFall:0,curtainDrift:1},camera,()=>0);
  const object=new T.Object3D();object.position.set(0,30,0);object.scale.set(80,60,20);object.updateMatrix();mist.mesh.setMatrixAt(0,object.matrix);mist.mesh.instanceMatrix.needsUpdate=true;mist.mesh.count=1;
  const attributes=mist.mesh.geometry.attributes;attributes.mistMeta.setXYZ(0,1.2,.95,0);attributes.mistMeta.needsUpdate=true;attributes.mistFloor.setX(0,-.5);attributes.mistFloor.needsUpdate=true;attributes.mistFade.setX(0,1);attributes.mistFade.needsUpdate=true;
  const shots=[];for(const z of [90,11,10.2,10.14,10.08,10.02,9.98,9.92,9.8,9]){camera.position.z=z;camera.lookAt(0,30,z-1);renderer.render(scene,camera);shots.push({z,url:renderer.domElement.toDataURL()});}
  // A building wholly in front still occludes a fog volume drawn from its exit faces.
  const facade=new T.Mesh(new T.BoxGeometry(200,200,1),new T.MeshBasicMaterial({color:'#24343b'}));facade.position.set(0,30,50);scene.add(facade);camera.position.z=90;camera.lookAt(0,30,0);renderer.render(scene,camera);shots.push({z:'occluded',url:renderer.domElement.toDataURL()});
  mist.mesh.visible=false;renderer.render(scene,camera);shots.push({z:'clear',url:renderer.domElement.toDataURL()});renderer.dispose();return shots;
 });
 const means=[];let edgeJump=0,range=0;
 for(const shot of shots){const buffer=Buffer.from(shot.url.split(',')[1],'base64'),png=PNG.sync.read(buffer);let sum=0,n=0;
  for(let y=150;y<230;y++)for(let x=220;x<292;x++){const k=(y*png.width+x)*4;sum+=png.data[k]+png.data[k+1]+png.data[k+2];n+=3;}means.push(sum/n);
  if(shot.z===90){fs.writeFileSync(path.join(root,'tmp','竖向雾墙-柔边体积.png'),buffer);const row=[];for(let x=0;x<png.width;x++){const k=(192*png.width+x)*4,v=(png.data[k]+png.data[k+1]+png.data[k+2])/3;if(x)edgeJump=Math.max(edgeJump,Math.abs(v-row[x-1]));row.push(v);}range=Math.max(...row)-Math.min(...row);}
 }
 assert.ok(range>15&&edgeJump<3,'visible fog dissolves continuously into the background at its silhouette');
 const crossing=means.slice(1,-2),nearClipJump=Math.max(...crossing.slice(1).map((v,i)=>Math.abs(v-crossing[i])));assert.ok(nearClipJump<1,'no flash as the near clipping plane or observer crosses the volume entrance');
 assert.equal(means.at(-2),means.at(-1),'fog behind a solid facade stays occluded');await page.close();return{edgeJump,nearClipJump};
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.TyphoonSimulator?.diagnostics().sceneReady);
 await page.evaluate(()=>{
  const sample=StormModel.sample,visuals=StormModel.visuals;window.mistFixture={visible:true};
  StormModel.sample=(...args)=>({...sample(...args),sustained:170,gust:170,ms:170*StormModel.KT,meanMs:170*StormModel.KT,ve:170*StormModel.KT,vn:0,rain:70,visibility:100,sunshine:0});
  StormModel.visuals=(...args)=>({...visuals(...args),rainDensity:0,debrisCount:0,mistOpacity:mistFixture.visible?1:0});
 });
 await page.waitForFunction(()=>Math.abs(TyphoonSimulator.getWeather().sustained-170)<.001);
 await page.waitForFunction(()=>TyphoonSimulator.mistDiagnostics().items.filter(p=>!p.ground).every(p=>Math.abs(p.angle)<.24));
 await page.locator('#clearFogButton').click();await page.locator('#pauseButton').click();
 const before=await page.evaluate(()=>TyphoonSimulator.mistDiagnostics());assert.equal(before.wallCount,1062);assert.equal(before.groundCount,288);assert.ok(before.buildingCount>50,'the renderer receives actual building footprints and roof heights');assert.equal(before.skyMask,true);
 for(const p of before.items){assert.ok(p.ground?p.height<4:p.height>=32&&p.thickness>=40&&p.thickness<=163);assert.ok(p.ground||Math.abs(p.angle)<.24,'walls extend approximately downwind');if(p.blocked)assert.equal(p.buildingFade,0,'overlapping building volumes stay transparent');}
 const front=await page.locator('#view').screenshot({path:path.join(root,'tmp','竖向雾墙-正面.png')});
 await page.evaluate(()=>mistFixture.visible=false);await page.waitForFunction(()=>TyphoonSimulator.mistDiagnostics().count===0);const clear=await page.locator('#view').screenshot({path:path.join(root,'tmp','竖向雾墙-关闭对照.png')});
 const signal=difference(front,clear);assert.ok(signal>1,'softened volumes still visibly veil the view with reduced opacity and without display fog or rain streaks');
 const skySignal=skyDifference(front,clear);assert.ok(skySignal<.05,'motion mist leaves the sky pixels unchanged');
 await page.evaluate(()=>mistFixture.visible=true);await page.waitForFunction(n=>TyphoonSimulator.mistDiagnostics().count===n,before.count);
 await page.locator('#freeCameraButton').click();await page.locator('#view').focus();
 const start=await page.evaluate(()=>TyphoonSimulator.getState());await page.keyboard.down('KeyD');await page.waitForFunction(x=>TyphoonSimulator.getState().freeX>x+1,start.freeX);await page.keyboard.up('KeyD');
 await page.keyboard.down('KeyE');await page.waitForFunction(y=>TyphoonSimulator.getState().freeY>y+1,start.freeY);await page.keyboard.up('KeyE');for(let i=0;i<12;i++)await page.keyboard.press('ArrowRight');
 const after=await page.evaluate(()=>TyphoonSimulator.mistDiagnostics());assert.equal(after.clock,before.clock);
 let stable=0;for(const a of before.items){const b=after.items[a.index];if(Math.hypot(a.world.x-b.world.x,a.world.z-b.world.z)>20)continue;assert.ok(Math.hypot(a.world.x-b.world.x,a.world.y-b.world.y,a.world.z-b.world.z)<1e-8,'paused mist keeps world position during translation and ascent '+JSON.stringify({a,b}));assert.equal(b.angle,a.angle,'walls do not rotate towards the camera');stable++;}assert.ok(stable>120);
 await page.locator('#view').screenshot({path:path.join(root,'tmp','竖向雾墙-侧面穿行.png')});
 await page.locator('#pauseButton').click();const moving=await page.evaluate(()=>({mist:TyphoonSimulator.mistDiagnostics(),time:TyphoonSimulator.getState().time}));await page.waitForFunction(t=>TyphoonSimulator.getState().time>t+.15,moving.time);const later=await page.evaluate(()=>({mist:TyphoonSimulator.mistDiagnostics(),time:TyphoonSimulator.getState().time}));
 const index=moving.mist.groundCount,a=moving.mist.items[index],b=later.mist.items[index],span=2*later.mist.halfExtent,delta=(b.world.x-a.world.x+span)%span;assert.ok(Math.abs(delta/(later.time-moving.time)-170*1852/3600*.93*1.25)<.1,'fog transport is 25% faster');assert.ok(later.mist.clock>moving.mist.clock);
 const transitions=await page.evaluate(()=>new Promise(resolve=>{
  let previous=TyphoonSimulator.mistDiagnostics(),previousTime=TyphoonSimulator.getState().time,recycled=0,visibleRecycles=0,maxFadeRate=0;const start=previousTime;
  function sample(){const next=TyphoonSimulator.mistDiagnostics(),time=TyphoonSimulator.getState().time,dt=time-previousTime;
   if(dt>0)for(const b of next.items){const a=previous.items[b.index];maxFadeRate=Math.max(maxFadeRate,Math.abs(b.fade-a.fade)/dt);if(b.recycled){recycled++;if(a.fade>.00001||b.fade>.00001)visibleRecycles++;}if(b.blocked&&b.buildingFade!==0)throw Error('mist is visible inside a building');}
   previous=next;previousTime=time;if(time-start>=4)resolve({recycled,visibleRecycles,maxFadeRate});else requestAnimationFrame(sample);
  }requestAnimationFrame(sample);
 }));assert.ok(transitions.recycled>40);assert.equal(transitions.visibleRecycles,0,'actual running scene recycles only after full fade-out');assert.ok(transitions.maxFadeRate<.6,'appearance changes smoothly across rendered frames');
 await page.setViewportSize({width:844,height:390});await page.locator('#view').screenshot({path:path.join(root,'tmp','竖向雾墙-手机横屏.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const fps=await page.evaluate(()=>TyphoonSimulator.diagnostics().fps);await page.close();const volume=await verifyVolume(browser,errors);
 assert.deepEqual(errors,[]);console.log('PASS: softly bounded wind-aligned fog, ground-only spray, paused flight, invisible recycling, building masks, unchanged sky pixels and continuous volume entry.');console.log(JSON.stringify({signal,skySignal,stable,transitions,volume,fps}));
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
