import fs from 'node:fs';
import {configurationBuild} from './tools/config-build.mjs';
import {formulaReference} from './tools/formula-reference.mjs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const appNames=['sliders','sites','camera','touch','mobile-view','guide','view-effects','wind-colors','map','scenery','flood-debris','eye-wall','app'];
const template=read('./src/index.source.html');
const configBuild=configurationBuild();
let html=configBuild.markup(template);
const model=configBuild.javascript(read('./src/model.js'),'model');
const app=appNames.map(name=>configBuild.javascript(read('./src/'+name+'.js'),name)).join('\n')+'\n'+configBuild.javascript(read('./src/formula-reference.js'),'formula-reference');
const css=configBuild.stylesheet(read('./src/style.css')+'\n'+read('./src/formula-reference.css')),catalog=configBuild.finish(css);
const runtime=read('./tools/vendor/acorn.cjs')+'\n'+read('./src/config-runtime.js');
const inlineJSON=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const minimalCatalog={...catalog,entries:catalog.entries.map(({key,default:value,type,integer,format,patches})=>({key,default:value,type,integer,format,patches}))};
const modelBoot=runtime+'\nwindow.SimulatorReady=(async()=>{await SimulatorConfig.load('+inlineJSON(minimalCatalog)+');\n'+model+'\n})();';
const reference=formulaReference(['model',...appNames].map(name=>({file:'src/'+name+'.js',source:read('./src/'+name+'.js').replace(/\r\n/g,'\n')})),catalog.formulas);
const appBoot='window.SimulatorReady.then(()=>{\nconst FORMULA_REFERENCE='+inlineJSON(reference)+';\n'+app+'\n}).catch(error=>{console.error(error);document.getElementById("renderError").hidden=false;document.getElementById("loading").hidden=true;});';
for(const [tag,source]of [['STYLE',css.source],['THREE',read('./three-vendor.min.js')],['MODEL',modelBoot],['APP',appBoot]])html=html.replace(`/* ${tag} */`,()=>source.replace(/<\/script/gi,'<\\/script'));
const defaults={version:1,values:{},texts:{},formulas:{}};
for(const entry of catalog.entries)defaults[entry.type==='string'?'texts':'values'][entry.key]=entry.default;
for(const formula of catalog.formulas)defaults.formulas[formula.key]=formula.expression;
fs.writeFileSync(new URL('./config-catalog.json',import.meta.url),JSON.stringify(catalog,null,2)+'\n');
const jsonURL=new URL('./simulator.config.json',import.meta.url),jsURL=new URL('./simulator.config.js',import.meta.url);
if(process.argv.includes('--reset-config')||!fs.existsSync(jsonURL)){
  const existing=fs.existsSync(jsURL)?/^(?:globalThis|window)\.TYPHOON_CONFIG\s*=\s*([\s\S]*?)\s*;?\s*$/.exec(read('./simulator.config.js').trim()):null;
  const initial=structuredClone(defaults);
  if(!process.argv.includes('--reset-config')&&existing){const previous=JSON.parse(existing[1]);for(const section of ['values','texts','formulas'])Object.assign(initial[section],previous[section]||{});}
  fs.writeFileSync(jsonURL,JSON.stringify(initial,null,2)+'\n');
}
// JSON is the editable source; mirror it to JS for browsers opening file:// HTML.
fs.writeFileSync(jsURL,'globalThis.TYPHOON_CONFIG = '+JSON.stringify(JSON.parse(fs.readFileSync(jsonURL,'utf8').replace(/^\uFEFF/,'')),null,2)+';\n');
const editor=read('./src/config-editor.source.html').replace('/* EDITOR_STYLE */',()=>read('./src/config-editor.css')).replace('/* EDITOR_SCRIPT */',()=>(runtime+'\nconst CONFIG_CATALOG='+inlineJSON(catalog)+';\n'+read('./src/config-editor.js')).replace(/<\/script/gi,'<\\/script'));
fs.writeFileSync(new URL('./config-editor.html',import.meta.url),editor+'\n<!-- Acorn license\n'+read('./tools/vendor/ACORN-LICENSE.txt')+'\n-->\n');
let builtin=template.replace(/<a\b[^>]*\bclass="configuration-link"[^>]*>[\s\S]*?<\/a>/,'');
for(const [tag,source]of [['STYLE',read('./src/style.css')],['THREE',read('./three-vendor.min.js')],['MODEL',read('./src/model.js')],['APP',appNames.map(name=>read('./src/'+name+'.js')).join('\n')]])builtin=builtin.replace(`/* ${tag} */`,()=>source.replace(/<\/script/gi,'<\\/script'));
for(const [name,path]of [['Project license','./LICENSE'],['Third-party license: Three.js r160','./THREE-LICENSE.txt']])builtin+=`\n<!-- ${name}\n${read(path).replace(/-->/g,'-- >')}\n-->\n`;
html += `\n<!-- Project license\n${read('./LICENSE').replace(/-->/g, '-- >')}\n-->\n`;
html += `\n<!-- Third-party license: Three.js r160\n${read('./THREE-LICENSE.txt').replace(/-->/g, '-- >')}\n-->\n`;
html += `\n<!-- Configuration expression parser: Acorn\n${read('./tools/vendor/ACORN-LICENSE.txt')}\n-->\n`;
fs.writeFileSync(new URL('./台风模拟器.html', import.meta.url), builtin);
fs.writeFileSync(new URL('./台风模拟器-可配置版.html', import.meta.url), html);
console.log('Built 内置参数版: '+Buffer.byteLength(builtin)+' bytes; 可配置版: '+Buffer.byteLength(html)+' bytes');
if (process.argv.includes('--pages')) {
  const site = new URL('./_site/', import.meta.url);
  fs.mkdirSync(site, { recursive: true });
  fs.writeFileSync(new URL('index.html', site), builtin);
  for(const name of ['台风模拟器.html','台风模拟器-可配置版.html','simulator.config.json','simulator.config.js','config-editor.html','config-catalog.json'])fs.copyFileSync(new URL('./'+name,import.meta.url),new URL(name,site));
  fs.writeFileSync(new URL('.nojekyll', site), '');
  console.log('Built GitHub Pages site: _site/index.html');
}
