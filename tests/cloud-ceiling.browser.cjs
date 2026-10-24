/* Fixed geometry and weather isolate cloud texture from atmospheric extinction. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{chromium}=require('playwright'),{PNG}=require('pngjs');
const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{res.setHeader('content-type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,'台风模拟器.html')));});
fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
function cloudContrast(shot){
 const png=PNG.sync.read(shot),values=[];
 // The right-hand sky crop excludes buildings and all observation controls.
 for(let y=Math.round(png.height*.25);y<png.height*.70;y++)for(let x=Math.round(png.width*.5);x<png.width*.8;x++){const i=(y*png.width+x)*4;values.push((png.data[i]+png.data[i+1]+png.data[i+2])/3);}
 const mean=values.reduce((a,b)=>a+b,0)/values.length;return Math.sqrt(values.reduce((sum,v)=>sum+(v-mean)**2,0)/values.length);
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>TyphoonSimulator?.diagnostics().sceneReady);
 await page.evaluate(()=>{
  for(const [id,value]of [['intensityNumber',180],['timeScale',1],['east',0],['north',-60]]){const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));}
  const original=StormModel.sample,visuals=StormModel.visuals;window.cloudFixture={kt:20,rain:0};
  StormModel.sample=(...args)=>{const w=original(...args),f=window.cloudFixture;return{...w,sustained:f.kt,gust:f.kt,ms:f.kt*StormModel.KT,ve:f.kt*StormModel.KT,vn:0,rain:f.rain,sunshine:0,visibility:Math.log(20)/(Math.log(20)/11000+StormModel.rainExtinction(f.rain,0,0,f.kt))};};
  // Isolate the rendered cloud contrast, without streaks or white foreground mist.
  StormModel.visuals=(...args)=>({...visuals(...args),rainDensity:0,mistOpacity:0,debrisCount:0});
 });
 await page.locator('#view').focus();for(let i=0;i<40;i++)await page.keyboard.press('ArrowUp');
 // Freeze the material coordinates while comparing extinction at identical geometry.
 await page.locator('#pauseButton').click();
 const contrasts=[];
 for(const [kt,rain,name]of [[20,0,'弱风无雨-云底纹理'],[170,0,'强风无雨-云底纹理'],[170,70,'强风降雨-云底消光']]){
  await page.evaluate(f=>Object.assign(cloudFixture,f),{kt,rain});await page.waitForFunction(({kt,rain})=>Math.abs(TyphoonSimulator.getWeather().sustained-kt)<.001&&Math.abs(TyphoonSimulator.getWeather().rain-rain)<.001,{kt,rain});
  const d=await page.evaluate(()=>TyphoonSimulator.cloudDiagnostics());assert.equal(d.base,400);assert.equal(d.coverage,1);
  contrasts.push(cloudContrast(await page.locator('#view').screenshot({path:path.join(root,'tmp',name+'.png')})));
 }
 assert.ok(contrasts[0]>2,'dry low cloud shows resolved texture');assert.ok(contrasts[1]>contrasts[0]*.7,'high wind does not erase dry cloud texture');assert.ok(contrasts[2]<contrasts[1]*.5,'rain extinction hides the texture naturally');
 await page.locator('#pauseButton').click();
 const motion=await page.evaluate(()=>({cloud:TyphoonSimulator.cloudDiagnostics().motion,clock:TyphoonSimulator.getState().time}));
 await page.waitForFunction(t=>TyphoonSimulator.getState().time>t+.6,motion.clock);
 const moving=await page.evaluate(()=>({cloud:TyphoonSimulator.cloudDiagnostics().motion,clock:TyphoonSimulator.getState().time}));
 assert.ok(Math.abs((moving.cloud.shift.x-motion.cloud.shift.x)/(moving.clock-motion.clock)-170*1852/3600*1.3)<.01,'rendered cloud transport uses local sustained wind, not gust magnitude or storm strength');
 await page.locator('#pauseButton').click();const frozen=await page.evaluate(()=>({shift:TyphoonSimulator.cloudDiagnostics().motion.shift,frame:TyphoonSimulator.diagnostics().renderedFrames}));
 await page.waitForFunction(n=>TyphoonSimulator.diagnostics().renderedFrames>n+4,frozen.frame);assert.deepEqual(await page.evaluate(()=>TyphoonSimulator.cloudDiagnostics().motion.shift),frozen.shift);
 const recordedVisibility=await page.evaluate(()=>TyphoonSimulator.getWeather().visibility);
 await page.locator('#clearFogButton').click();await page.waitForFunction(()=>TyphoonSimulator.cloudDiagnostics().visibility===22000);const restored=cloudContrast(await page.locator('#view').screenshot({path:path.join(root,'tmp','去除雨雾-云底纹理恢复.png')}));assert.ok(restored>2,'removing display fog resolves cloud texture');assert.ok(Math.abs(await page.evaluate(()=>TyphoonSimulator.getWeather().visibility)-recordedVisibility)<.1,'visibility reading is unchanged');
 await page.evaluate(()=>cloudFixture.rain=0);await page.waitForFunction(()=>TyphoonSimulator.getWeather().rain<.001);const sameDry=cloudContrast(await page.locator('#view').screenshot());assert.ok(restored>sameDry*.7,'restored contrast matches the same dry material coordinates');
 await page.evaluate(()=>cloudFixture.rain=70);await page.waitForFunction(()=>TyphoonSimulator.getWeather().rain>69.999);await page.locator('#pauseButton').click();
 await page.evaluate(()=>{const e=document.getElementById('north');e.value=-180;e.dispatchEvent(new Event('change',{bubbles:true}));});await page.waitForFunction(()=>TyphoonSimulator.cloudDiagnostics().base===650);assert.ok(await page.evaluate(()=>TyphoonSimulator.cloudDiagnostics().coverage>.9));
 await page.setViewportSize({width:844,height:390});await page.locator('#view').screenshot({path:path.join(root,'tmp','云底-手机横屏.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);console.log('PASS: dry cloud texture survives high wind, rain extinction suppresses contrast, real-height storm/peripheral cloud bases, fog removal and landscape.');console.log(JSON.stringify({contrasts}));
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
