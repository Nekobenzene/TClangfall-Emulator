/* Fixed-weather rendering fixtures isolate wind-dependent rain appearance at constant flux. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
const server=http.createServer((req,res)=>{res.setHeader('content-type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,'台风模拟器.html')));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.TyphoonSimulator?.diagnostics().sceneReady);
  await page.evaluate(()=>{
   const original=StormModel.sample;window.rainFixture={kt:20,rain:120};
   StormModel.sample=(...args)=>{const w=original(...args),f=window.rainFixture,o=StormModel.rainOptics(f.kt,f.rain);return{...w,sustained:f.kt,meanMs:f.kt*StormModel.KT,ms:f.kt*StormModel.KT,gust:f.kt,ve:f.kt*StormModel.KT,vn:0,rain:f.rain,visibility:StormModel.clamp(Math.log(20)/(Math.log(20)/11000+StormModel.rainExtinction(f.rain,o.mistMix,o.extinction,f.kt)),55,11000),sunshine:0};};
  });
  const shots=[];
  for(const [kt,rain,name] of [[20,120,'弱风大雨雨幕'],[45,50,'45kt-雨丝'],[90,50,'90kt-细密雨'],[95,50,'95kt-细雨雾过渡'],[100,50,'100kt-细雨雾过渡'],[105,50,'105kt-细雨雾过渡'],[110,50,'110kt-细雨雾过渡'],[125,50,'125kt-细雨雾过渡'],[135,50,'135kt-细雨雾'],[170,70,'170kt-70mm-百米能见度']]){
   await page.evaluate(f=>Object.assign(window.rainFixture,f),{kt,rain});
   await page.waitForFunction(({kt,rain})=>Math.abs(TyphoonSimulator.getWeather().sustained-kt)<.001&&Math.abs(TyphoonSimulator.getWeather().rain-rain)<.001,{kt,rain});
   const start=await page.evaluate(()=>TyphoonSimulator.diagnostics().renderedFrames);await page.waitForFunction(n=>TyphoonSimulator.diagnostics().renderedFrames>=n+8,start);
   const d=await page.evaluate(()=>TyphoonSimulator.rainDiagnostics());assert.ok(d.count>0&&d.mistCount===150&&d.mistOpacity>0);assert.ok(Number.isFinite(d.trailLength));assert.ok(d.patchRange[0]>.75&&d.patchRange[1]<1.25,'no nearly empty rain patches');assert.ok(d.patchRange[1]-d.patchRange[0]>.06);assert.ok(Math.abs(d.field.fogFrequency-1)<.01&&d.field.frequency>1&&d.field.frequency<2);shots.push({kt,rain,...d});
   if(kt<95)assert.equal(await page.evaluate(()=>TyphoonSimulator.debrisDiagnostics().count),0);
   await page.locator('#view').screenshot({path:path.join(root,'tmp',name+'.png')});
  }
  const at=k=>shots.find(s=>s.kt===k),fine=at(135);
  assert.ok(fine.count>shots[1].count*3);assert.ok(shots[1].count>29000&&shots[0].count>60000);assert.ok(fine.opacity>shots[1].opacity);assert.ok(fine.trailLength<shots[1].trailLength*.1);assert.ok(at(95).trailLength/at(110).trailLength<2.5);assert.ok(at(110).trailLength>fine.trailLength*2);assert.ok(shots[0].mistOpacity>.1);
  assert.ok(Math.abs((await page.evaluate(()=>TyphoonSimulator.getWeather().visibility))-100)<1);
  const before=await page.evaluate(()=>TyphoonSimulator.rainDiagnostics().field);await page.waitForFunction(x=>TyphoonSimulator.rainDiagnostics().field.shift.x>x+1,before.shift.x);
  await page.locator('#pauseButton').click();const frozen=await page.evaluate(()=>({field:TyphoonSimulator.rainDiagnostics().field,frame:TyphoonSimulator.diagnostics().renderedFrames}));await page.waitForFunction(n=>TyphoonSimulator.diagnostics().renderedFrames>n+6,frozen.frame);const pausedField=await page.evaluate(()=>TyphoonSimulator.rainDiagnostics().field);assert.deepEqual(pausedField.shift,frozen.field.shift);assert.equal(pausedField.phase,frozen.field.phase);assert.equal(pausedField.travel,frozen.field.travel);
  // With the weather paused, flight/rotation must change perspective without carrying debris along.
  await page.locator('#freeCameraButton').click();const frames=()=>page.evaluate(()=>TyphoonSimulator.diagnostics().renderedFrames);
  const anchor=await frames();await page.waitForFunction(n=>TyphoonSimulator.diagnostics().renderedFrames>n+2,anchor);
  const beforeFlight=await page.evaluate(()=>({state:TyphoonSimulator.getState(),debris:TyphoonSimulator.debrisDiagnostics()}));assert.ok(beforeFlight.debris.count>0);
  await page.locator('#view').focus();await page.keyboard.down('KeyD');await page.waitForFunction(x=>TyphoonSimulator.getState().freeX>x+.5,beforeFlight.state.freeX);await page.keyboard.up('KeyD');
  const afterFlight=await page.evaluate(()=>({state:TyphoonSimulator.getState(),debris:TyphoonSimulator.debrisDiagnostics()}));let stable=0;
  for(const a of beforeFlight.debris.items){const b=afterFlight.debris.items.find(b=>b.index===a.index);if(!b||Math.hypot(a.world.x-b.world.x,a.world.z-b.world.z)>100)continue;assert.ok(Math.hypot(a.world.x-b.world.x,a.world.y-b.world.y,a.world.z-b.world.z)<1e-6,'world debris stays fixed during paused flight');assert.ok(Math.hypot(a.view.x-b.view.x,a.view.z-b.view.z)>.1);stable++;}assert.ok(stable>0);
  const y=afterFlight.state.freeY;await page.keyboard.down('KeyE');await page.waitForFunction(y=>TyphoonSimulator.getState().freeY>y+.5,y);await page.keyboard.up('KeyE');const lifted=await page.evaluate(()=>TyphoonSimulator.debrisDiagnostics());assert.ok(Math.abs(lifted.items[0].world.y-afterFlight.debris.items[0].world.y)<1e-6);assert.ok(lifted.items[0].view.y<afterFlight.debris.items[0].view.y-.1);
  await page.keyboard.press('ArrowRight');const turned=await page.evaluate(()=>TyphoonSimulator.debrisDiagnostics());assert.deepEqual(turned.items[0].world,lifted.items[0].world);assert.ok(Math.hypot(turned.items[0].view.x-lifted.items[0].view.x,turned.items[0].view.z-lifted.items[0].view.z)>.1);
  await page.setViewportSize({width:844,height:390});await page.locator('#view').screenshot({path:path.join(root,'tmp','细雨雾-手机横屏.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);console.log('PASS: denser rain, gradual 45–135 kt refinement, advected nonuniform fog/rain concentration, pause, landscape render and no page/WebGL errors.');console.log(JSON.stringify(shots));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
