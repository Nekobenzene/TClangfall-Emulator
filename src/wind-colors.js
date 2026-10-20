/* Wind-speed palettes. Node editing and shared mapping inspired by IR-enhancer; independent implementation. */
const WindColorScales=(()=>{
  const make=(name,colors,values=[0,34,67,100,140,200])=>({name,unit:'kt',interpolation:'linear',nodes:colors.map((color,i)=>({value:values[i],color}))});
  const presets=[
    make('海岸 · 默认',['#112c3c','#348b97','#bec885','#e1a261','#c04d5e','#e9d3f0']),
    make('经典气象彩虹',['#102754','#00a9db','#28c45c','#f2e943','#f47724','#a200b3']),
    make('青绿黄 · Viridis',['#440154','#414487','#2a788e','#22a884','#7ad151','#fde725']),
    make('暗紫火焰 · Inferno',['#000004','#420a68','#932667','#dd513a','#fca50a','#fcffa4']),
    make('灰阶',['#17242d','#ffffff'],[0,200]),
    {...make('风级分段',['#243a4d','#329ac6','#48b774','#f3d44a','#f2933b','#dc4c59','#b46add'],[0,34,64,83,96,113,137]),interpolation:'step'}
  ];
  function validate(raw){
    if(!raw||raw.unit!=='kt')throw Error('色标单位必须是 kt（风速），不能直接使用温度色标。');
    if(!Array.isArray(raw.nodes)||raw.nodes.length<2||raw.nodes.length>64)throw Error('请保留 2–64 个节点。');
    const nodes=raw.nodes.map(n=>{const value=Number(n.value),color=String(n.color||'');if(!Number.isFinite(value)||value<0||value>300)throw Error('节点风速须为 0–300 kt。');if(!/^#[0-9a-f]{6}$/i.test(color))throw Error('颜色请填写 #RRGGBB。');return{value:Math.round(value*100)/100,color:color.toLowerCase()};}).sort((a,b)=>a.value-b.value);
    if(nodes.at(-1).value===nodes[0].value)throw Error('至少需要两个不同风速位置。');
    for(let i=2;i<nodes.length;i++)if(nodes[i].value===nodes[i-2].value)throw Error('同一风速最多可放两个节点。');
    return{name:String(raw.name||'自定义风场').trim().slice(0,60)||'自定义风场',unit:'kt',interpolation:raw.interpolation==='step'?'step':'linear',nodes};
  }
  function mapper(raw){
    const scale=validate(raw),nodes=scale.nodes.map(n=>({...n,rgb:[1,3,5].map(i=>parseInt(n.color.slice(i,i+2),16))}));
    return v=>{if(v<nodes[0].value)return nodes[0].rgb;let i=0;while(i<nodes.length-1&&nodes[i+1].value<=v)i++;const a=nodes[i],b=nodes[i+1];if(!b||scale.interpolation==='step')return a.rgb;const f=Math.max(0,Math.min(1,(v-a.value)/(b.value-a.value)));return a.rgb.map((c,k)=>Math.round(c+(b.rgb[k]-c)*f));};
  }
  function createController({onChange}){
    const $=id=>document.getElementById(id),key='coastal.windColors.v1';let current=validate(presets[0]),saved=[],revision=0;
    try{const data=JSON.parse(localStorage.getItem(key)||'null');if(data){current=validate(data.current);saved=(data.saved||[]).slice(0,24).map(validate);}}catch(e){}
    let map=mapper(current);
    function persist(){try{localStorage.setItem(key,JSON.stringify({current,saved}));return true;}catch(e){$('paletteMessage').textContent='浏览器未允许保存；当前色标仍生效，可导出 JSON。';return false;}}
    function legend(host){
      host.replaceChildren();host.classList.add('wind-color-legend');const c=document.createElement('canvas');c.width=600;c.height=16;c.setAttribute('aria-label',current.name+'，风速色标 kt');const ctx=c.getContext('2d'),pixels=ctx.createImageData(600,16),lo=current.nodes[0].value,hi=current.nodes.at(-1).value;
      for(let x=0;x<600;x++){const rgb=map(lo+(hi-lo)*x/599);for(let y=0;y<16;y++){const k=(y*600+x)*4;pixels.data[k]=rgb[0];pixels.data[k+1]=rgb[1];pixels.data[k+2]=rgb[2];pixels.data[k+3]=255;}}ctx.putImageData(pixels,0,0);host.appendChild(c);
      const labels=document.createElement('span');labels.className='wind-color-ticks';for(let i=0;i<5;i++){const s=document.createElement('span');s.textContent=Number((lo+(hi-lo)*i/4).toFixed(1))+(i===4?' kt':'');labels.appendChild(s);}host.appendChild(labels);host.title=current.name+' · '+(current.interpolation==='step'?'分段':'连续')+' · 范围外使用端点颜色';
    }
    function renderLegends(){for(const el of document.querySelectorAll('.field-colorbar,#smallFieldLegend,#hudMapPanel>small,#palettePreview'))legend(el);}
    function options(){const select=$('palettePreset');select.replaceChildren();for(const [i,p]of presets.entries())select.add(new Option(p.name,'p'+i));for(const [i,p]of saved.entries())select.add(new Option('我的 · '+p.name,'s'+i));select.add(new Option('当前自定义','custom'));select.value='custom';}
    function rows(){
      $('paletteName').value=current.name;$('paletteInterpolation').value=current.interpolation;$('paletteNodes').replaceChildren();
      current.nodes.forEach((node,i)=>{const row=document.createElement('div');row.className='palette-node';
        const speed=document.createElement('input');speed.type='number';speed.min=0;speed.max=300;speed.step=.1;speed.value=node.value;speed.setAttribute('aria-label','节点 '+(i+1)+' 风速 kt');
        const picker=document.createElement('input');picker.type='color';picker.value=node.color;picker.setAttribute('aria-label','节点 '+(i+1)+' 颜色');
        const hex=document.createElement('input');hex.value=node.color;hex.maxLength=7;hex.setAttribute('aria-label','节点 '+(i+1)+' HEX');
        const remove=document.createElement('button');remove.textContent='删除';remove.disabled=current.nodes.length<=2;remove.setAttribute('aria-label','删除节点 '+(i+1));
        speed.onchange=()=>edit(i,{value:speed.value});picker.oninput=()=>{hex.value=picker.value;edit(i,{color:picker.value},false);};hex.onchange=()=>edit(i,{color:hex.value});remove.onclick=()=>{const next=structuredClone(current);next.nodes.splice(i,1);apply(next);};
        row.append(speed,picker,hex,remove);$('paletteNodes').appendChild(row);
      });
    }
    function apply(raw,rebuild=true){try{current=validate(raw);map=mapper(current);revision++;$('paletteMessage').textContent='已应用：'+current.name;renderLegends();if(rebuild)rows();$('palettePreset').value='custom';persist();onChange();return true;}catch(e){$('paletteMessage').textContent=e.message;return false;}}
    function edit(i,patch,rebuild=true){const next=structuredClone(current);Object.assign(next.nodes[i],patch);apply(next,rebuild);}
    function bind(){
      const modal=document.createElement('dialog');modal.id='paletteDialog';modal.className='palette-dialog';modal.setAttribute('aria-labelledby','paletteTitle');
      modal.innerHTML='<div class="section-heading"><h2 id="paletteTitle">风场色标</h2><button id="closePalette">关闭 ×</button></div><p class="palette-help">风速节点以 kt 为单位，颜色变化不改变风场。节点可增删；连续模式下相邻同速节点可形成颜色跳变。</p><label class="palette-label">预设 / 我的色标 <select id="palettePreset" aria-label="风场色标预设"></select></label><div id="palettePreview"></div><div class="palette-meta"><label>名称 <input id="paletteName" maxlength="60"></label><label>插值 <select id="paletteInterpolation"><option value="linear">连续 RGB</option><option value="step">分段色阶</option></select></label></div><div class="palette-node-head"><span>风速 kt</span><span>颜色 / HEX</span></div><div id="paletteNodes"></div><div class="palette-actions"><button id="addPaletteNode">添加节点</button><button id="savePalette">保存到我的色标</button></div><p id="paletteMessage" role="status"></p><details class="palette-json"><summary>导入 / 导出 JSON</summary><textarea id="paletteJson" aria-label="风场色标 JSON" spellcheck="false" placeholder="粘贴风场色标 JSON"></textarea><div class="palette-actions"><button id="importPalette">应用 JSON</button><button id="exportPalette">生成 JSON</button></div></details>';
      // Place under the view so its dialog remains usable in native fullscreen too.
      $('view').appendChild(modal);options();rows();renderLegends();
      const open=()=>{modal.showModal();renderLegends();};$('openPalette').onclick=open;$('largeOpenPalette').onclick=open;$('hudOpenPalette').onclick=open;$('closePalette').onclick=()=>modal.close();
      $('palettePreset').onchange=e=>{const v=e.target.value;if(v==='custom')return;const p=v[0]==='p'?presets[Number(v.slice(1))]:saved[Number(v.slice(1))];apply(p);$('palettePreset').value=v;};
      $('paletteName').onchange=()=>apply({...current,name:$('paletteName').value});$('paletteInterpolation').onchange=()=>apply({...current,interpolation:$('paletteInterpolation').value});
      $('addPaletteNode').onclick=()=>{if(current.nodes.length>=64){$('paletteMessage').textContent='最多 64 个节点。';return;}let a=current.nodes[0],b=current.nodes[1];for(let i=1;i<current.nodes.length;i++)if(current.nodes[i].value-current.nodes[i-1].value>b.value-a.value){a=current.nodes[i-1];b=current.nodes[i];}const value=Math.round((a.value+b.value)*50)/100,color='#'+map(value).map(n=>n.toString(16).padStart(2,'0')).join('');apply({...current,nodes:[...current.nodes,{value,color}]});};
      $('savePalette').onclick=()=>{const i=saved.findIndex(p=>p.name===current.name);if(i>=0)saved[i]=structuredClone(current);else saved.push(structuredClone(current));saved=saved.slice(-24);options();if(persist())$('paletteMessage').textContent='已保存到我的色标：'+current.name;};
      $('exportPalette').onclick=()=>{$('paletteJson').value=JSON.stringify(current,null,2);$('paletteMessage').textContent='JSON 已生成，可复制保存。';};
      $('importPalette').onclick=()=>{try{const raw=JSON.parse($('paletteJson').value);if(apply(raw))$('paletteMessage').textContent='JSON 色标已应用。';}catch(e){$('paletteMessage').textContent='JSON 格式错误：'+e.message;}};
    }
    return{bind,color:value=>map(value),revision:()=>revision};
  }
  return{presets,validate,mapper,createController};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WindColorScales;
