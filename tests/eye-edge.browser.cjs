/* Near the eye boundary, validate the actual cloud shader and narrow rain entrance. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{res.setHeader('content-type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,'台风模拟器.html')));});
fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>TyphoonSimulator?.diagnostics().sceneReady);
 await page.evaluate(()=>{for(const [id,value] of [['intensityNumber',200],['timeScale',1],['east',0],['north',-14.7]]){const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));}});
 await page.locator('#freeCameraButton').click();await page.locator('#view').focus();for(let i=0;i<12;i++)await page.keyboard.press('ArrowUp');
 const rain=[];
 for(const radius of [14.7,14.8,14.9,15,15.3]){
  await page.evaluate(r=>{const e=document.getElementById('north');e.value=-r;e.dispatchEvent(new Event('change',{bubbles:true}));},radius);
  await page.waitForFunction(()=>Math.abs(TyphoonSimulator.getWeather().rain-TyphoonSimulator.getTarget().rain)<.01);
  const start=await page.evaluate(()=>TyphoonSimulator.diagnostics().renderedFrames);await page.waitForFunction(n=>TyphoonSimulator.diagnostics().renderedFrames>n+3,start);
  rain.push({radius,rain:await page.evaluate(()=>TyphoonSimulator.getTarget().rain)});await page.locator('#view').screenshot({path:path.join(root,'tmp','眼墙下缘-'+radius+'km.png')});
 }
 assert.equal(rain[0].rain,0);assert.ok(rain[1].rain>.05);assert.ok(rain[2].rain>rain[1].rain);assert.ok(rain.at(-1).rain>60);
 await page.setViewportSize({width:844,height:390});await page.locator('#view').screenshot({path:path.join(root,'tmp','眼墙入口-手机横屏.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);console.log('PASS: restored eye-wall shader, rain begins at 14.8 km and reaches wall strength by 15.3 km, landscape and no WebGL errors.');console.log(JSON.stringify(rain));
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
