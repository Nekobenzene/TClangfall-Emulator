const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('editor HTML contains every editable formula and verbatim first-party simulator source',async()=>{
 const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'config-editor.html'),'utf8'),match=/const FORMULA_REFERENCE=([^\n]+);\n/.exec(html);assert(match,'offline formula appendix is embedded in editor');
 const reference=JSON.parse(match[1]),catalog=require('../config-catalog.json');assert.equal(reference.formulas.length,catalog.formulas.length);assert.equal(reference.sources.length,16);assert(reference.sources.some(item=>item.file==='src/sound.js'));assert(reference.expressions.length>500);
 for(const item of reference.sources)assert.equal(item.source,fs.readFileSync(path.join(root,item.file),'utf8').replace(/\r\n/g,'\n'),item.file+' is complete and unabridged');
 for(const item of reference.formulas){const original=catalog.formulas.find(f=>f.key===item.key);assert.equal(item.expression,original.expression);assert.deepEqual(item.args,original.args);}
 for(const item of reference.expressions){const source=reference.sources.find(s=>s.file===item.file).source;assert(source.includes(item.expression));assert(item.line>0);}
 const {formulaReference}=await import('../tools/formula-reference.mjs');const probe=formulaReference([{file:'probe.js',source:'const f=x=>clamp(x*2+1,0,100); const n=2**3;'}],[]);assert(probe.expressions.some(e=>e.expression==='clamp(x*2+1,0,100)'));assert(probe.expressions.some(e=>e.expression==='2**3'));
 assert(!fs.readFileSync(path.join(root,'台风模拟器.html'),'utf8').includes('FORMULA_REFERENCE'));
 assert(!fs.readFileSync(path.join(root,'台风模拟器-可配置版.html'),'utf8').includes('FORMULA_REFERENCE'));
});
