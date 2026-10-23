/* Read-only formula and source reference, embedded in the configuration editor. */
(()=>{
 'use strict';
 const data=FORMULA_REFERENCE,make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
 const names={'eye.development':'眼与眼墙结构形成','eye.rainClearing':'眼中心降雨减弱','wind.profile':'径向持续风速分布','weather.eyeSun':'风眼日照','weather.rain':'本地雨强','weather.visibility':'能见度','surge.level':'风暴潮目标水位','surge.responseSeconds':'风暴潮涨退响应时间','eye.wallHeight':'眼墙高度','eye.cloudCoverage':'眼内低中云覆盖','eye.angularSpeed':'眼墙角速度'};
 const panel=document.getElementById('formulaReference');
 const header=make('header'),heading=make('h2','计算公式与完整源码');heading.id='formulaReferenceTitle';header.append(heading);
 const intro=make('p','这里附上当前构建的全部第一方模拟源码、从源码自动提取的计算表达式，以及可编辑公式的变量与内置表达式。包括风雨、风场、能见度、风暴潮、眼墙、粒子、风毁、相机和地图。第三方 Three.js 不在此重复。此页为只读的内置参考；修改与试算请切换左侧“计算公式”，具体数值可在其他参数分类调整。','formula-reference-intro');
 const units=make('p','单位：风速 kt；模型距离 km；场景距离、水位与能见度 m；角度和时间以各式变量所在源码为准（包含 rad、度、模拟秒与分钟）。clamp(x,a,b)=max(a,min(b,x))；smooth(a,b,x)=t²(3−2t)，t=clamp((x−a)/(b−a),0,1)。','formula-reference-intro');
 const nav=make('nav'),filters=make('div',undefined,'formula-reference-filters'),search=make('input'),files=make('select'),count=make('p'),body=make('section'),pager=make('nav'),previous=make('button','上一页'),info=make('span'),next=make('button','下一页');
 search.type='search';search.placeholder='搜索变量、公式或源码';search.setAttribute('aria-label','搜索计算公式');files.setAttribute('aria-label','按公式源文件筛选');files.append(new Option('所有源文件',''));for(const source of data.sources)files.append(new Option(source.file,source.file));filters.append(search,files);pager.append(previous,info,next);
 let tab='formulas',page=0;const tabs=[];
 function render(){
  const query=search.value.trim().toLowerCase(),file=files.value,items=data[tab].filter(item=>(!file||item.file===file)&&(!query||[item.key,item.name,item.expression,item.file,item.source,...(item.args||[])].join(' ').toLowerCase().includes(query))),size=tab==='sources'?data.sources.length:30,pages=Math.max(1,Math.ceil(items.length/size));page=Math.min(page,pages-1);body.replaceChildren();
  for(const item of items.slice(page*size,(page+1)*size)){
   if(tab==='sources'){const details=make('details'),summary=make('summary',item.file+' · '+item.source.split('\n').length+' 行'),pre=make('pre',item.source);details.className='formula-reference-source';details.append(summary,pre);body.append(details);continue;}
   const article=make('article'),title=make('h3',tab==='formulas'?(names[item.key]||item.key):item.name),location=make('small',item.file+':'+item.line+(item.key?' · '+item.key:''));article.append(title,location);if(item.args)article.append(make('p','输入变量：'+item.args.join(', ')));article.append(make('pre',item.expression));body.append(article);
  }
  if(!items.length)body.append(make('p','没有匹配的公式或源码。'));count.textContent=items.length+' 项 · '+data.formulas.length+' 个可编辑公式 / '+data.expressions.length+' 条计算表达式 / '+data.sources.length+' 份完整源码';info.textContent=(page+1)+' / '+pages;previous.disabled=page===0;next.disabled=page>=pages-1;pager.hidden=tab==='sources';
 }
 for(const [key,label]of [['formulas','可编辑公式'],['expressions','全部计算表达式'],['sources','完整源码']]){const item=make('button',label);item.type='button';item.setAttribute('aria-pressed',String(key===tab));item.onclick=()=>{tab=key;page=0;for(const [name,other]of tabs)other.setAttribute('aria-pressed',String(name===key));render();};tabs.push([key,item]);nav.append(item);}
 search.oninput=files.onchange=()=>{page=0;render();};previous.onclick=()=>{page--;render();};next.onclick=()=>{page++;render();};
 panel.append(header,intro,units,nav,filters,count,body,pager);
 window.FormulaReference={refresh:render,diagnostics:()=>({formulas:data.formulas.length,expressions:data.expressions.length,sourceFiles:data.sources.length})};
})();
