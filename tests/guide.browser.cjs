/* Real-browser onboarding regression. Optional: Playwright on NODE_PATH. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{const file=req.url.split('?')[0]==='/simulator.config.js'?'simulator.config.js':'台风模拟器.html';res.setHeader('content-type',file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,file)));});
fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
 try{
  for(const [width,height] of [[1440,960],[390,844],[844,390],[568,320],[320,568]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<1000,hasTouch:width<1000,deviceScaleFactor:1}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(6000);await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.TyphoonSimulator?.diagnostics().sceneReady);
   assert.equal(await page.locator('#settingsToggle').getAttribute('aria-expanded'),'false');
   assert.equal(await page.locator('#settingsPanel details[open]').count(),0);
   assert.equal(await page.locator('#viewHelp,#yawRange,#pitchRange,.scene-caption').count(),0);
   assert(!(await page.locator('#map').isVisible()));
   await page.locator('#pauseButton').click();const before=await page.evaluate(()=>window.TyphoonSimulator.getState());
   if(width===1440){
    const sea=await page.locator('.sea-readout').boundingBox(),damage=await page.locator('.damage-readout').boundingBox();assert(damage.x>=sea.x+sea.width,'damage sits to right of water');
    await page.screenshot({path:path.join(root,'tmp','默认界面.png'),fullPage:true});
   }
   await page.locator('#guideButton').click();assert(await page.locator('#usageGuide').isVisible());assert.equal(await page.locator('#guideChapters button').count(),8);
   if(width===1440)await page.screenshot({path:path.join(root,'tmp','使用指南.png')});
   await page.locator('#startGuide').click();
   assert.equal(await page.locator('.guide-spotlight').evaluate(el=>getComputedStyle(el).animationName),'guide-beacon');
   assert(await page.locator('.guide-spotlight').evaluate(el=>el.getAnimations().some(a=>a.effect.getTiming().iterations===Infinity)));
   for(let step=0;step<8;step++){
    await page.waitForTimeout(70);assert.equal(await page.locator('#guideProgress').textContent(),`上手引导 ${step+1} / 8`);
    const bounds=await page.locator('.guide-card').boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1,`${width}x${height} step ${step}: guide clipped`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(step===2){assert(await page.locator('#map').isVisible());assert.equal(await page.locator('#settingsToggle').getAttribute('aria-expanded'),'true');}
    if(step===3){await page.locator('#intensityNumber').fill('125');await page.locator('#intensityNumber').press('Enter');assert.equal((await page.evaluate(()=>window.TyphoonSimulator.getState())).intensity,125);}
    if(step===5)assert(await page.locator('#freeCameraButton').isVisible());
    if(step===3&&(width===390||width===844))await page.screenshot({path:path.join(root,'tmp',`指南-${width}x${height}.png`)});
    await page.locator('#nextGuideStep').click();
   }
   assert(!(await page.locator('.guide-card').isVisible()));assert.equal(await page.locator('#settingsToggle').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#settingsPanel details[open]').count(),0);
   const after=await page.evaluate(()=>window.TyphoonSimulator.getState());for(const key of ['east','north','rainStrength','eyeRadius','wallRadius','stormRadius','influenceRadius','timeScale','paused','yaw','pitch'])assert.equal(after[key],before[key],`guide changed ${key}`);assert.equal(after.intensity,125);
   await page.locator('#settingsToggle').click();await page.locator('.map-section>summary').click();await page.waitForTimeout(80);assert(await page.locator('#map').isVisible());
   assert((await page.locator('#map').evaluate(el=>el.width))>0);
   await page.locator('#guideButton').click();await page.locator('#guideChapters button').nth(4).click();assert.equal(await page.locator('#guideStepTitle').textContent(),'让风暴移动');await page.keyboard.press('Escape');assert(await page.locator('#map').isVisible());assert.equal(await page.locator('.motion-section').getAttribute('open'),null);
   if(width===1440){
    await page.locator('#guideButton').click();await page.locator('#guideChapters button').nth(7).click();await page.locator('#fullscreen').click();await page.waitForFunction(()=>document.fullscreenElement===document.querySelector('#view'));await page.locator('#view .guide-tour').waitFor({state:'visible'});await page.locator('#nextGuideStep').click();await page.evaluate(()=>document.exitFullscreen());await page.waitForFunction(()=>!document.fullscreenElement);
    await page.locator('#guideButton').click();await page.locator('#startGuide').click();assert.equal(await page.locator('.guide-tour').evaluate(el=>el.parentElement.tagName),'BODY');await page.locator('#endTour').click();
   }else{
    await page.locator('#sceneCleanToggle').click();await page.locator('#guideButton').click();await page.locator('#startGuide').click();assert(!(await page.locator('#view').evaluate(el=>el.classList.contains('clean-view'))));await page.locator('#endTour').click();assert(await page.locator('#view').evaluate(el=>el.classList.contains('clean-view')));
   }
   assert.deepEqual(errors,[]);console.log(`PASS ${width}x${height}: defaults, all 8 guide steps, live edit, restore, chapter jump, Escape, fullscreen/clean-view integration`);await context.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
