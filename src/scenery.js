/* Persistent wind exposure and physical street props. Restore repairs objects, never the storm. */
function createWindScenery({T,scene,M,random,randomRange,sampleAt}){
  const items=[],plants=[],cloths=[],cables=[],shards=[],cube=new T.BoxGeometry(1,1,1);
  const metal=new T.MeshStandardMaterial({color:'#647675',roughness:.7}),dark=new T.MeshStandardMaterial({color:'#233c3e',roughness:.8});
  const green=new T.MeshStandardMaterial({color:'#536d57',roughness:.9}),rust=new T.MeshStandardMaterial({color:'#a08565',roughness:.9});
  const red=new T.MeshStandardMaterial({color:'#aa8063',side:T.DoubleSide,roughness:.95}),blue=new T.MeshStandardMaterial({color:'#78999a',side:T.DoubleSide,roughness:.85});
  const holeMat=new T.MeshBasicMaterial({color:'#172a2f'}),rootMat=new T.MeshStandardMaterial({color:'#766249',roughness:1});
  function mesh(parent,material,x,y,z,w,h,d){const o=new T.Mesh(cube,material);o.position.set(x,y,z);o.scale.set(w,h,d);o.castShadow=h>1||w>3;o.receiveShadow=true;parent.add(o);return o;}
  function add(kind,object,extra={}){const p=object.position;const item={kind,object,x:p.x,z:p.z,home:p.clone(),damage:0,failed:false,age:0,resistance:randomRange(.72,1.6),windE:1,windZ:0,...extra};items.push(item);return item;}
  function group(x,z){const g=new T.Group();g.position.set(x,M.coastalHeight(x),z);scene.add(g);return g;}
  // Light timber beach sheds: loose sheet roofs and hinged wall panels fail before mature trees.
  for(const [i,z]of [92,-88,-252,-438,-630].entries()){
    const g=group(34,z),frame=new T.Group();g.add(frame);const width=5.8+i%2,depth=4.2;
    for(const x of [-width/2,width/2])for(const zz of [-depth/2,depth/2])mesh(frame,rust,x,1.45,zz,.13,2.9,.13);
    for(const zz of [-depth/2,depth/2])mesh(frame,rust,0,2.8,zz,width,.14,.14);
    const walls=[];
    for(const side of [-1,1]){const panel=new T.Group();panel.position.set(side*width/2,.15,0);g.add(panel);mesh(panel,i%2?blue:rust,0,1.22,0,.08,2.4,depth);for(let j=0;j<5;j++)mesh(panel,rust,side*.045,1.2,-depth/2+j*depth/4,.035,2.4,.05);walls.push({panel,side});}
    mesh(frame,rust,0,.12,0,width,.2,depth);mesh(frame,dark,0,.65,-depth/2,2.6,1.1,.1);
    const roof=new T.Group();roof.position.y=2.95;g.add(roof);
    for(const side of [-1,1]){const sheet=mesh(roof,i%2?blue:metal,side*width*.25,.15,0,width*.56,.09,depth+.7);sheet.rotation.z=-side*.12;for(let k=0;k<6;k++)mesh(roof,dark,side*width*.25,.23,-depth*.5+k*depth/5,width*.55,.04,.04);}
    add('hut',g,{frame,walls,roof,roofHome:roof.position.clone(),roofVelocity:null,flyThreshold:130});
    // Fishing crates and stacked boards alongside the shelter.
    mesh(g,rust,-1,.4,-.5,1.1,.8,.9);mesh(g,blue,-1,.85,-.5,1.15,.08,.95);mesh(g,rust,1.2,.3,-.7,1.8,.45,.7);
  }
  // Loose containers: lid flutter precedes tipping, sliding and eventually flight.
  for(const [x,z] of [[5,18],[6,-40],[6,-110],[7,-206],[-8,-288],[8,-390],[-80,-50],[-140,-580]]){
    const g=group(x,z);mesh(g,green,0,.65,0,.9,1.2,.85);mesh(g,dark,-.36,.15,.25,.13,.3,.3);mesh(g,dark,.36,.15,.25,.13,.3,.3);
    const lid=new T.Group();lid.position.set(0,1.27,-.4);g.add(lid);mesh(lid,metal,0,0,.4,1,.1,.95);add('bin',g,{lid,flyThreshold:105});
  }
  // Traffic signs and flexible banners punctuate the long street perspective.
  for(const [x,z] of [[23,5],[23,-95],[24,-230],[23,-360],[-72,-128],[-145,-600]]){
    const g=group(x,z);mesh(g,metal,0,1.4,0,.09,2.8,.09);mesh(g,blue,0,2.55,0,1.65,.65,.12);mesh(g,dark,0,2.55,.07,1.1,.08,.025);add('sign',g,{flyThreshold:145});
  }
  for(let z=12;z>-600;z-=82){
    const g=group(27.5,z);mesh(g,metal,0,2.05,0,.16,4.1,.16);
    const upper=new T.Group();upper.position.y=4.1;g.add(upper);mesh(upper,metal,0,2.3,0,.15,4.6,.15);mesh(upper,metal,1.15,4.5,0,2.45,.15,.16);mesh(upper,blue,2.25,4.35,0,.8,.22,.5);
    add('lamp',g,{upper});
  }
  // Deformable lane guardrails and seaside railings. Mesh vertices retain permanent bends.
  for(const x of [3.7,38])for(let z=20;z>-330;z-=24){
    const g=group(x,z),geometry=new T.BoxGeometry(.14,.23,15,1,1,12),beam=new T.Mesh(geometry,metal);beam.position.y=1;g.add(beam);
    for(const zz of [-6,0,6])mesh(g,metal,0,.52,zz,.1,1.04,.12);
    add('rail',g,{beam,original:geometry.attributes.position.array.slice()});
  }
  for(const [x,z] of [[26,-4],[26,-155],[-7,-46],[-70,-105]]){
    const g=group(x,z);mesh(g,metal,0,2.3,0,.09,4.6,.09);
    const geometry=new T.PlaneGeometry(1.5,2.8,5,10),cloth=new T.Mesh(geometry,red);cloth.position.set(.8,2.9,0);g.add(cloth);
    cloths.push({cloth,original:geometry.attributes.position.array.slice(),phase:random()*6});add('banner',g,{flyThreshold:125});
  }
  // Shrubs and ornamental grass respond to both mean wind and short pulses.
  const grassMaterial=new T.MeshStandardMaterial({color:'#62785b',side:T.DoubleSide,roughness:1});
  for(let i=0;i<26;i++){
    const x=i%2?26:-7,z=24-i*19,g=group(x,z);mesh(g,rust,0,.23,0,1.6,.46,1.3);
    const stems=new T.Group();stems.position.y=.45;g.add(stems);
    for(let k=0;k<5;k++){const leaf=new T.Mesh(new T.ConeGeometry(.22,randomRange(.9,1.7),4),grassMaterial);leaf.position.set(randomRange(-.5,.5),.65,randomRange(-.35,.35));stems.add(leaf);}
    plants.push({stems,x,z,phase:random()*6});
  }
  for(let z=-20;z>-420;z-=100){
    const points=Array.from({length:17},(_,i)=>new T.Vector3(27.5,8.1-2.2*Math.sin(i/16*Math.PI),z-i*82/16));
    const line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:'#3b5050'}));scene.add(line);cables.push({line,original:line.geometry.attributes.position.array.slice(),x:27.5,z});
  }
  const glass=new T.InstancedMesh(new T.PlaneGeometry(1,1),new T.MeshStandardMaterial({color:'#bdd6d5',transparent:true,opacity:.65,side:T.DoubleSide,metalness:.4,roughness:.2,depthWrite:false}),120);
  glass.frustumCulled=false;glass.instanceMatrix.setUsage(T.DynamicDrawUsage);glass.count=0;scene.add(glass);const dummy=new T.Object3D();
  function registerWindow(pane){
    const hole=new T.Mesh(cube,holeMat);hole.position.copy(pane.position);hole.scale.copy(pane.scale);hole.visible=false;scene.add(hole);
    add('window',pane,{hole});
  }
  function registerTree(tree){
    const H=tree.userData.height||7.5,radius=tree.userData.radius||.3,breakHeight=H*.32,stump=new T.Mesh(new T.CylinderGeometry(radius*.77,radius,breakHeight,7),rootMat);stump.position.y=breakHeight/2;stump.visible=false;tree.add(stump);
    const upper=new T.Group();upper.position.y=breakHeight;upper.visible=false;tree.add(upper);
    const timber=new T.Mesh(new T.CylinderGeometry(radius*.45,radius*.77,H-breakHeight,7),rootMat);timber.position.y=(H-breakHeight)/2;upper.add(timber);
    const crown=tree.userData.crown.clone(true);crown.position.set(0,H-breakHeight,0);crown.rotation.set(0,0,0);upper.add(crown);
    const roots=new T.Group();roots.visible=false;tree.add(roots);const soil=new T.Mesh(new T.IcosahedronGeometry(.65,0),rootMat);soil.scale.set(1,.5,1);roots.add(soil);
    for(let i=0;i<5;i++){const root=mesh(roots,rootMat,Math.sin(i)*.6,-.1,Math.cos(i)*.6,.14,.14,1.5);root.rotation.y=i;}
    add('tree',tree,{upper,stump,roots,mode:random()<.5?'snap':'uproot'});
  }
  function breakWindow(item,w){
    item.object.visible=false;item.hole.visible=true;
    for(let i=0;i<4;i++){if(shards.length>=120)shards.shift();shards.push({x:item.home.x+randomRange(-.8,.8),y:item.home.y+randomRange(-.6,.6),z:item.home.z+.15,vx:w.ve*.35+randomRange(-3,3),vy:randomRange(-1,4),vz:-w.vn*.35+randomRange(-3,3),age:0,size:randomRange(.12,.35),spin:random()*6});}
  }
  function update(dt,simDt,time){
    const field=sampleAt(0,55),ms=Math.max(.01,field.ms),windE=field.ve/ms,windZ=-field.vn/ms;
    for(const item of items){
      const w=sampleAt(item.x,item.z),k=Math.max(w.sustained,w.gust*.87);item.currentWind=k;
      if(!item.failed){
        item.windE=w.ve/Math.max(.01,w.ms);item.windZ=-w.vn/Math.max(.01,w.ms);
        item.damage=M.advanceDamage(item.damage,item.kind,k,simDt,item.resistance);
        if(item.damage>=1){item.failed=true;item.age=0;item.windE=w.ve/Math.max(.01,w.ms);item.windZ=-w.vn/Math.max(.01,w.ms);
          if(item.kind==='window')breakWindow(item,w);
          if(item.kind==='tree'){item.object.userData.failed=true;if(item.mode==='snap'){item.object.userData.trunk.visible=false;item.object.userData.crown.visible=false;item.stump.visible=item.upper.visible=true;}else item.roots.visible=true;}
        }
      }
      if(item.failed)item.age+=dt;
      const g=item.object,d=item.damage,flutter=Math.sin(time*5+item.x+item.z)*Math.min(.1,k/1700),bend=Math.min(.18,k*k/170000)+d*.16;
      if(item.kind==='window'){if(!item.failed){g.rotation.x=flutter*.03;g.rotation.y=flutter*.02;}continue;}
      if(item.kind==='hut'){
        item.frame.rotation.z=-item.windE*d*.18;item.frame.scale.y=1-d*.24;
        for(const {panel,side}of item.walls){panel.rotation.z=item.failed?side*Math.min(1.5,item.age*.7):side*d*.22+flutter*.4;}
        if(!item.failed){item.roof.rotation.set(item.windZ*flutter,item.windE*flutter*.3,-item.windE*(flutter+d*.12));}
        else if(k>item.flyThreshold||item.roofVelocity){
          if(!item.roofVelocity)item.roofVelocity={x:w.ve*.20,z:-w.vn*.20,y:4.5};
          const v=item.roofVelocity;v.x+=(w.ve*.24-v.x)*(1-Math.exp(-dt));v.z+=(-w.vn*.24-v.z)*(1-Math.exp(-dt));v.y-=dt*2.8;
          item.roof.position.x+=v.x*dt;item.roof.position.z+=v.z*dt;item.roof.position.y+=v.y*dt;
          const floor=M.coastalHeight(item.home.x+item.roof.position.x)-item.home.y+.18;
          if(item.roof.position.y<floor){item.roof.position.y=floor;v.y=0;v.x*=Math.exp(-dt*1.5);v.z*=Math.exp(-dt*1.5);}
          else {item.roof.rotation.x+=dt*.65;item.roof.rotation.z+=dt*1.4;}
        }else {item.roof.position.y=Math.max(.25,item.roof.position.y-dt*1.5);item.roof.rotation.z=item.windE*.4;}
        continue;
      }
      if(item.kind==='tree'){
        if(item.failed){const angle=Math.min(1.55,item.age*.65),part=item.mode==='snap'?item.upper:g;part.rotation.z=-item.windE*angle;part.rotation.x=item.windZ*angle;}
        continue;
      }
      if(item.kind==='rail'){
        const a=item.beam.geometry.attributes.position,o=item.original;
        for(let i=0;i<a.count;i++){const zz=o[i*3+2],bow=Math.cos(zz/15*Math.PI)*d*d*2.2;a.setXYZ(i,o[i*3]+item.windE*bow,o[i*3+1]+Math.sin(zz*1.3)*d*.2,zz+item.windZ*bow*.2);}
        a.needsUpdate=true;continue;
      }
      if(item.kind==='lamp'){
        const angle=item.failed?Math.min(1.6,item.age*.8):bend+flutter;
        item.upper.rotation.z=-(item.failed?item.windE:windE)*angle;item.upper.rotation.x=(item.failed?item.windZ:windZ)*angle;continue;
      }
      if(item.lid)item.lid.rotation.x=-(.05+Math.min(1.3,k/90)*( .5+.5*Math.sin(time*8+item.z)));
      if(item.failed){
        const angle=Math.min(1.5,item.age*1.3);g.rotation.z=-item.windE*angle;g.rotation.x=item.windZ*angle;
        if(item.age>1&&k>item.flyThreshold){const lift=M.smooth(item.flyThreshold,200,k),speed=(item.kind==='bin'?.20:.32)*w.ms;g.position.x+=item.windE*speed*dt;g.position.z+=item.windZ*speed*dt;g.position.y=M.coastalHeight(g.position.x)+.3+lift*(1+Math.sin(item.age*1.7)**2)*4;g.rotation.y+=dt*(1+lift*3);}
        else if(item.age>1)g.position.y+=(M.coastalHeight(g.position.x)+.35-g.position.y)*(1-Math.exp(-dt*3));
      }else{g.rotation.z=-windE*(bend+flutter);g.rotation.x=windZ*(bend+flutter);}
    }
    for(const p of plants){const a=Math.min(1.2,ms/55)+Math.sin(time*4+p.phase)*Math.min(.15,ms/140);p.stems.rotation.z=-windE*a;p.stems.rotation.x=windZ*a;}
    for(const p of cloths){const a=p.cloth.geometry.attributes.position;for(let i=0;i<a.count;i++){const x=p.original[i*3];a.setZ(i,Math.sin(time*(3+ms*.09)+p.original[i*3+1]*3+p.phase)*(x+.75)*Math.min(.65,ms/75));}a.needsUpdate=true;}
    for(const p of cables){const a=p.line.geometry.attributes.position,o=p.original;for(let i=0;i<a.count;i++){const f=Math.sin(i/(a.count-1)*Math.PI);a.setXYZ(i,o[i*3]+windE*ms*.027*f,o[i*3+1]+Math.sin(time*3+i*.6)*Math.min(.3,ms*.007)*f,o[i*3+2]+windZ*ms*.01*f);}a.needsUpdate=true;}
    let active=0;
    for(let i=shards.length-1;i>=0;i--){const p=shards[i];p.age+=dt;p.vy-=9.8*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(p.age>8||p.y<M.coastalHeight(p.x)){shards.splice(i,1);continue;}dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(time*4+p.spin,time*3,0);dummy.scale.set(p.size,p.size*.6,1);dummy.updateMatrix();glass.setMatrixAt(active++,dummy.matrix);}glass.count=active;glass.instanceMatrix.needsUpdate=true;
  }
  function restore(){
    for(const p of items){p.damage=0;p.failed=false;p.age=0;p.object.position.copy(p.home);p.object.rotation.set(0,0,0);p.object.visible=true;
      if(p.kind==='window')p.hole.visible=false;
      if(p.kind==='lamp')p.upper.rotation.set(0,0,0);
      if(p.kind==='hut'){p.frame.rotation.set(0,0,0);p.frame.scale.set(1,1,1);p.roof.position.copy(p.roofHome);p.roof.rotation.set(0,0,0);p.roofVelocity=null;for(const {panel}of p.walls)panel.rotation.set(0,0,0);}
      if(p.kind==='tree'){p.object.userData.failed=false;p.object.userData.trunk.visible=p.object.userData.crown.visible=true;p.upper.visible=p.stump.visible=p.roots.visible=false;p.upper.rotation.set(0,0,0);}
      if(p.kind==='rail'){p.beam.geometry.attributes.position.array.set(p.original);p.beam.geometry.attributes.position.needsUpdate=true;}
    }shards.length=0;glass.count=0;
  }
  function stats(){let next=Infinity;const destroyed=items.filter(p=>p.failed).length;for(const p of items)if(!p.failed)next=Math.min(next,(1-p.damage)*M.survivalTime(p.kind,p.currentWind||0,p.resistance));return{destroyed,total:items.length,nextSeconds:next};}
  return {registerTree,registerWindow,update,restore,stats};
}
