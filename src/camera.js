/* Optical zoom and unconstrained flight share the map's east/north coordinate system. */
const ObserverCamera=(()=>{
  const R=Math.PI/180;
  const minZoom=.35,maxZoom=12;
  const fov=zoom=>2*Math.atan(Math.tan(58*R/2)/Math.min(maxZoom,Math.max(minZoom,zoom)))/R;
  const bearing=yaw=>((yaw+180)%360+360)%360-180;
  function observer(state,site){
    return state.freeCamera?{east:state.freeX/1000,north:(55-state.freeZ)/1000,x:state.freeX,y:state.freeY,z:state.freeZ,name:'自由观测点'}:{...site,y:site.ground+state.floor*3};
  }
  function move(state,keys,dt){
    if(!state.freeCamera||!dt||!keys.size)return false;
    const forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
    const right=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
    const up=Number(keys.has('KeyE')||keys.has('Space'))-Number(keys.has('KeyQ')||keys.has('KeyC'));
    const yaw=state.yaw*R;
    const x=Math.sin(yaw)*forward+Math.cos(yaw)*right;
    const y=up,z=-Math.cos(yaw)*forward+Math.sin(yaw)*right;
    const length=Math.hypot(x,y,z);if(length<1e-8)return false;
    const distance=state.flightSpeed*(keys.has('ShiftLeft')||keys.has('ShiftRight')?4:1)*dt/length;
    state.freeX+=x*distance;state.freeY+=y*distance;state.freeZ+=z*distance;return true;
  }
  const wrap=(value,min,max)=>min+((value-min)%(max-min)+(max-min))%(max-min);
  function particleMotion(air,delta,weatherDt,viewDt){
    const v=axis=>air[axis]-(viewDt>0?delta[axis]/viewDt:0);
    return{x:air.x*weatherDt-delta.x,y:air.y*weatherDt-delta.y,z:air.z*weatherDt-delta.z,vx:v('x'),vy:v('y'),vz:v('z')};
  }
  return{fov,bearing,observer,move,minZoom,maxZoom,particleMotion,wrap};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=ObserverCamera;
