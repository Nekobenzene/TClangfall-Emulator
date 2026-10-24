const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}res.setHeader('content-type',file.endsWith('.json')?'application/json':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');try{res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{
for(const file of ['台风模拟器.html','台风模拟器-可配置版.html']){
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.goto('http://127.0.0.1:'+server.address().port+'/'+encodeURIComponent(file));await page.waitForFunction(()=>window.TyphoonSimulator?.diagnostics().sceneReady);
 assert.equal(await page.locator('#soundVolume').inputValue(),'50');assert.equal(await page.evaluate(()=>window.TyphoonSimulator.audioDiagnostics()?.masterTarget),undefined);
 await page.locator('#soundButton').click();await page.waitForFunction(()=>window.TyphoonSimulator.audioDiagnostics()?.masterTarget>0);
 const checkGain=async()=>{const v=await page.evaluate(()=>{const s=TyphoonSimulator.getState(),w=TyphoonSimulator.getWeather();return{actual:TyphoonSimulator.audioDiagnostics().masterTarget,expected:s.sound&&!s.paused?s.soundVolume/100:0};});assert(Math.abs(v.actual-v.expected)<.02,JSON.stringify(v));};
 await checkGain();const before=await page.evaluate(()=>TyphoonSimulator.getState());
 const box=await page.locator('#soundVolume').boundingBox();assert.equal(box.height,40);
 await page.mouse.move(box.x+box.width*.75,box.y+box.height-3);await page.mouse.down();await page.mouse.move(box.x+box.width*.2,box.y+box.height-3,{steps:12});await page.mouse.up();
 assert(Number(await page.locator('#soundVolume').inputValue())<30);assert.equal(await page.evaluate(()=>getSelection().toString()),'');
 const after=await page.evaluate(()=>TyphoonSimulator.getState());assert.equal(after.yaw,before.yaw);assert.equal(after.pitch,before.pitch);
 await page.locator('#soundVolume').focus();await page.keyboard.press('End');assert.equal(await page.locator('#soundVolume').inputValue(),'100');await checkGain();
 await page.keyboard.press('Home');await checkGain();assert.equal(await page.evaluate(()=>TyphoonSimulator.audioDiagnostics().masterTarget),0);
 await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#soundVolumeValue').textContent(),'1%');
 await page.locator('#resetButton').click();assert.equal(await page.evaluate(()=>TyphoonSimulator.getState().soundVolume),1);
 await page.locator('#pauseButton').click();await page.waitForTimeout(250);await checkGain();assert.equal(await page.evaluate(()=>TyphoonSimulator.audioDiagnostics().masterTarget),0);
 await page.locator('#pauseButton').click();await page.locator('#soundButton').click();await checkGain();assert.equal(await page.evaluate(()=>TyphoonSimulator.audioDiagnostics().masterTarget),0);
 await page.screenshot({path:path.join(root,'tmp','volume-'+(file.includes('可配置')?'config':'builtin')+'.png')});await page.close();
 console.log('PASS audio gain, mute, reset, keyboard and mouse hit area:',file);
}
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/'+encodeURIComponent('台风模拟器.html'));await page.waitForFunction(()=>window.TyphoonSimulator?.diagnostics().sceneReady);await page.locator('#soundVolume').scrollIntoViewIfNeeded();
const b=await page.locator('#soundVolume').boundingBox(),cdp=await context.newCDPSession(page);const send=(type,x)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y:b.y+b.height-3}]});await send('touchStart',b.x+b.width*.75);await send('touchMove',b.x+b.width*.15);await send('touchEnd',0);assert(Number(await page.locator('#soundVolume').inputValue())<30);assert.equal(await page.evaluate(()=>getSelection().toString()),'');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(root,'tmp','volume-mobile.png')});await context.close();console.log('PASS mobile touch edge drag and no overflow');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
