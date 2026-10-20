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
