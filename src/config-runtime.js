/* Optional companion configuration; original literals remain the final fallback. */
const SimulatorConfig=(()=>{
 'use strict';
 let catalog=null,config={version:1,values:{},texts:{},formulas:{}},compiled=new Map(),status={source:'内置',errors:[],unknown:[]};
 const own=(o,k)=>o&&Object.prototype.hasOwnProperty.call(o,k),safeKey=k=>!['__proto__','constructor','prototype'].includes(k);
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a),0,1);return t*t*(3-2*t);};
 const functions=Object.fromEntries(['abs','min','max','pow','sqrt','cbrt','exp','log','log1p','log10','sin','cos','tan','asin','acos','atan','atan2','hypot','floor','ceil','round','sign','trunc'].map(k=>[k,Math[k]]));Object.assign(functions,{clamp,smooth});
 function expression(source,args){
  if(typeof source!=='string'||source.length>12000)throw Error('公式长度或类型无效');
  const ast=acorn.parseExpressionAt(source,0,{ecmaVersion:'latest'});if(source.slice(ast.end).trim())throw Error('只允许单个表达式');let count=0;
  function validate(node,depth=0){
   if(++count>1000||depth>60)throw Error('表达式过于复杂');
   const visit=n=>validate(n,depth+1);
   switch(node.type){
    case'Literal':if(typeof node.value!=='number'&&typeof node.value!=='boolean')throw Error('只接受数字与布尔常量');break;
    case'Identifier':if(!args.includes(node.name)&&!['PI','E'].includes(node.name))throw Error('未知变量：'+node.name);break;
    case'UnaryExpression':if(!['+','-','!'].includes(node.operator))throw Error('不支持的一元运算');visit(node.argument);break;
    case'BinaryExpression':case'LogicalExpression':if(!['+','-','*','/','%','**','<','<=','>','>=','===','!==','==','!=','&&','||','??'].includes(node.operator))throw Error('不支持的运算');visit(node.left);visit(node.right);break;
    case'ConditionalExpression':visit(node.test);visit(node.consequent);visit(node.alternate);break;
    case'MemberExpression':if(node.computed||node.object.name!=='Math'||!['PI','E'].includes(node.property.name))throw Error('只允许 Math.PI / Math.E');break;
    case'CallExpression':{
     const name=node.callee.type==='Identifier'?node.callee.name:node.callee.type==='MemberExpression'&&!node.callee.computed&&node.callee.object.name==='Math'?node.callee.property.name:null;
     if(!own(functions,name)||node.arguments.length>16)throw Error('只允许已列出的数学函数');node.functionName=name;node.arguments.forEach(visit);break;
    }
    default:throw Error('不支持的表达式：'+node.type);
   }
  }
  validate(ast);
  function evaluate(n,ctx){
   switch(n.type){
    case'Literal':return n.value;
    case'Identifier':return n.name==='PI'?Math.PI:n.name==='E'?Math.E:ctx[n.name];
    case'MemberExpression':return Math[n.property.name];
    case'UnaryExpression':{const v=evaluate(n.argument,ctx);return n.operator==='-'?-v:n.operator==='+'?+v:!v;}
    case'ConditionalExpression':return evaluate(n.test,ctx)?evaluate(n.consequent,ctx):evaluate(n.alternate,ctx);
    case'CallExpression':return functions[n.functionName](...n.arguments.map(a=>evaluate(a,ctx)));
    default:{const a=evaluate(n.left,ctx);if(n.operator==='&&')return a&&evaluate(n.right,ctx);if(n.operator==='||')return a||evaluate(n.right,ctx);if(n.operator==='??')return a??evaluate(n.right,ctx);const b=evaluate(n.right,ctx);switch(n.operator){case'+':return a+b;case'-':return a-b;case'*':return a*b;case'/':return a/b;case'%':return a%b;case'**':return a**b;case'<':return a<b;case'<=':return a<=b;case'>':return a>b;case'>=':return a>=b;case'===':case'==':return a===b;case'!==':case'!=':return a!==b;}}
   }
  }
  return ctx=>{const value=evaluate(ast,ctx);if(typeof value!=='number'||!Number.isFinite(value))throw Error('公式结果不是有限数值');return value;};
 }
 function normalize(input,meta=catalog){
  if(!input||typeof input!=='object'||Array.isArray(input)||input.version!==1)throw Error('配置需要 version: 1');
  const result={version:1,values:{},texts:{},formulas:{}},errors=[],unknown=[],byKey=new Map(meta.entries.map(e=>[e.key,e]));
  for(const section of ['values','texts']){
   if(input[section]!==undefined&&(!input[section]||typeof input[section]!=='object'||Array.isArray(input[section])))throw Error(section+' 必须是对象');
   for(const [provided,value]of Object.entries(input[section]||{}).sort(([a],[b])=>Number(own(meta.aliases,a))-Number(own(meta.aliases,b)))){
    const key=meta.aliases[provided]||provided,entry=byKey.get(key);if(!entry){unknown.push(provided);continue;}
    const expected=entry.type;if((expected==='string'&&section!=='texts')||(expected!=='string'&&section!=='values')){errors.push(provided+'：分组错误');continue;}
    if(typeof value!==expected||(expected==='number'&&(!Number.isFinite(value)||(entry.integer&&!Number.isInteger(value))))||(expected==='string'&&(value.length>150000||(entry.format==='hex-color'&&!/^#(?:[\da-fA-F]{3}|[\da-fA-F]{4}|[\da-fA-F]{6}|[\da-fA-F]{8})$/.test(value))))){errors.push(provided+'：类型或数值无效，使用内置');continue;}
    result[section][key]=value;
   }
  }
  if(input.formulas!==undefined&&(!input.formulas||typeof input.formulas!=='object'||Array.isArray(input.formulas)))throw Error('formulas 必须是对象');
  for(const [key,value]of Object.entries(input.formulas||{})){
   const f=meta.formulas.find(f=>f.key===key);if(!f){unknown.push(key);continue;}
   try{expression(value,f.args);result.formulas[key]=value;}catch(e){errors.push(key+'：'+e.message);}
  }
  return{config:result,errors,unknown};
 }
 function patchText(text,patches,values,texts=config.texts){
  for(const p of [...patches].sort((a,b)=>b.start-a.start)){
   const entry=catalog.entries[p.index],overrides=entry.type==='string'?texts:values,value=own(overrides,entry.key)?overrides[entry.key]:entry.default;if(value===entry.default)continue;
   let replacement=p.string?JSON.stringify(value):p.float&&Number.isInteger(value)?value+'.0':String(value);if(p.binarySign&&value>=0)replacement='+'+replacement;text=text.slice(0,p.start)+replacement+text.slice(p.end);
  }return text;
 }
 function install(meta,input){
  catalog=meta;const parsed=normalize(input||{version:1},meta);config=parsed.config;status.errors.push(...parsed.errors);status.unknown=parsed.unknown;compiled.clear();
  globalThis.__CFG=meta.entries.map(e=>own(config[e.type==='string'?'texts':'values'],e.key)?config[e.type==='string'?'texts':'values'][e.key]:e.default);
  meta.entries.forEach((e,i)=>{if(e.patches&&globalThis.__CFG[i]===e.default)globalThis.__CFG[i]=patchText(e.default,e.patches,config.values);});
  for(const f of meta.formulas){const source=config.formulas[f.key];if(source&&source!==f.expression)compiled.set(f.key,expression(source,f.args));}
  return parsed;
 }
 async function readCompanion(){
  // file:// cannot reliably fetch JSON; the generated JS mirror keeps offline use working.
  if(location.protocol!=='file:'){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
   try{const url=new URL('simulator.config.json',location.href);url.searchParams.set('v',Date.now().toString(36));const response=await fetch(url,{signal:controller.signal,cache:'no-store'});if(response.ok){const input=await response.json();if(input&&typeof input==='object'&&!Array.isArray(input))return{input,file:'simulator.config.json'};}}catch{}finally{clearTimeout(timer);}
  }
  return new Promise(resolve=>{
   const script=document.createElement('script');let settled=false;
   const finish=input=>{if(settled)return;settled=true;clearTimeout(timer);resolve({input,file:input?'simulator.config.js':null});};
   const timer=setTimeout(()=>finish(null),5000),url=new URL('simulator.config.js',location.href);url.searchParams.set('v',Date.now().toString(36));script.src=url.href;script.onload=()=>finish(globalThis.TYPHOON_CONFIG||null);script.onerror=()=>finish(null);document.head.append(script);
  });
 }
 async function load(meta){
  catalog=meta;let input=null;
  if(new URL(location.href).searchParams.has('configPreview')&&(window.opener||window.parent!==window)){
   input=await new Promise(resolve=>{const source=window.opener||window.parent;const receive=e=>{if(e.source!==source||e.data?.type!=='typhoon-config-preview')return;clearTimeout(timer);window.removeEventListener('message',receive);source.postMessage({type:'typhoon-config-received'},'*');resolve(e.data.config);};const timer=setTimeout(()=>{window.removeEventListener('message',receive);resolve(null);},3500);window.addEventListener('message',receive);});
   if(input)status.source='编辑器预览';
  }
  if(!input){
   const companion=await readCompanion();input=companion.input;status.file=companion.file;status.source=input?'同目录配置':'内置';
  }
  try{install(meta,input);}catch(e){status.errors.push(e.message);install(meta,null);status.source='内置（配置无效）';}
  applyDocument();return api;
 }
 function applyDocument(){
  const pool=globalThis.__CFG;for(const el of document.querySelectorAll('[data-config-attrs]')){
   for(const [name,index]of Object.entries(JSON.parse(el.dataset.configAttrs))){if(!safeKey(name))continue;el.setAttribute(name,String(pool[index]));}
  }
  const walker=document.createTreeWalker(document,128);let node;while(node=walker.nextNode()){const m=/^cfg:(\d+)$/.exec(node.nodeValue);if(m&&node.nextSibling?.nodeType===3)node.nextSibling.nodeValue=String(pool[+m[1]]);}
  const style=document.querySelector('style');if(style&&catalog.css)style.textContent=patchText(catalog.css.source,catalog.css.patches,config.values);
 }
 function formula(key,fallback,context){const fn=compiled.get(key);if(!fn)return fallback();try{return fn(context);}catch(e){if(!status.errors.some(s=>s.startsWith(key+'：')))status.errors.push(key+'：'+e.message+'，使用内置');return fallback();}}
 function defaults(meta=catalog){const result={version:1,values:{},texts:{},formulas:{}};for(const e of meta.entries)result[e.type==='string'?'texts':'values'][e.key]=e.default;for(const f of meta.formulas)result.formulas[f.key]=f.expression;return result;}
 function parseFile(text){text=text.replace(/^\uFEFF/,'').trim();if(text.startsWith('{'))return JSON.parse(text);const m=/^(?:globalThis|window)\.TYPHOON_CONFIG\s*=\s*([\s\S]*?)\s*;?\s*$/.exec(text);if(!m)throw Error('仅接受 JSON 或编辑器导出的 TYPHOON_CONFIG 配置');return JSON.parse(m[1]);}
 const api={load,readCompanion,install,normalize,expression,formula,defaults,parseFile,diagnostics:()=>({...status,errors:[...status.errors],unknown:[...status.unknown],overrides:Object.keys(config.values).length+Object.keys(config.texts).length+compiled.size}),getCatalog:()=>catalog};
 return api;
})();
globalThis.SimulatorConfig=SimulatorConfig;
if(typeof module!=='undefined'&&module.exports)module.exports=SimulatorConfig;
