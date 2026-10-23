const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../台风模拟器.html'),'utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
assert.equal(scripts.length,3);
for(const [,attributes,code] of scripts){assert.ok(!/\bsrc\s*=/i.test(attributes));new vm.Script(code);}
assert.ok(!html.includes('/* THREE */')&&!html.includes('/* APP */')&&!html.includes('/* MODEL */')&&!html.includes('/* STYLE */'));
assert.ok(!/<(?:link|img|iframe)\b[^>]*(?:src|href)\s*=\s*["']https?:/i.test(html));
assert.ok(html.includes('The MIT License')&&html.includes('2010-2023'));
const app=fs.readFileSync(require('node:path').join(__dirname,'../src/app.js'),'utf8');
assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(app));
console.log('PASS: all 3 inline scripts parse; assets embedded; no remote script, style, image or application requests; MIT license retained.');
assert.ok(!html.includes('configuration-link"')&&!html.includes('config-editor.html'));
assert.ok(!html.includes('TYPHOON_CONFIG')&&!html.includes('function readCompanion'));
const path=require('node:path'),root=path.join(__dirname,'..'),configurable=fs.readFileSync(path.join(root,'台风模拟器-可配置版.html'),'utf8');
assert.ok(configurable.includes('href="./config-editor.html"')&&configurable.includes('simulator.config.json'));
const configScripts=[...configurable.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];assert.equal(configScripts.length,3);for(const [,attributes,code]of configScripts){assert.ok(!/\bsrc\s*=/i.test(attributes));new vm.Script(code);}
const json=JSON.parse(fs.readFileSync(path.join(root,'simulator.config.json'),'utf8')),configContext={};vm.runInNewContext(fs.readFileSync(path.join(root,'simulator.config.js'),'utf8'),configContext);assert.equal(JSON.stringify(json),JSON.stringify(configContext.TYPHOON_CONFIG));assert.equal(json.version,1);assert.ok(Object.keys(json.values).length>1000&&Object.keys(json.texts).length>100);
if(fs.existsSync(path.join(root,'_site/index.html')))assert.equal(fs.readFileSync(path.join(root,'_site/index.html'),'utf8'),html);
console.log('PASS: both HTML variants parse, built-in version has no editor/loader, JSON and offline JS match, Pages uses built-in version.');
