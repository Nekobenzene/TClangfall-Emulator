/* Shared visible ruler marks; logarithmic time positions retain integer multiplier values. */
const SliderScales=(()=>{
  const timeToSlider=value=>Math.log10(Math.min(1000,Math.max(1,value)))/3*1000;
  const timeFromSlider=position=>Math.round(10**(Math.min(1000,Math.max(0,position))*3/1000));
  function ticks(id,min,max){
    if(id==='timeScaleRange')return[1,10,100,1000].map(v=>({position:timeToSlider(v)/10,label:v+'×'}));
    if(id==='extentRange'||id==='largeExtentRange')return[.24,1,10,100,1000,3200].map(v=>({position:Math.log(v/.24)/Math.log(3200/.24)*100,label:v<1?'240m':v+'km'}));
    let values;
    if(id==='yawRange')values=[min,-45,0,45,max];
    else if(id==='pitchRange')values=[min,-20,0,20,max];
    else if(id==='motionHeadingRange')values=[min,90,180,270,max];
    else if(id==='floorRange')values=[min,Math.round((min+max)/2),max];
    else values=[min,Math.round(min+(max-min)/4),Math.round(min+(max-min)/2),Math.round(min+3*(max-min)/4),max];
    const unit=/yaw|pitch|Heading/.test(id)?'°':id==='flightSpeedRange'?'m/s':id==='floorRange'?'F':id==='rainStrengthRange'?'%':id==='intensity'||id==='motionSpeedRange'?'kt':/Radius|eastRange|northRange/.test(id)?'km':'';
    return [...new Set(values)].map(v=>({position:(v-min)/(max-min)*100,label:(Math.abs(v)>=100?Math.round(v):Number(v.toFixed(1)))+unit}));
  }
  function decorateAll(){
    for(const input of document.querySelectorAll('input[type="range"]:not([data-no-ruler])')){
      const wrap=document.createElement('span');wrap.className='scaled-slider';wrap.dataset.slider=input.id;
      input.before(wrap);wrap.appendChild(input);
      const ruler=document.createElement('span');ruler.className='slider-ruler';ruler.id=input.id+'Scale';wrap.appendChild(ruler);
      input.setAttribute('aria-describedby',ruler.id);
      let signature='';
      const refresh=()=>{
        const key=input.min+'|'+input.max;if(key===signature)return;signature=key;
        ruler.replaceChildren();
        for(const t of ticks(input.id,Number(input.min),Number(input.max))){const mark=document.createElement('span');mark.style.left=t.position+'%';mark.textContent=t.label;ruler.appendChild(mark);}
      };
      refresh();new MutationObserver(refresh).observe(input,{attributes:true,attributeFilter:['min','max']});
    }
  }
  return{timeToSlider,timeFromSlider,ticks,decorateAll};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SliderScales;
