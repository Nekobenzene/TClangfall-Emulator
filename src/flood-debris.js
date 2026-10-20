/* Buoyant litter on inundated terraces. Positions are fixed world coordinates. */
function createFloodDebris({T,scene,M}){
  let seed=72819,visible=0,afloat=0,stranded=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},range=(a,b)=>a+(b-a)*random();
  const obstacles=[],items=[],dummy=new T.Object3D();
  const types=[
    {geometry:new T.CylinderGeometry(.5,.5,1,7),size:[.22,.62,.22],colors:['#bac9c0','#8faeaa','#b7bdab'],count:52,bottle:true},
    {geometry:new T.BoxGeometry(1,1,1),size:[1.8,.10,.48],colors:['#8a7355','#aa9270','#6e7f61'],count:48},
    {geometry:new T.BoxGeometry(1,1,1),size:[1.15,.58,.82],colors:['#897353','#597875','#b0b4a0'],count:24}
  ];
  for(const type of types){
    type.mesh=new T.InstancedMesh(type.geometry,new T.MeshStandardMaterial({roughness:.88,flatShading:true}),type.count);
    type.mesh.frustumCulled=false;type.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);type.mesh.count=0;scene.add(type.mesh);
    for(let i=0;i<type.count;i++){
      const scale=range(.75,1.35),x=i%5===0?range(-170,0):range(3,42),z=i<type.count*.7?range(-350,110):range(-900,180);
      const size=type.size.map(v=>v*scale),p={type,x,z,homeX:x,homeZ:z,size,volume:size[0]*size[1]*size[2],yaw:range(0,Math.PI*2),phase:range(0,6.28),vx:0,vz:0,wet:false};
      items.push(p);type.mesh.setColorAt(i,new T.Color(type.colors[i%type.colors.length]));
    }
  }
  const blocked=(x,z,r)=>obstacles.some(b=>Math.abs(x-b.x)<b.w/2+r&&Math.abs(z-b.z)<b.d/2+r);
  function addObstacle(x,z,w,d){obstacles.push({x,z,w:w+1,d:d+1});}
  function update(dt,time,level,wind){
    visible=afloat=stranded=0;for(const type of types)type.mesh.count=0;
    const ms=Math.hypot(wind.ve,wind.vn),e=ms>.001?wind.ve/ms:0,n=ms>.001?-wind.vn/ms:0;
    for(const p of items){
      const ground=M.coastalHeight(p.x),depth=M.floodDepth(p.x,level),motion=M.floatingMotion(ms/M.KT,p.volume,depth),r=Math.max(p.size[0],p.size[2])*.45;
      if(!p.wet&&level>.27&&motion.afloat&&!blocked(p.x,p.z,r))p.wet=true;
      if(!p.wet)continue;
      if(motion.afloat){
        const follow=1-Math.exp(-dt/motion.response),eddy=Math.sin(time*.5+p.phase)*.10;
        p.vx+=(motion.speed*(e+n*eddy)-p.vx)*follow;p.vz+=(motion.speed*(n-e*eddy)-p.vz)*follow;
        const nx=p.x+p.vx*dt,nz=p.z+p.vz*dt;
        if(M.floodDepth(nx,level)>motion.draft&&!blocked(nx,p.z,r))p.x=nx;else p.vx*=Math.exp(-dt*5);
        if(!blocked(p.x,nz,r))p.z=nz;else p.vz*=Math.exp(-dt*5);
        if(p.x>185||p.z < -950||p.z>230){p.x=p.homeX;p.z=p.homeZ;p.wet=false;p.vx=p.vz=0;continue;}
        afloat++;
      }else{p.vx=p.vz=0;stranded++;}
      const floating=motion.afloat,bob=floating?Math.sin(time*1.7+p.phase)*.012:0;
      // Flat boards and bottles sit just above the surface; crates are partly submerged.
      const height=p.type.bottle?p.size[0]:p.size[1],y=floating?level+height*.22+bob:Math.max(ground,level)+height*.5;
      p.yaw+=floating?dt*Math.sin(time*.7+p.phase)*Math.min(.32,motion.speed*.1):0;
      dummy.position.set(p.x,y,p.z);dummy.rotation.set(p.type.bottle?Math.PI/2:0,p.yaw,floating?Math.sin(time*1.3+p.phase)*.035:0);dummy.scale.set(...p.size);dummy.updateMatrix();
      p.type.mesh.setMatrixAt(p.type.mesh.count++,dummy.matrix);visible++;
    }
    for(const type of types)type.mesh.instanceMatrix.needsUpdate=true;
  }
  function reset(){for(const p of items){p.x=p.homeX;p.z=p.homeZ;p.vx=p.vz=0;p.wet=false;}for(const type of types)type.mesh.count=0;visible=afloat=stranded=0;}
  return{addObstacle,update,reset,stats:()=>({visible,afloat,stranded,total:items.length})};
}
