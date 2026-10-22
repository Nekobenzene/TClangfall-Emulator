/* Shared small/large metric map. Default drag pans; a deliberate switch edits the cyclone. */
function createStormMap({canvas,state,getTarget,getCamera,getObserver,onChange,onSelectSite}){
  const M=StormModel,R=Math.PI/180,$=id=>document.getElementById(id),big=$('largeMap'),hud=$('hudMap'),dialog=$('largeMapDialog');
  const clamp=M.clamp,canvases=[canvas,big,hud];let drag=null,dirty=true,lastHeat=0,heatKey='',heatCanvas=null;
  const site=()=>getObserver?getObserver():OBSERVATION_SITES.find(p=>p.id===state.siteId)||OBSERVATION_SITES[0];
  const format=km=>km<1?Math.round(km*1000)+' m':km<10?km.toFixed(2)+' km':Math.round(km)+' km';
  const slider=width=>Math.log(width/.24)/Math.log(3200/.24)*1000;
  const fromSlider=v=>.24*Math.pow(3200/.24,v/1000);
  function size(el){const r=el.getBoundingClientRect();return{w:r.width,h:r.height,s:r.width/(2*state.extent)};}
  function setup(el){const d=size(el),ratio=Math.min(devicePixelRatio||1,2);if(el.width!==Math.round(d.w*ratio)||el.height!==Math.round(d.h*ratio)){el.width=Math.round(d.w*ratio);el.height=Math.round(d.h*ratio);}const c=el.getContext('2d');c.setTransform(ratio,0,0,ratio,0,0);return{...d,c};}
  const palette=WindColorScales.createController({onChange:()=>redraw()});
  const color=v=>palette.color(v);
  function heat(c,d,t,now,force){
    const phase=state.simTime/60,key=[palette.revision(),d.w,d.h,state.mapEast,state.mapNorth,state.extent,state.east,state.north,state.intensity,state.motionHeading,state.motionSpeed,t.eyeRadius,t.wallRadius,t.stormRadius,t.influenceRadius,Math.floor(phase*4)].join('|');
    if(!heatCanvas||((key!==heatKey||dirty)&&(force||now-lastHeat>180))){
      heatCanvas=heatCanvas||document.createElement('canvas');heatCanvas.width=Math.min(180,Math.max(60,Math.ceil(d.w/6)));heatCanvas.height=Math.max(30,Math.round(heatCanvas.width*d.h/d.w));
      const hc=heatCanvas.getContext('2d'),pixels=hc.createImageData(heatCanvas.width,heatCanvas.height);let maximum=0;
      for(let y=0;y<heatCanvas.height;y++)for(let x=0;x<heatCanvas.width;x++){
        const e=state.mapEast+((x+.5)/heatCanvas.width-.5)*state.extent*2,n=state.mapNorth+(.5-(y+.5)/heatCanvas.height)*state.extent*2*d.h/d.w;
        const v=M.meanWind(state.east-e,state.north-n,state.intensity,t,phase).sustained,rgb=color(v),k=(y*heatCanvas.width+x)*4;
        maximum=Math.max(maximum,v);pixels.data[k]=rgb[0];pixels.data[k+1]=rgb[1];pixels.data[k+2]=rgb[2];pixels.data[k+3]=224;
      }hc.putImageData(pixels,0,0);big.dataset.fieldMax=maximum.toFixed(1);big.dataset.fieldKind='sustained';heatKey=key;lastHeat=now;dirty=false;
    }
    c.save();c.imageSmoothingEnabled=true;c.drawImage(heatCanvas,0,0,d.w,d.h);c.restore();
    // Sparse arrows use the same sustained vector as the coloured field, with no gust noise.
    c.strokeStyle='#ecf1e360';c.lineWidth=.8;
    for(let y=35;y<d.h;y+=76)for(let x=35;x<d.w;x+=76){const e=state.mapEast+(x-d.w/2)/d.s,n=state.mapNorth-(y-d.h/2)/d.s,w=M.meanWind(state.east-e,state.north-n,state.intensity,t,phase);if(w.sustained<2)continue;const a=Math.atan2(-w.vn,w.ve);c.save();c.translate(x,y);c.rotate(a);c.beginPath();c.moveTo(-7,0);c.lineTo(7,0);c.lineTo(3,-3);c.moveTo(7,0);c.lineTo(3,3);c.stroke();c.restore();}
  }
  function drawOne(el,now,force){
    if(!el.getBoundingClientRect().width||!el.getBoundingClientRect().height)return;
    const d=setup(el),{w,h,s,c}=d;if(!w||!h)return;
    const t=getTarget(),observer=site(),isBig=el===big,X=e=>w/2+(e-state.mapEast)*s,Y=n=>h/2-(n-state.mapNorth)*s;
    el.setAttribute('aria-label',`${isBig?'大':'小'}地图，宽 ${format(state.extent*2)}；${state.mapMode==='set'?'移动风暴已开启':'拖动平移，点击楼房选择观测点'}。`);
    el.dataset.rings=['influence',...(t.hasStorm?['storm']:[]),...(t.hasEye?['eye','wall']:[])].join(',');
    c.clearRect(0,0,w,h);c.fillStyle='#182c34';c.fillRect(0,0,w,h);
    const top=state.mapNorth+h/2/s,bottom=state.mapNorth-h/2/s,left=state.mapEast-state.extent,right=state.mapEast+state.extent;
    const windField=(el===canvas&&$('smallWindField').getAttribute('aria-pressed')==='true')||(isBig&&$('showWindField').checked)||(el===hud&&$('hudMapField').checked);
    el.dataset.fieldKind=windField?'sustained':'off';
    if(windField)heat(c,d,t,now,force);
    const coast=n=>.04+18*Math.sin(n/150)+8*Math.sin(n/57);
    c.beginPath();c.moveTo(0,0);for(let i=0;i<=80;i++){const n=top-(top-bottom)*i/80;c.lineTo(X(coast(n)),Y(n));}c.lineTo(0,h);c.closePath();c.fillStyle=windField?'#7b8f6b21':'#293936';c.fill();c.strokeStyle='#bdc8ad60';c.lineWidth=1;c.stroke();
    const raw=state.extent/3,power=10**Math.floor(Math.log10(raw)),step=[1,2,5,10].find(v=>v*power>=raw)*power;
    c.strokeStyle='#bed3d125';c.lineWidth=.8;
    for(let e=Math.floor(left/step)*step;e<=right;e+=step){c.beginPath();c.moveTo(X(e),0);c.lineTo(X(e),h);c.stroke();}
    for(let n=Math.floor(bottom/step)*step;n<=top;n+=step){c.beginPath();c.moveTo(0,Y(n));c.lineTo(w,Y(n));c.stroke();}
    const cx=X(state.east),cy=Y(state.north),outer=t.influenceRadius*s;
    c.save();c.beginPath();c.rect(0,0,w,h);c.clip();
    function circle(radius,stroke,dash=[],fill){c.setLineDash(dash);c.strokeStyle=stroke;c.beginPath();c.arc(cx,cy,radius*s,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}c.stroke();c.setLineDash([]);}
    circle(t.influenceRadius,'#b6d3dd99',[7,5]);if(t.hasStorm)circle(t.stormRadius,'#b2dec4b0',[],'#a4c6b50c');
    if(state.motionSpeed>0&&state.extent>2){const a=state.motionHeading*R;for(const [offset,color]of [[0,'#d3a07710'],[Math.PI,'#99bdac08']]){c.beginPath();c.moveTo(cx,cy);c.arc(cx,cy,outer,a-Math.PI/2+offset,a+Math.PI/2+offset);c.closePath();c.fillStyle=color;c.fill();}const len=Math.min(65,Math.max(28,outer*.25));c.save();c.translate(cx,cy);c.rotate(a);c.strokeStyle='#f0c99f';c.beginPath();c.moveTo(0,0);c.lineTo(0,-len);c.lineTo(-4,-len+7);c.moveTo(0,-len);c.lineTo(4,-len+7);c.stroke();c.restore();}
    if(t.hasEye){c.globalAlpha=t.eyeDevelopment;circle(t.wallRadius,'#edbb88bb',[],'#e4ad7915');circle(t.eyeRadius,'#f3d0a5',[4,4]);c.globalAlpha=1;}
    c.restore();
    const ox=X(observer.east),oy=Y(observer.north),camera=getCamera(),fov=camera?Math.atan(Math.tan(camera.fov*R/2)*camera.aspect):.6;
    c.save();c.translate(ox,oy);c.rotate(state.yaw*R);c.fillStyle='#d0eac81a';c.strokeStyle='#d0eac877';c.beginPath();c.moveTo(0,0);c.arc(0,0,Math.min(w*.13,Math.max(22,.16*s)),-Math.PI/2-fov,-Math.PI/2+fov);c.closePath();c.fill();c.stroke();c.restore();
    // Real map positions: at synoptic zoom the selected site stays legible; city zoom separates them.
    const drawn=[];
    for(const p of OBSERVATION_SITES){const selected=p.id===state.siteId,px=X(p.east),py=Y(p.north);if(!selected&&drawn.some(q=>Math.hypot(q[0]-px,q[1]-py)<11))continue;if(!selected&&(px<0||px>w||py<0||py>h))continue;drawn.push([px,py]);const x=clamp(px,10,w-10),y=clamp(py,15,h-30);c.strokeStyle=selected?'#e1f8cf':'#b3cfbf';c.fillStyle=selected?'#b6d4bd':'#263e40';c.lineWidth=selected?2:1;c.beginPath();c.arc(x,y,selected?6:4,0,Math.PI*2);c.fill();c.stroke();if(selected||state.extent<2){c.font='10px "Microsoft YaHei",sans-serif';c.fillStyle='#ebf0df';c.fillText(p.name,x>w-92?x-84:x+9,y+15);}}
    if(state.freeCamera){const x=clamp(ox,10,w-10),y=clamp(oy,15,h-30);c.fillStyle='#e8f9fc';c.strokeStyle='#63c9dc';c.lineWidth=2;c.beginPath();c.arc(x,y,5,0,Math.PI*2);c.fill();c.stroke();c.font='10px "Microsoft YaHei",sans-serif';c.fillText('自由视点'+(x!==ox||y!==oy?' ↗':''),x>w-90?x-82:x+9,y-10);}
    const px=clamp(cx,12,w-12),py=clamp(cy,15,h-30);c.strokeStyle='#f1c28e';c.lineWidth=1.4;c.beginPath();c.arc(px,py,6,0,Math.PI*2);c.moveTo(px-10,py);c.lineTo(px+10,py);c.moveTo(px,py-10);c.lineTo(px,py+10);c.stroke();c.fillStyle='#f0d3ab';c.font='10px "Microsoft YaHei",sans-serif';c.fillText('台风中心'+(px!==cx||py!==cy?' ↗':''),px>w-75?px-63:px+10,py-11);
    c.strokeStyle='#d0dfde';c.beginPath();c.moveTo(14,h-17);c.lineTo(14+step*s,h-17);c.stroke();c.fillStyle='#c9dbd9';c.font='10px Consolas,monospace';c.fillText(format(step),16,h-23);c.fillText('N ↑',w-30,22);
  }
  function syncMode(){for(const id of ['stormDragToggle','largeStormDragToggle','hudStormDragToggle'])$(id).checked=state.mapMode==='set';for(const el of canvases)el.style.cursor=state.mapMode==='set'?'crosshair':'grab';$('mapModeNote').textContent=state.mapMode==='set'?'移动风暴已开启：点击 / 拖动设置中心':'拖动平移 · 点击楼房切换观测点';}
  function draw(force=false){const now=performance.now();drawOne(canvas,now,force);if(dialog.open)drawOne(big,now,force);if(($('view').classList.contains('is-fullscreen')||document.fullscreenElement=== $('view'))&&$('hudMapVisible').checked&&$('view').dataset.mobileMapVisible!=='false')drawOne(hud,now,force);for(const id of ['extentRange','largeExtentRange']){$(id).value=slider(state.extent*2);$(id).setAttribute('aria-valuetext',format(state.extent*2));}$('mapWidth').textContent=format(state.extent*2);$('largeMapWidth').textContent=format(state.extent*2);document.querySelectorAll('[data-site]').forEach(b=>{b.classList.toggle('selected',b.dataset.site===state.siteId);b.setAttribute('aria-pressed',String(b.dataset.site===state.siteId));});}
  function redraw(){dirty=true;draw(true);}
  function zoom(factor,anchor,el=canvas){const d=size(el),x=anchor?anchor[0]:d.w/2,y=anchor?anchor[1]:d.h/2,e=state.mapEast+(x-d.w/2)/d.s,n=state.mapNorth-(y-d.h/2)/d.s;state.extent=clamp(state.extent*factor,.12,1600);const ns=d.w/(2*state.extent);state.mapEast=e-(x-d.w/2)/ns;state.mapNorth=n+(y-d.h/2)/ns;redraw();}
  function fit(){const t=getTarget(),p=site(),el=dialog.open?big:canvas,d=size(el);state.mapEast=(state.east+p.east)*.5;state.mapNorth=(state.north+p.north)*.5;state.extent=Math.min(1600,Math.max(Math.abs(state.east-p.east)*.5+t.influenceRadius,(Math.abs(state.north-p.north)*.5+t.influenceRadius)*d.w/d.h)*1.1);redraw();}
  function city(){const points=OBSERVATION_SITES;state.mapEast=(Math.min(...points.map(p=>p.east))+Math.max(...points.map(p=>p.east)))*.5;state.mapNorth=(Math.min(...points.map(p=>p.north))+Math.max(...points.map(p=>p.north)))*.5;const d=size(dialog.open?big:canvas);state.extent=Math.max(.30,.42*d.w/d.h);redraw();}
  function bind(){
    palette.bind();
    document.querySelector('.map-section').addEventListener('toggle',()=>{if(document.querySelector('.map-section').open)redraw();});
    $('hudMapZoomIn').onclick=()=>zoom(.72,null,hud);$('hudMapZoomOut').onclick=()=>zoom(1/.72,null,hud);
    $('hudMapField').onchange=redraw;
    $('smallWindField').onclick=()=>{const enabled=$('smallWindField').getAttribute('aria-pressed')!=='true';$('smallWindField').setAttribute('aria-pressed',String(enabled));$('smallWindField').classList.toggle('selected',enabled);$('smallFieldLegend').hidden=!enabled;redraw();};
    for(const el of canvases){const pos=e=>{const r=el.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];};
      const place=e=>{const [x,y]=pos(e),d=size(el);state.east=clamp(state.mapEast+(x-d.w/2)/d.s,-10000,10000);state.north=clamp(state.mapNorth-(y-d.h/2)/d.s,-10000,10000);dirty=true;onChange();};
      el.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;const pan=e.shiftKey||e.button===2||state.mapMode!=='set';drag={el,pan,x:e.clientX,y:e.clientY,e:state.mapEast,n:state.mapNorth,moved:false};el.setPointerCapture(e.pointerId);if(!pan)place(e);});
      el.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const [x,y]=pos(e),d=size(el);if(drag&&drag.el===el){drag.moved=drag.moved||Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4;if(drag.pan){state.mapEast=drag.e-(e.clientX-drag.x)/d.s;state.mapNorth=drag.n+(e.clientY-drag.y)/d.s;redraw();}else place(e);}if(el===big){const east=state.mapEast+(x-d.w/2)/d.s,north=state.mapNorth-(y-d.h/2)/d.s,v=M.meanWind(state.east-east,state.north-north,state.intensity,getTarget(),state.simTime/60);$('fieldProbe').textContent=`此处持续风 ${v.sustained.toFixed(1)} kt · E ${east.toFixed(2)} / N ${north.toFixed(2)} km`;}});
      el.addEventListener('pointerup',e=>{if(e.pointerType==='touch')return;if(drag&&drag.el===el&&drag.pan&&!drag.moved){const [x,y]=pos(e),d=size(el),near=OBSERVATION_SITES.map(p=>({p,d:Math.hypot(d.w/2+(p.east-state.mapEast)*d.s-x,d.h/2-(p.north-state.mapNorth)*d.s-y)})).sort((a,b)=>a.d-b.d)[0];if(near.d<15)onSelectSite(near.p.id);}drag=null;});el.addEventListener('pointercancel',()=>drag=null);el.addEventListener('contextmenu',e=>e.preventDefault());
      let baseline,origin,touchMoved=false;
      TouchControls.bindGesture(el,{
        start:s=>{baseline={...s};if(!s.pinched){origin={...s};touchMoved=false;}},
        move:s=>{const b=baseline;if(!b)return;touchMoved ||= Math.hypot(s.x-origin.x,s.y-origin.y)>4;
          if(s.count>1){zoom(b.distance/Math.max(1,s.distance),pos({clientX:b.x,clientY:b.y}),el);const d=size(el);state.mapEast-=(s.x-b.x)/d.s;state.mapNorth+=(s.y-b.y)/d.s;redraw();}
          else if(!s.pinched&&state.mapMode==='set')place({clientX:s.x,clientY:s.y});
          else{const d=size(el);state.mapEast-=(s.x-b.x)/d.s;state.mapNorth+=(s.y-b.y)/d.s;redraw();}baseline={...s};
        },
        end:(s,cancelled)=>{if(!cancelled&&!s.pinched){if(state.mapMode==='set')place({clientX:s.x,clientY:s.y});else if(!touchMoved){const [x,y]=pos({clientX:s.x,clientY:s.y}),d=size(el),near=OBSERVATION_SITES.map(p=>({p,d:Math.hypot(d.w/2+(p.east-state.mapEast)*d.s-x,d.h/2-(p.north-state.mapNorth)*d.s-y)})).sort((a,b)=>a.d-b.d)[0];if(near.d<22)onSelectSite(near.p.id);}}baseline=null;}
      });
      el.addEventListener('wheel',e=>{e.preventDefault();if(e.shiftKey){const d=size(el);state.mapEast+=e.deltaX/d.s;state.mapNorth-=e.deltaY/d.s;redraw();}else zoom(Math.exp(clamp(e.deltaY,-150,150)*.004),pos(e),el);},{passive:false});
      el.addEventListener('keydown',e=>{const step=e.shiftKey?10:1,move={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,step],ArrowDown:[0,-step]}[e.key];if(!move)return;e.preventDefault();if(state.mapMode==='set'){state.east+=move[0]*Math.min(1,state.extent*.03);state.north+=move[1]*Math.min(1,state.extent*.03);onChange();}else{state.mapEast+=move[0]*state.extent*.03;state.mapNorth+=move[1]*state.extent*.03;redraw();}});
    }
    for(const id of ['stormDragToggle','largeStormDragToggle','hudStormDragToggle'])$(id).onchange=e=>{state.mapMode=e.target.checked?'set':'pan';syncMode();};
    $('zoomIn').onclick=()=>zoom(.75);$('zoomOut').onclick=()=>zoom(1.33);$('largeZoomIn').onclick=()=>zoom(.75,null,big);$('largeZoomOut').onclick=()=>zoom(1.33,null,big);
    for(const id of ['extentRange','largeExtentRange'])$(id).oninput=e=>{state.extent=fromSlider(Number(e.target.value))/2;redraw();};
    $('mapHome').onclick=()=>{state.mapEast=site().east;state.mapNorth=site().north;redraw();};$('mapFit').onclick=fit;$('largeMapFit').onclick=fit;$('mapCity').onclick=city;$('largeMapCity').onclick=city;
    $('openLargeMap').onclick=()=>{dialog.showModal();redraw();};$('closeLargeMap').onclick=()=>dialog.close();$('showWindField').onchange=redraw;
    for(const p of OBSERVATION_SITES){const b=document.createElement('button');b.type='button';b.dataset.site=p.id;b.textContent=p.name;b.onclick=()=>onSelectSite(p.id);$('mapSiteChoices').appendChild(b);}syncMode();
  }
  return{draw,bind,fit,zoom,city,syncMode};
}
