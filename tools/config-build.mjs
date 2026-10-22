import fs from 'node:fs';
import acorn from './vendor/acorn.cjs';
export function configurationBuild(){
 const entries=[],formulas=[],counts=new Map();
 const add=(key,value,meta={})=>{const index=entries.length;entries.push({key,default:value,...meta});return index;};
 const id=(prefix,kind)=>{const stem=prefix+'.'+kind,n=counts.get(stem)||0;counts.set(stem,n+1);return stem+'.'+n;};
 const apply=(source,patches)=>{for(const p of patches.sort((a,b)=>b.start-a.start))source=source.slice(0,p.start)+p.text+source.slice(p.end);return source;};
 function embedded(source,prefix,language){
  const patches=[],pattern=/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[\da-fA-F]{3,8}\b|[A-Za-z_$][\w$-]*|[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?/g;
  for(const m of source.matchAll(pattern)){
   if(language==='css'&&/^#[\da-fA-F]{3,8}$/.test(m[0])){const index=add(id(prefix,'color'),m[0],{type:'string',group:'css',format:'hex-color',file:'src/style.css',context:source.slice(Math.max(0,m.index-50),m.index+90)});patches.push({start:m.index,end:m.index+m[0].length,index,rawString:true,raw:m[0]});continue;}
   if(language==='css'&&/^["']/.test(m[0])){const value=m[0].slice(1,-1),index=add(id(prefix,'text'),value,{type:'string',group:/[\u3400-\u9fff]/.test(value)?'ui':'strings',file:'src/style.css',context:source.slice(Math.max(0,m.index-50),m.index+90)});patches.push({start:m.index,end:m.index+m[0].length,index,string:true,raw:m[0]});continue;}
   if(!/^[+-]?(?:\d|\.\d)/.test(m[0]))continue;const value=Number(m[0]);if(!Number.isFinite(value))continue;
   const key=id(prefix,'number'),index=add(key,value,{type:'number',group:language,file:language==='css'?'src/style.css':'src/'+prefix.split('.')[0]+'.js',context:source.slice(Math.max(0,m.index-65),m.index+65),integer:language==='shader'&&!/[.eE]/.test(m[0])});
   patches.push({start:m.index,end:m.index+m[0].length,index,float:language==='shader'&&/[.eE]/.test(m[0]),binarySign:/^[+-]/.test(m[0])&&/[\w).\]]/.test(source.slice(0,m.index).trimEnd().slice(-1)),raw:m[0]});
  }
  return patches;
 }
 function javascript(source,file){
  source=source.replace(/\r\n/g,'\n');const ast=acorn.parse(source,{ecmaVersion:'latest',locations:true}),patches=[];
  function walk(node,parents=[]){
   const parent=parents.at(-1),scope=parents.filter(n=>/Function/.test(n.type)).map(n=>n.id?.name||((parents[parents.indexOf(n)-1]?.type==='VariableDeclarator')?parents[parents.indexOf(n)-1].id.name:null)).filter(Boolean);
   const binding=[...parents].reverse().find(n=>n.type==='VariableDeclarator'&&n.id.type==='Identifier')?.id.name;
   const properties=parents.filter(n=>n.type==='Property'&&!n.computed).map(n=>n.key.name??n.key.value);
   const prefix=[file,...scope,binding,...properties].filter(Boolean).join('.');
   const meta={file:'src/'+file+'.js',line:node.loc.start.line,scope:[...scope,binding,...properties].filter(Boolean).join(' / '),context:source.slice(Math.max(0,node.start-65),Math.min(source.length,node.end+65)).replace(/\n/g,' ')};
   if(node.type==='CallExpression'&&node.callee.name==='configured'&&node.arguments[0]?.type==='Literal'){
    const [key,fallback,context]=node.arguments;
    formulas.push({key:key.value,expression:source.slice(fallback.body.start,fallback.body.end),args:context.properties.map(p=>p.key.name),...meta});
   }
   if(node.type==='Literal'&&!node.regex&&!(parent?.type==='Property'&&parent.key===node&&!parent.computed)&&!(parent?.type==='CallExpression'&&parent.callee.name==='configured'&&parent.arguments[0]===node)){
    if(['number','boolean','string'].includes(typeof node.value)){
     const signed=typeof node.value==='number'&&parent?.type==='UnaryExpression'&&['-','+'].includes(parent.operator),value=signed?(parent.operator==='-'?-node.value:node.value):node.value;
     const kind=typeof value,hash=value=>{let n=2166136261;for(const c of String(value))n=Math.imul(n^c.charCodeAt(0),16777619);return(n>>>0).toString(16);},signature=kind==='string'?hash(value):String(value).replace(/[^\w]/g,'_'),key=id(prefix,kind+'.'+signature),entry={...meta,type:kind,group:kind==='string'?(/[\u3400-\u9fff]/.test(value)?'ui':'strings'):'numbers'};
     if(kind==='string'&&/gl_Position|gl_FragColor|uniform |varying /.test(node.value)){entry.group='shader';entry.patches=embedded(node.value,key,'shader');}
     const index=add(key,value,entry);patches.push({start:signed?parent.start:node.start,end:signed?parent.end:node.end,text:`__CFG[${index}]`});
    }
   }
   if(node.type==='TemplateElement'&&node.value.cooked){
    const key=id(prefix,'template'),entry={...meta,type:'string',group:/[\u3400-\u9fff]/.test(node.value.cooked)?'ui':'strings'};
    if(/gl_Position|gl_FragColor|uniform |varying /.test(node.value.cooked)){entry.group='shader';entry.patches=embedded(node.value.cooked,key,'shader');}
    const index=add(key,node.value.cooked,entry);patches.push({start:node.start,end:node.end,text:'${__CFG['+index+']}'});
   }
   for(const [key,value]of Object.entries(node)){if(key==='loc')continue;if(Array.isArray(value)){for(const child of value)if(child?.type)walk(child,[...parents,node]);}else if(value?.type)walk(value,[...parents,node]);}
  }
  walk(ast);const output=apply(source,patches);acorn.parse(output,{ecmaVersion:'latest'});return output;
 }
 function markup(html){
  const patches=[];let skip=false;
  const attrs=new Set(['title','aria-label','placeholder','min','max','step','value','width','height']);
  for(const token of html.matchAll(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g)){
   const raw=token[0],start=token.index;if(/^<(style|script)\b/.test(raw)){skip=true;continue;}if(/^<\/(style|script)>/.test(raw)){skip=false;continue;}if(skip||raw.startsWith('<!--'))continue;
   if(raw.startsWith('<')&&!/^<\//.test(raw)){
    const mapping={};for(const match of raw.matchAll(/([^\s=<>]+)\s*=\s*("([^"]*)"|'([^']*)')/g)){
     const attr=match[1],value=match[3]??match[4];if(!attrs.has(attr)||!value)continue;
     const numeric=/^[+-]?(?:\d*\.\d+|\d+\.?\d*)$/.test(value),key=id('html.'+(/\bid="([^"]+)"/.exec(raw)?.[1]||raw.match(/^<(\w+)/)?.[1]||'element')+'.'+attr,numeric?'number':'text');
     mapping[attr]=add(key,numeric?Number(value):value,{type:numeric?'number':'string',group:numeric?'html':'ui',file:'src/index.source.html',context:raw});
    }
    if(Object.keys(mapping).length){const end=start+raw.lastIndexOf('>');patches.push({start:end,end,text:" data-config-attrs='"+JSON.stringify(mapping)+"'"});}
   }else if(!raw.startsWith('<')&&raw.trim()){
    const value=raw.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"),index=add(id('html','text'),value,{type:'string',group:'ui',file:'src/index.source.html',context:html.slice(Math.max(0,start-75),start+raw.length+75)});
    patches.push({start,end:start,text:`<!--cfg:${index}-->`});
   }
  }
  return apply(html,patches);
 }
 function stylesheet(css){return{source:css,patches:embedded(css,'style','css')};}
 function finish(css){return{version:1,entries,formulas,css,aliases:{
  'eye.cloudRotationRatio':entries.find(e=>e.file==='src/eye-wall.js'&&e.scope?.endsWith('cloudPhase')&&e.type==='number')?.key,
  'eye.cloudClearIntensity':entries.find(e=>e.file==='src/eye-wall.js'&&e.scope?.endsWith('eyeClouds')&&e.default===190)?.key,
  'weather.eyeRainStopsAt':entries.find(e=>e.file==='src/model.js'&&e.scope?.endsWith('eyeClearing')&&e.default===100)?.key,
  'weather.eyeSunStartsAt':entries.find(e=>e.file==='src/model.js'&&e.scope?.endsWith('eyeSun')&&e.default===145)?.key,
  'weather.eyeSunFullAt':entries.find(e=>e.file==='src/model.js'&&e.scope?.endsWith('eyeSun')&&e.default===180)?.key
 }};}
 return{javascript,markup,stylesheet,finish};
}
