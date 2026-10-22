const assert=require('node:assert/strict');
class Target{constructor(){this.handlers={};this.classList={add(){},remove(){}};}addEventListener(n,f){(this.handlers[n]??=[]).push(f);}setPointerCapture(){}emit(n,id,x=0,y=0,extra={}){for(const f of this.handlers[n]??[])f({type:n,pointerId:id,pointerType:'touch',clientX:x,clientY:y,button:0,preventDefault(){},...extra});}}
global.window=new Target();global.document=new Target();
const Touch=require('../src/touch.js'),el=new Target(),events=[];
Touch.bindGesture(el,{start:s=>events.push(['start',s]),move:s=>events.push(['move',s]),end:(s,c)=>events.push(['end',s,c])},e=>e.ignore);
el.emit('pointerdown',1,10,20);el.emit('pointerdown',2,30,20);
assert.deepEqual(events.at(-1),['start',{count:2,x:20,y:20,distance:20,pinched:true}]);
el.emit('pointermove',2,50,20);assert.equal(events.at(-1)[1].distance,40);
el.emit('pointerup',2);assert.equal(events.at(-1)[0],'start');assert.equal(events.at(-1)[1].count,1);assert.equal(events.at(-1)[1].pinched,true);
el.emit('pointerup',1);assert.equal(events.at(-1)[0],'end');assert.equal(events.at(-1)[1].pinched,true);assert.equal(events.at(-1)[2],false);
el.emit('pointerdown',3,10,20);assert.equal(events.at(-1)[1].pinched,false);el.emit('pointercancel',3);assert.equal(events.at(-1)[2],true);
let length=events.length;el.emit('pointerdown',4,0,0,{ignore:true});el.emit('pointermove',4);assert.equal(events.length,length);
el.emit('pointerdown',5);window.emit('blur');assert.equal(events.at(-1)[2],true);length=events.length;el.emit('pointermove',5);assert.equal(events.length,length);
const keys=new Set(),button=new Target(),clear=Touch.hold(button,'KeyW',keys);
button.emit('pointerdown',1);button.emit('pointerdown',2);button.emit('pointerup',1);assert(keys.has('KeyW'));button.emit('lostpointercapture',2);assert(!keys.size);
button.emit('pointerdown',3);window.emit('blur');assert(!keys.size);button.emit('pointerdown',4);clear();assert(!keys.size);
button.emit('pointerdown',5);document.emit('visibilitychange');assert(!keys.size);
console.log('PASS: touch centroids, pinch rebasing and suppression through final release, cancellation, ignored UI, held flight keys and blur/visibility cleanup.');

const stick=new Target();stick.style={setProperty(){}};stick.getBoundingClientRect=()=>({left:0,top:0,width:90,height:90});const joystickKeys=new Set();Touch.joystick(stick,joystickKeys);
stick.emit('pointerdown',10,45,45);assert.equal(joystickKeys.size,0);stick.emit('pointermove',10,70,15);assert.deepEqual([...joystickKeys].sort(),['KeyD','KeyW']);stick.emit('pointerdown',11,0,90);assert.deepEqual([...joystickKeys].sort(),['KeyD','KeyW']);stick.emit('pointerup',11);assert.equal(joystickKeys.size,2);stick.emit('pointermove',10,15,70);assert.deepEqual([...joystickKeys].sort(),['KeyA','KeyS']);stick.emit('pointercancel',10);assert.equal(joystickKeys.size,0);
stick.emit('pointerdown',12,45,0);window.emit('blur');assert.equal(joystickKeys.size,0);
console.log('PASS: flight joystick dead zone, diagonal and opposite directions, second-finger isolation, cancellation and blur.');
