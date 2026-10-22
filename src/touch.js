/* Rebase gestures whenever the number of fingers changes. */
const TouchControls=(()=>{
function bindGesture(el,h,ignore=()=>false){
 const points=new Map();let pinched=false;
 const sample=()=>{const p=[...points.values()].slice(0,2);return{count:points.size,x:p.reduce((s,v)=>s+v.x,0)/p.length,y:p.reduce((s,v)=>s+v.y,0)/p.length,distance:p.length>1?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0,pinched};};
 el.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'||ignore(e))return;e.preventDefault();points.set(e.pointerId,{x:e.clientX,y:e.clientY});pinched ||= points.size>1;el.setPointerCapture(e.pointerId);h.start?.(sample());});
 el.addEventListener('pointermove',e=>{if(!points.has(e.pointerId))return;e.preventDefault();points.set(e.pointerId,{x:e.clientX,y:e.clientY});h.move?.(sample());});
 const end=e=>{if(!points.has(e.pointerId))return;const s=sample();points.delete(e.pointerId);if(points.size)h.start?.(sample());else{h.end?.(s,e.type!=='pointerup');pinched=false;}};
 for(const n of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(n,end);
 const clear=()=>{if(points.size)h.end?.(sample(),true);points.clear();pinched=false;};window.addEventListener('blur',clear);document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});return clear;
}
function hold(button,key,keys){
 const pointers=new Set();button.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();pointers.add(e.pointerId);button.setPointerCapture(e.pointerId);keys.add(key);button.classList.add('held');});
 const release=e=>{pointers.delete(e.pointerId);if(!pointers.size){keys.delete(key);button.classList.remove('held');}};
 for(const n of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(n,release);
 const clear=()=>{pointers.clear();keys.delete(key);button.classList.remove('held');};window.addEventListener('blur',clear);document.addEventListener('visibilitychange',clear);return clear;
}
function joystick(el,keys){
 let active=null;const codes=['KeyW','KeyA','KeyS','KeyD'];
 const reset=()=>{active=null;codes.forEach(k=>keys.delete(k));el.style.setProperty('--stick-x','0px');el.style.setProperty('--stick-y','0px');el.classList.remove('held');};
 const move=e=>{const r=el.getBoundingClientRect(),radius=r.width*.33;let x=(e.clientX-r.left-r.width/2)/radius,y=(e.clientY-r.top-r.height/2)/radius;const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}codes.forEach(k=>keys.delete(k));if(Math.hypot(x,y)>.23){if(y<-.35)keys.add('KeyW');if(y>.35)keys.add('KeyS');if(x<-.35)keys.add('KeyA');if(x>.35)keys.add('KeyD');}el.style.setProperty('--stick-x',x*radius+'px');el.style.setProperty('--stick-y',y*radius+'px');};
 el.addEventListener('pointerdown',e=>{if(active!==null||e.button!==0)return;e.preventDefault();active=e.pointerId;el.setPointerCapture(active);el.classList.add('held');move(e);});
 el.addEventListener('pointermove',e=>{if(e.pointerId===active){e.preventDefault();move(e);}});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,e=>{if(e.pointerId===active)reset();});
 window.addEventListener('blur',reset);document.addEventListener('visibilitychange',reset);return reset;
}
return{bindGesture,hold,joystick};})();
if(typeof module!=='undefined'&&module.exports)module.exports=TouchControls;
