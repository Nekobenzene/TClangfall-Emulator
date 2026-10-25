const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),near=(a,b,t=.01)=>assert(Math.abs(a-b)<t,`${a} != ${b}`);
const server=http.createServer((req,res)=>{
 const file=path.join(root,decodeURIComponent(req.url.split('?')[0]));
 res.setHeader('content-type',file.endsWith('.json')?'application/json':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');
 try{res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const file of ['台风模拟器.html','台风模拟器-可配置版.html']){
  const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{Date.now=()=>1792886400017;});
  await page.goto('http://127.0.0.1:'+server.address().port+'/'+encodeURIComponent(file));
  await page.waitForFunction(()=>window.TyphoonSimulator?.diagnostics().sceneReady);
  const snapshot=()=>page.evaluate(()=>({clock:performance.now()/1000,simulation:TyphoonSimulator.getState().simTime,...TyphoonSimulator.variabilityDiagnostics()}));
  for(const scale of [1,1000]){
   await page.locator('#timeScale').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('change'));},scale);
   const a=await snapshot();await page.waitForTimeout(1100);const b=await snapshot();
   near(b.seconds-a.seconds,b.clock-a.clock,.3);
   near((b.simulation-a.simulation)/scale,b.seconds-a.seconds,.05);
   assert(b.seconds-a.seconds>.7&&b.seconds-a.seconds<2.5,'real seconds, independent of the simulation multiplier');
  }
  await page.locator('#pauseButton').click();const paused=await snapshot();
  await page.waitForTimeout(400);near((await snapshot()).seconds,paused.seconds,1e-12);
  const validation=await page.evaluate(()=>{
   const d=TyphoonSimulator.variabilityDiagnostics(),expected=StormModel.createVariability(d.seed).advance(d.seconds),w=TyphoonSimulator.getWeather();
   return{expected,actual:d,gust:w.gust/w.sustained,rain:w.rain/w.meanRain,renderedGust:w.gustRatio,renderedRain:w.rainRatio};
  });
  for(const key of ['gust','stormGust','stormRain','wallRain'])near(validation.expected[key],validation.actual[key],1e-8);
  near(validation.gust,validation.actual.gust,1e-10);near(validation.rain,validation.renderedRain,1e-10);
  // An explicit crest fixture exercises the production particles, fog and Web Audio.
  await page.evaluate(()=>{
   const sample=StormModel.sample;window.crestFixture={ratio:1.25,rainRatio:1};
   StormModel.sample=(...args)=>{if(crestFixture.direction)crestFixture.ratio=crestFixture.startRatio+crestFixture.direction*(performance.now()-crestFixture.start)/1000*.02;return({...sample(...args),sustained:160,meanMs:160*StormModel.KT,gust:160*crestFixture.ratio,gustRatio:crestFixture.ratio,
    ms:160*crestFixture.ratio*StormModel.KT,ve:160*crestFixture.ratio*StormModel.KT,vn:0,rain:65*crestFixture.rainRatio,meanRain:65,rainRatio:crestFixture.rainRatio,cloudCover:1,sunshine:0});};
  });
  await page.locator('#pauseButton').click();await page.locator('#soundButton').click();
  await page.waitForFunction(()=>Math.abs(TyphoonSimulator.getWeather().sustained-160)<.01);
  await page.waitForTimeout(1400);
  const crest=await page.evaluate(()=>({rain:TyphoonSimulator.rainDiagnostics(),audio:TyphoonSimulator.audioDiagnostics(),w:TyphoonSimulator.getWeather()}));
  near(crest.rain.field.gustFrequency,2);near(crest.rain.motion.gustSpeed,1.3);
  near(crest.rain.field.instantFogFrequency/(crest.rain.field.fogFrequency*crest.rain.field.cadenceFactor),2);
  near(crest.audio.profile.kt,200);near(crest.audio.profile.rain,65);near(crest.audio.profile.whistleBoost,4);
  near(crest.w.visibility,250,1);assert(crest.rain.mistOpacity>=.16*1.79,'gust crests visibly strengthen the fog walls');
  assert(crest.audio.whistleCount>0&&crest.audio.whistle>0,'eligible crests make the whistle audible immediately');
  const previous=crest.audio.profile.windLevel;
  await page.evaluate(()=>{crestFixture.ratio=1;});await page.waitForTimeout(450);
  await page.waitForFunction(()=>TyphoonSimulator.getWeather().gustVisualRise<.005);
  const normal=await page.evaluate(()=>({field:TyphoonSimulator.rainDiagnostics().field,audio:TyphoonSimulator.audioDiagnostics(),w:TyphoonSimulator.getWeather(),rain:TyphoonSimulator.rainDiagnostics()}));
  near(normal.field.gustFrequency,1);near(normal.field.gustSpeed,1);near(normal.audio.profile.whistleBoost,1);
  assert(normal.audio.profile.windLevel<previous,'wind audio follows the instantaneous gust');
  assert(normal.w.visibility>crest.w.visibility,'visibility immediately follows gust speed');
  assert(crest.rain.opacity>normal.rain.opacity*1.34&&crest.rain.count>normal.rain.count,'peak rain is visibly denser and less transparent');
  await page.evaluate(()=>{crestFixture.rainRatio=1.15;});await page.waitForTimeout(450);
  const wetter=await page.evaluate(()=>({w:TyphoonSimulator.getWeather(),audio:TyphoonSimulator.audioDiagnostics(),expected:StormModel.visibility(TyphoonSimulator.getWeather())}));
  near(wetter.w.rain,65*1.15,.01);near(wetter.w.visibility,wetter.expected,1e-8);
  assert(wetter.w.visibility<normal.w.visibility,'visibility follows instantaneous rain at unchanged gust speed');
  near(wetter.audio.profile.rain,wetter.w.rain,.01);
  assert(wetter.audio.profile.rainLevel>normal.audio.profile.rainLevel,'rain audio follows instantaneous rain rather than reference rain');
  await page.evaluate(()=>Object.assign(crestFixture,{startRatio:1.03,start:performance.now(),direction:1}));
  await page.waitForTimeout(550);
  const rising=await page.evaluate(()=>({w:TyphoonSimulator.getWeather(),response:TyphoonSimulator.variabilityDiagnostics().response,audio:TyphoonSimulator.audioDiagnostics()}));
  assert(rising.w.gustRiseRate>2&&rising.response.rise>.6,'real-time gust rise drives a sensitive pre-crest response: '+JSON.stringify(rising));
  near(rising.audio.profile.whistleFrequency,1.05*(900+8*(rising.audio.profile.kt-155)));
  assert(rising.audio.profile.whistleBoost>1&&rising.w.gustVisualRise>.4,'rising gust boosts gain and builds the visual response');
  await page.evaluate(()=>Object.assign(crestFixture,{startRatio:crestFixture.ratio,start:performance.now(),direction:-1}));
  await page.waitForTimeout(350);
  const falling=await page.evaluate(()=>({w:TyphoonSimulator.getWeather(),response:TyphoonSimulator.variabilityDiagnostics().response,audio:TyphoonSimulator.audioDiagnostics()}));
  assert(falling.w.gustRiseRate<0);near(falling.response.rise,0);
  assert(falling.w.gustVisualRise>0&&falling.w.gustVisualRise<rising.w.gustVisualRise,'visual response decays instead of snapping off at the turn');
  near(falling.audio.profile.whistleFrequency,1.05*(900+8*(falling.audio.profile.kt-155)));
  await page.locator('#pauseButton').click();const beforeReset=(await snapshot()).seed;
  await page.locator('#resetButton').click();assert.equal((await snapshot()).seed,beforeReset);
  // Date.now is fixed in this fixture; resetting restarts that seed at zero seconds.
  assert((await snapshot()).seconds<1);
  assert.deepEqual(errors,[]);console.log('PASS real-time variability, pause/reset, rendered crest factors and gust-driven sound:',file);
  await page.close();
 }}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
