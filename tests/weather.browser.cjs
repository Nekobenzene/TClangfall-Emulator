/* Fixed-weather rendering fixtures isolate wind-dependent rain appearance at constant flux. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
const server=http.createServer((req,res)=>{res.setHeader('content-type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,'台风模拟器.html')));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.TyphoonSimulator?.diagnostics().sceneReady);
  await page.evaluate(()=>{
   const original=StormModel.sample;window.rainFixture={kt:20,rain:120};
   StormModel.sample=(...args)=>{const w=original(...args),f=window.rainFixture,o=StormModel.rainOptics(f.kt,f.rain);return{...w,sustained:f.kt,meanMs:f.kt*StormModel.KT,ms:f.kt*StormModel.KT,gust:f.kt,ve:f.kt*StormModel.KT,vn:0,rain:f.rain,visibility:StormModel.clamp(Math.log(20)/(Math.log(20)/11000+o.extinction),55,11000),sunshine:0};};
  });
  const shots=[];
  for(const [kt,rain,name] of [[20,120,'弱风大雨雨幕'],[65,50,'65kt-雨丝'],[90,50,'90kt-细密雨'],[110,50,'110kt-细雨雾']]){
   await page.evaluate(f=>Object.assign(window.rainFixture,f),{kt,rain});
   await page.waitForFunction(({kt,rain})=>Math.abs(TyphoonSimulator.getWeather().sustained-kt)<.001&&Math.abs(TyphoonSimulator.getWeather().rain-rain)<.001,{kt,rain});
   const d=await page.evaluate(()=>TyphoonSimulator.rainDiagnostics());assert.ok(d.count>0&&d.mistCount===150&&d.mistOpacity>0);assert.ok(Number.isFinite(d.trailLength));shots.push({kt,rain,...d});
   await page.locator('#view').screenshot({path:path.join(root,'tmp',name+'.png')});
  }
  assert.ok(shots[3].count>shots[1].count*2);assert.ok(shots[3].trailLength<shots[1].trailLength*.1);assert.ok(shots[0].mistOpacity>.1);
  await page.setViewportSize({width:844,height:390});await page.locator('#view').screenshot({path:path.join(root,'tmp','细雨雾-手机横屏.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);console.log('PASS: actual rain pool grows at fixed rain, streaks shorten into fine mist, low-wind heavy-rain curtains, landscape render and no page errors.');console.log(JSON.stringify(shots));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
