const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}res.setHeader('content-type',file.endsWith('.json')?'application/json':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');try{res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});

// Runtime smoke only: no screenshots, listening or rendered-effect comparisons.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{
for(const file of ['台风模拟器.html','台风模拟器-可配置版.html']){
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/'+encodeURIComponent(file));await page.waitForFunction(()=>window.TyphoonSimulator?.diagnostics().sceneReady);
 await page.evaluate(()=>{const sample=StormModel.sample;window.smokeWeather={rain:0,kt:0,cloudCover:0};StormModel.sample=(...args)=>{const w=sample(...args),f=smokeWeather;return{...w,rain:f.rain,cloudCover:f.cloudCover,sustained:f.kt,gust:f.kt,ms:f.kt*StormModel.KT,ve:f.kt*StormModel.KT,vn:0,sunshine:1-f.cloudCover};};});
 await page.waitForTimeout(1700);await page.locator('#soundButton').click();assert.equal(await page.locator('#soundButton').getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>TyphoonSimulator.audioDiagnostics().continuous),0);
 await page.evaluate(()=>Object.assign(smokeWeather,{rain:5,cloudCover:1}));await page.waitForTimeout(900);
 assert(await page.evaluate(()=>TyphoonSimulator.getWeather().rain>0&&TyphoonSimulator.cloudDiagnostics().coverage===1));
 assert.equal(await page.evaluate(()=>TyphoonSimulator.audioDiagnostics().continuous),0);assert(await page.evaluate(()=>TyphoonSimulator.audioDiagnostics().dropCount>0));
 await page.evaluate(()=>Object.assign(smokeWeather,{rain:65,kt:260}));await page.waitForTimeout(8500);
 assert(await page.evaluate(()=>Object.values(TyphoonSimulator.audioDiagnostics().profile).every(Number.isFinite)));assert(await page.evaluate(()=>TyphoonSimulator.audioDiagnostics().rumble>0&&TyphoonSimulator.audioDiagnostics().rumbleWet>0));
 await page.locator('#soundVolume').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForTimeout(650);assert(await page.evaluate(()=>TyphoonSimulator.audioDiagnostics().master<.001));
 await page.locator('#soundButton').click();assert.equal(await page.locator('#soundButton').getAttribute('aria-pressed'),'false');assert.deepEqual(errors,[]);console.log('PASS weather/audio smoke: cloud gate, droplets, heavy rain, extreme wind channels, mute:',file);await page.close();
}
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
