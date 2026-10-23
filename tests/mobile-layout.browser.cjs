/* Optional real-browser regression suite. Run with Playwright on NODE_PATH. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{const file=req.url.split('?')[0]==='/simulator.config.js'?'simulator.config.js':'台风模拟器.html';res.setHeader('content-type',file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,file)));});
const sizes=[[390,844],[844,390],[667,375],[568,320],[320,568]];
fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});const results=[];
 try{
 for(const [width,height] of sizes){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'});const page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.TyphoonSimulator?.diagnostics().sceneReady);
  assert(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches));
  const baseline=await page.locator('#view').evaluate(el=>{const view=el.getBoundingClientRect(),visible=e=>!!(e.getBoundingClientRect().width&&getComputedStyle(e).visibility!=='hidden');return{view:{x:view.x,y:view.y,width:view.width,height:view.height},toolbar:visible(el.querySelector('.camera-toolbar')),zoom:visible(el.querySelector('.touch-zoom')),overflow:document.documentElement.scrollWidth>innerWidth};});
  if(width>height)assert(baseline.view.y+baseline.view.height<=height+4,`${width}x${height}: normal scene should fit landscape viewport`);
  assert(!baseline.toolbar&&!baseline.zoom&&!baseline.overflow,`${width}: panels should start collapsed`);
  await page.locator('#sceneControlsToggle').click();assert(await page.locator('#sceneToolbar').isVisible());
  await page.locator('#freeCameraButton').click();assert(!(await page.locator('#sceneToolbar').isVisible()));assert(await page.locator('#flightStick').isVisible());
  await page.locator('#fullscreen').click();await page.waitForFunction(()=>document.querySelector('#view').classList.contains('mobile-fullscreen'));
  const layout=await page.locator('#view').evaluate(el=>{
   const r=el.getBoundingClientRect(),rect=e=>{const q=e.getBoundingClientRect();return{x:q.x-r.x,y:q.y-r.y,w:q.width,h:q.height};};
   const selectors=['.view-top','.view-bottom','.flight-stick','.flight-height','.hud-metrics'];const boxes=selectors.map(s=>({selector:s,...rect(el.querySelector(s))}));const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
   const center={x:r.width*.3,y:r.height*.3,w:r.width*.4,h:r.height*.4};
   return{width:r.width,height:r.height,boxes,centralOverlap:boxes.reduce((n,b)=>n+overlap(b,center),0),pairs:boxes.flatMap((a,i)=>boxes.slice(i+1).filter(b=>overlap(a,b)>1).map(b=>[a.selector,b.selector])),coverage:boxes.reduce((n,b)=>n+b.w*b.h,0)/(r.width*r.height)};
  });
  assert.equal(layout.centralOverlap,0,`${width}x${height}: central view blocked`);assert.deepEqual(layout.pairs,[],`${width}x${height}: controls overlap`);
  for(const box of layout.boxes){assert(box.x>=-1&&box.y>=-1&&box.x+box.w<=width+1&&box.y+box.h<=height+1,`${width}x${height}: clipped ${box.selector}`);}
  assert(layout.coverage<.27,`${width}x${height}: too much permanent UI ${layout.coverage}`);
  assert(!(await page.locator('#hudMapPanel').isVisible()));
  await page.locator('#sceneMapToggle').click();assert(await page.locator('#hudMapPanel').isVisible());assert(!(await page.locator('#flightStick').isVisible()));
  await page.locator('#hudStormDragToggle').check();assert(await page.locator('#hudStormDragToggle').isChecked());
  await page.locator('#sceneMapToggle').click();assert(await page.locator('#flightStick').isVisible());
  await page.locator('#sceneHudToggle').click();assert(!(await page.locator('.hud-metrics').isVisible()));await page.locator('#sceneHudToggle').click();
  const stick=await page.locator('#flightStick').boundingBox(),before=await page.evaluate(()=>window.TyphoonSimulator.getState());
  const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:stick.x+stick.width/2,y:stick.y+8}]});
  await page.waitForTimeout(150);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const after=await page.evaluate(()=>window.TyphoonSimulator.getState());assert(Math.hypot(after.freeX-before.freeX,after.freeZ-before.freeZ)>.1);const stopped={x:after.freeX,z:after.freeZ};await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>({x:window.TyphoonSimulator.getState().freeX,z:window.TyphoonSimulator.getState().freeZ})),stopped);
  await page.locator('#sceneCleanToggle').click();assert(!(await page.locator('#flightStick').isVisible()));assert(!(await page.locator('.hud-metrics').isVisible()));assert(await page.locator('#sceneCleanToggle').isVisible());
  await page.locator('#sceneCleanToggle').click();assert(await page.locator('#flightStick').isVisible());
  await page.locator('#sceneControlsToggle').click();await page.locator('#mobileDisplaySettings').click();assert(await page.locator('.hud-settings').isVisible());
  await page.locator('#view').click({position:{x:width*.85,y:height*.35}});assert(!(await page.locator('.hud-settings').isVisible()));
  if(width===390){await page.setViewportSize({width:844,height:390});await page.waitForTimeout(80);assert(await page.locator('#flightStick').isVisible());assert((await page.evaluate(()=>window.TyphoonSimulator.getState())).freeCamera);await page.setViewportSize({width,height});}
  if(width===844||width===390)await page.screenshot({path:path.join(root,'tmp',width===844?'移动端-横屏.png':'移动端-竖屏.png')});
  assert.deepEqual(errors,[],`${width}: console errors`);results.push({size:`${width}x${height}`,uiCoverage:Math.round(layout.coverage*100)+'%',centralOverlap:layout.centralOverlap});await context.close();
 }
 const desktop=await browser.newContext({viewport:{width:1280,height:800}}),dp=await desktop.newPage();await dp.goto('http://127.0.0.1:'+server.address().port);await dp.waitForFunction(()=>window.TyphoonSimulator?.diagnostics().sceneReady);assert(await dp.locator('#freeCameraButton').isVisible());assert(!(await dp.locator('#sceneControlsToggle').isVisible()));assert(await dp.locator('.view-buttons #homeView').isVisible());assert(!(await dp.locator('#flightStick').isVisible()));await desktop.close();
 console.log('PASS: five mobile viewports, native touch flight and release, map/readout toggles, clean view, menus, rotation and desktop controls.');console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
