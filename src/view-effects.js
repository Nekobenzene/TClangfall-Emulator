/* Display-only optics and daylight; never changes meteorological observations. */
const ViewAtmosphere=(()=>{
  const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
  function sample(weather,clearFog){
    const sun=Math.min(1,Math.max(0,weather.sunshine));
    const dry=1-smooth(8,65,weather.rain),openness=Math.max(sun,dry*.58);
    return{openness,dry,sun,direct:1.05+dry*.75+sun*3.1,ambient:2.1+openness*.65,
      exposure:1.08+openness*.12,blue:Math.max(sun,dry*.28),
      fogDensity:clearFog?1.98/22000:1.98/Math.max(55,weather.visibility)*(1-openness*.46),
      shadows:openness>.12};
  }
  return{sample};
})();
function createWideLens(T,renderer){
  const target=new T.WebGLRenderTarget(1,1,{depthBuffer:true}),screen=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
  target.samples=renderer.capabilities.isWebGL2?4:0;
  const background=new T.WebGLRenderTarget(1,1,{depthBuffer:true});background.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);background.samples=target.samples;
  const mistScene=new T.Scene();let motionMist=null,depthSurfaces=[];
  const material=new T.ShaderMaterial({uniforms:{sceneImage:{value:target.texture},amount:{value:0}},depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 uvPos;void main(){uvPos=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:'uniform sampler2D sceneImage;uniform float amount;varying vec2 uvPos;void main(){vec2 p=(uvPos-.5)*2.;float r=dot(p,p);vec2 q=p*(1.+amount*.055*r)/(1.+amount*.11);vec3 color=texture2D(sceneImage,.5+q*.5).rgb;gl_FragColor=vec4(color*(1.-amount*.055*smoothstep(.35,1.6,r)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});
  screen.add(new T.Mesh(new T.PlaneGeometry(2,2),material));
  const size=new T.Vector2();
  function setMist(mist,surfaces=[]){motionMist=mist;depthSurfaces=surfaces;mistScene.add(mist.mesh);mist.mesh.material.depthTest=false;}
  function render(scene,viewCamera,zoom){
    const amount=Math.min(1,Math.max(0,(1-zoom)/.65));
    if(!motionMist&&amount<.002){renderer.render(scene,viewCamera);return;}
    renderer.getDrawingBufferSize(size);if(target.width!==size.x||target.height!==size.y)target.setSize(size.x,size.y);
    if(motionMist){
      if(background.width!==size.x||background.height!==size.y)background.setSize(size.x,size.y);
      // Render the scenery once. Water also supplies depth, while the sky does not.
      const writes=depthSurfaces.map(surface=>surface.material.depthWrite);
      depthSurfaces.forEach(surface=>surface.material.depthWrite=true);
      renderer.setRenderTarget(background);renderer.render(scene,viewCamera);
      depthSurfaces.forEach((surface,i)=>surface.material.depthWrite=writes[i]);
      material.uniforms.sceneImage.value=background.texture;material.uniforms.amount.value=0;
      renderer.setRenderTarget(target);renderer.render(screen,camera);
      motionMist.setBackground(background.depthTexture,size,viewCamera.far);
      const clear=renderer.autoClear;renderer.autoClear=false;renderer.render(mistScene,viewCamera);renderer.autoClear=clear;
      material.uniforms.sceneImage.value=target.texture;material.uniforms.amount.value=amount;
      renderer.setRenderTarget(null);renderer.render(screen,camera);return;
    }
    material.uniforms.amount.value=amount;renderer.setRenderTarget(target);renderer.render(scene,viewCamera);renderer.setRenderTarget(null);renderer.render(screen,camera);
  }
  return{render,setMist};
}
/* Advected concentration ripples: 120 kt ~2 Hz, 150 kt ~3 Hz, tending to 3.5 Hz. */
const RainField=(()=>{
  const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
  function frequencies(kt){
    const fog=1+smooth(75,120,kt)+smooth(120,150,kt)+.5*(1-Math.exp(-Math.pow(Math.max(0,kt-150)/45,2)));
    return{fog,rain:fog+.45*(1-smooth(75,135,kt))};
  }
  // Bounded, continuous surges; separate phases prevent walls breathing in unison.
  const variation=(time,phase=0,amplitude=.70)=>1+amplitude*Math.sin(time*1.73+phase+.60*Math.sin(time*.71+phase*.7)+.35*Math.sin(time*.37-phase));
  function density(x,y,z,shift,phase,wave={axis:{x:1,y:0,z:0},wavelength:12,travel:0},pace=1){
    const axis=wave.axis,along=(x*axis.x+y*axis.y+z*axis.z)*Math.PI*2/wave.wavelength*pace-wave.travel,px=x-shift.x,py=y-shift.y,pz=z-shift.z;
    const warp=.18*Math.sin((px*axis.z-pz*axis.x)*.15+py*.06+phase*.4);
    const ripple=.76*Math.sin(along+warp)+.24*Math.sin(along*1.13+1.7+warp*.7);
    const broad=Math.sin((x-shift.x)*.08+(y-shift.y)*.05+(z-shift.z)*.11+phase*.4);
    return 1+.18*ripple+.06*broad;
  }
  const glsl=`uniform vec3 rainFogShift;uniform vec3 rainFogAxis;
    uniform float rainFogPhase;uniform float rainFogAmount;uniform float rainPatchAmount;
    uniform float rainFogWaveLength;uniform float rainFogTravel;uniform float rainFogMistTravel;uniform float rainFogPace;
    float rainFieldDensityAt(vec3 world,float pace,float travel){
      float along=dot(world,rainFogAxis)*6.28318530718/rainFogWaveLength*pace-travel;
      vec3 p=world-rainFogShift;
      float warp=.18*sin((p.x*rainFogAxis.z-p.z*rainFogAxis.x)*.15+p.y*.06+rainFogPhase*.4);
      float ripple=.76*sin(along+warp)+.24*sin(along*1.13+1.7+warp*.7);
      float broad=sin(p.x*.08+p.y*.05+p.z*.11+rainFogPhase*.4);
      return 1.+.18*ripple+.06*broad;
    }
    float rainFieldDensity(vec3 world,float pace){return rainFieldDensityAt(world,pace,rainFogTravel);}
    float rainMistDensity(vec3 world){return rainFieldDensityAt(world,rainFogPace,rainFogMistTravel);}`;
  return{density,glsl,smooth,frequencies,variation};
})();
function createRainFog(T){
  const uniforms={rainFogShift:{value:new T.Vector3()},rainFogAxis:{value:new T.Vector3()},rainFogPhase:{value:0},rainFogAmount:{value:0},rainPatchAmount:{value:0},rainFogWaveLength:{value:12},rainFogTravel:{value:0},rainFogMistTravel:{value:0},rainFogPace:{value:1/1.45}},installed=new WeakSet();
  const wave={axis:uniforms.rainFogAxis.value,wavelength:12,travel:0};let frequency=1.45,fogFrequency=1,fogTravel=0,cadenceFactor=1;
  let amount=0,frame=0,initialized=false;
  // Recover world position from the final model-view position, including instances/deformation.
  if(!T.ShaderChunk.fog_fragment.includes('rainFieldDensity')){
    T.ShaderChunk.fog_pars_vertex+='\n#ifdef USE_FOG\nvarying vec3 vRainFogWorld;\n#endif';
    T.ShaderChunk.fog_vertex+='\n#ifdef USE_FOG\nvRainFogWorld=cameraPosition+mvPosition.xyz*mat3(viewMatrix);\n#endif';
    T.ShaderChunk.fog_pars_fragment+='\n#ifdef USE_FOG\nvarying vec3 vRainFogWorld;\n'+RainField.glsl+'\n#endif';
    T.ShaderChunk.fog_fragment=T.ShaderChunk.fog_fragment.replace('float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );',`vec3 ray=vRainFogWorld-cameraPosition;
      float concentration=(rainMistDensity(cameraPosition+ray*.18)+rainMistDensity(cameraPosition+ray*.50)+rainMistDensity(cameraPosition+ray*.82))/3.;
      float opticalVariation=mix(1.,concentration,rainFogAmount);
      float fogFactor=1.-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth*opticalVariation);`);
  }
  function install(scene){
    scene.traverse(object=>{for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!material||material.fog===false||material.isShaderMaterial||installed.has(material))continue;
      installed.add(material);const before=material.onBeforeCompile,key=material.customProgramCacheKey();
      material.onBeforeCompile=function(shader,renderer){before.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);};
      material.customProgramCacheKey=()=>key+' / advected-rain-field';material.needsUpdate=true;
    }});
  }
  function update(dt,weather,visual,clearFog,scene){
    const step=Math.max(0,dt),shift=uniforms.rainFogShift.value;
    const flow={x:weather.ve*visual.curtainDrift,y:-visual.curtainFall,z:-weather.vn*visual.curtainDrift},speed=Math.max(.001,Math.hypot(flow.x,flow.y,flow.z));
    shift.x+=flow.x*step;shift.z+=flow.z*step;shift.y+=flow.y*step;
    const blend=initialized?1-Math.exp(-step*3):1;
    const rates=RainField.frequencies(weather.sustained??Math.hypot(weather.ve,weather.vn)*3600/1852);
    frequency+=(rates.rain-frequency)*blend;fogFrequency+=(rates.fog-fogFrequency)*blend;
    for(const axis of ['x','y','z'])wave.axis[axis]+=(flow[axis]/speed-wave.axis[axis])*blend;
    const norm=Math.max(.001,Math.hypot(wave.axis.x,wave.axis.y,wave.axis.z));for(const axis of ['x','y','z'])wave.axis[axis]/=norm;
    if(step>0)cadenceFactor=RainField.variation(uniforms.rainFogPhase.value+step*.5,0,.30);
    // Keep spatial wavelength tied to the mean rate: varying it would jump phase.
    wave.wavelength+=(Math.max(.5,speed/frequency)-wave.wavelength)*blend;wave.travel+=Math.PI*2*frequency*cadenceFactor*step;fogTravel+=Math.PI*2*fogFrequency*cadenceFactor*step;initialized=true;
    uniforms.rainFogWaveLength.value=wave.wavelength;uniforms.rainFogTravel.value=wave.travel;
    uniforms.rainFogMistTravel.value=fogTravel;uniforms.rainFogPace.value=fogFrequency/frequency;
    uniforms.rainFogPhase.value+=step;
    amount=RainField.smooth(6,70,weather.rain)*(.65+.35*visual.mistMix);
    uniforms.rainFogAmount.value=clearFog?0:amount;uniforms.rainPatchAmount.value=amount;
    if(scene&&frame++%60===0)install(scene);
  }
  const densityAt=(x,y,z,pace=1)=>1+(RainField.density(x,y,z,uniforms.rainFogShift.value,uniforms.rainFogPhase.value,wave,pace)-1)*amount;
  const fogDensityAt=(x,y,z)=>1+(RainField.density(x,y,z,uniforms.rainFogShift.value,uniforms.rainFogPhase.value,{...wave,travel:fogTravel},uniforms.rainFogPace.value)-1)*amount;
  const diagnostics=()=>({shift:{...uniforms.rainFogShift.value},phase:uniforms.rainFogPhase.value,amount,fogAmount:uniforms.rainFogAmount.value,frequency,fogFrequency,cadenceFactor,instantFogFrequency:fogFrequency*cadenceFactor,instantRainFrequency:frequency*cadenceFactor,wavelength:wave.wavelength,travel:wave.travel,fogTravel,samples:[fogDensityAt(-100,20,-60),fogDensityAt(0,20,-60),fogDensityAt(100,20,-60)]});
  return{install,update,densityAt,fogDensityAt,diagnostics,uniforms};
}
ViewAtmosphere.RainField=RainField;ViewAtmosphere.createRainFog=createRainFog;
/* Wind-aligned, softly bounded volumes. Only the surface spray stays flat.
 * Local box ray integration gives curtains real thickness from every heading,
 * including when the observer flies through them. No camera-facing billboards.
 */
function createMistCurtains(T,scene,random=Math.random,buildings=[],rainField=null){
  const groundCount=288,total=1350,halfExtent=560,items=[],range=(a,b)=>a+(b-a)*random();
  const uniforms={mistClock:{value:0},mistOpacity:{value:0},mistTint:{value:new T.Color('#c7d8d9')},mistUseBackground:{value:0},mistSceneDepth:{value:null},mistViewport:{value:new T.Vector2(1,1)},mistFarLog:{value:1}};
  if(rainField)Object.assign(uniforms,rainField.uniforms);
  const geometry=new T.BoxGeometry(1,1,1),meta=new Float32Array(total*3),floors=new Float32Array(total),fades=new Float32Array(total);
  for(let i=0;i<total;i++){
    const ground=i<groundCount;
    const p={ground,x:range(-halfExtent,halfExtent),z:range(-halfExtent,halfExtent),y:random(),length:(ground?range(18,62):range(28,110))*1.35,
      height:ground?range(1.4,3.8):range(24,100)*1.35,thickness:(ground?range(8,24):range(5,20))*1.35*(ground?3:6),
      phase:range(0,Math.PI*2),strength:range(.45,1.45),skew:range(-.22,.22),angle:0,fade:0,recycled:false,blocked:false,recovery:1,buildingFade:1};
    items.push(p);meta.set([p.phase,p.strength,ground?1:0],i*3);
  }
  geometry.setAttribute('mistMeta',new T.InstancedBufferAttribute(meta,3));
  geometry.setAttribute('mistFloor',new T.InstancedBufferAttribute(floors,1).setUsage(T.DynamicDrawUsage));
  geometry.setAttribute('mistFade',new T.InstancedBufferAttribute(fades,1).setUsage(T.DynamicDrawUsage));
  // Rasterize the exit faces even outside the volume: the near clipping plane
  // must not remove the entrance proxy just before the camera passes through it.
  const material=new T.ShaderMaterial({uniforms,defines:rainField?{RAIN_MIST_FIELD:1}:{},side:T.BackSide,transparent:true,depthWrite:false,toneMapped:false,
    vertexShader:`#include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec3 mistMeta;attribute float mistFloor;attribute float mistFade;varying float mistBlend;varying float mistBottom;varying vec3 mistLocal;varying vec3 mistCamera;varying vec3 mistInfo;varying vec3 mistScale;varying vec3 mistWorld;
      void main(){
        mat4 worldMatrix=modelMatrix*instanceMatrix;mat3 basis=mat3(worldMatrix);
        vec3 delta=cameraPosition-(worldMatrix*vec4(0.,0.,0.,1.)).xyz;
        mistCamera=vec3(dot(delta,basis[0])/dot(basis[0],basis[0]),dot(delta,basis[1])/dot(basis[1],basis[1]),dot(delta,basis[2])/dot(basis[2],basis[2]));
        mistScale=vec3(length(basis[0]),length(basis[1]),length(basis[2]));mistLocal=position;mistInfo=mistMeta;
        mistBottom=(mistFloor-worldMatrix[3].y)/mistScale.y;
        mistWorld=(worldMatrix*vec4(position,1.)).xyz;
        mistBlend=mistFade;
        vec4 mvPosition=viewMatrix*worldMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
        #include <logdepthbuf_vertex>
        if(mistBlend<.00001)gl_Position=vec4(2.,2.,2.,1.);
      }`,
    fragmentShader:`#include <logdepthbuf_pars_fragment>
      ${rainField?RainField.glsl:''}
      uniform float mistClock;uniform float mistOpacity;uniform vec3 mistTint;uniform float mistUseBackground;uniform sampler2D mistSceneDepth;uniform vec2 mistViewport;uniform float mistFarLog;
      varying float mistBlend;varying float mistBottom;varying vec3 mistLocal;varying vec3 mistCamera;varying vec3 mistInfo;varying vec3 mistScale;varying vec3 mistWorld;
      float curtainDensity(vec3 p){
        vec3 q=p*2.;float seed=mistInfo.x;
        // The broad bow and smaller folds evolve gently in material coordinates.
        q.z+=.12*sin(q.y*3.1+seed+mistClock*.21)+.07*sin(q.x*5.3-seed-mistClock*.17);
        q.x+=.06*sin(q.y*4.2+seed*.7+mistClock*.13);
        float outline=q.x*q.x+q.z*q.z+mix(pow(abs(q.y),4.),q.y*q.y,mistInfo.z);
        // Like the original radial-gradient mist, the whole outer tail dissolves.
        // Feather the unwarped support as well: folds must never expose box cuts.
        vec3 edge=1.-smoothstep(vec3(.50),vec3(1.),abs(p*2.));
        float floorFade=smoothstep(mistBottom,mistBottom+mix(12.,1.8,mistInfo.z)/mistScale.y,p.y);
        float envelope=exp(-2.4*outline)*edge.x*edge.y*edge.z*floorFade;
        float billow=.60+.23*sin(q.x*5.+q.y*2.8+seed+mistClock*.09)+.17*sin(q.y*7.1-q.z*3.4-seed*.6-mistClock*.12);
        return envelope*billow;
      }
      void main(){
        if(mistBlend<.00001)discard;
        vec3 ray=normalize(mistLocal-mistCamera);
        vec3 inv=sign(ray+vec3(.000001))/max(abs(ray),vec3(.00001));
        vec3 a=(-vec3(.5)-mistCamera)*inv,b=(vec3(.5)-mistCamera)*inv;
        vec3 lo=min(a,b),hi=max(a,b);
        float entry=max(0.,max(lo.x,max(lo.y,lo.z))),exit=min(hi.x,min(hi.y,hi.z)),backgroundWeight=1.;
        if(mistUseBackground>.5){
          float depth=texture2D(mistSceneDepth,gl_FragCoord.xy/mistViewport).x;
          // Clear depth is sky: motion fog must leave those pixels unchanged.
          if(depth>=.999999)discard;
          float surfaceDepth=exp2(depth*mistFarLog)-1.;
          backgroundWeight=1.-smoothstep(3500.,6500.,surfaceDepth);
          #ifdef USE_LOGDEPTHBUF_EXT
          exit=min(exit,surfaceDepth*length(mistLocal-mistCamera)/max(.00001,vFragDepth-1.));
          #endif
        }
        if(exit<=entry)discard;
        float segment=(exit-entry)/12.,opticalDepth=0.;
        for(int i=0;i<12;i++){
          vec3 p=mistCamera+ray*(entry+(float(i)+.5)*segment);
          opticalDepth+=curtainDensity(p);
        }
        opticalDepth*=segment*length(ray*mistScale)*mistOpacity*.25*mistInfo.y*mistBlend*backgroundWeight;
        #ifdef RAIN_MIST_FIELD
        vec3 middle=cameraPosition+(mistWorld-cameraPosition)*((entry+exit)*.5/max(.00001,length(mistLocal-mistCamera)));
        opticalDepth*=.25+1.25*smoothstep(.82,1.18,rainMistDensity(middle));
        #endif
        float alpha=1.-exp(-opticalDepth);
        if(alpha<.0002)discard;
        #include <logdepthbuf_fragment>
        #ifdef USE_LOGDEPTHBUF_EXT
        // Test against the ray entrance, rather than the far proxy face.
        // Inside the mist, the entrance is the camera itself.
        float frontDepth=(vFragDepth-1.)*entry/max(.00001,length(mistLocal-mistCamera));
        if(vIsPerspective>0.)gl_FragDepthEXT=log2(1.+max(0.,frontDepth))*logDepthBufFC*.5;
        #endif
        gl_FragColor=vec4(mistTint,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  material.forceSinglePass=true;
  const mesh=new T.InstancedMesh(geometry,material,total),object=new T.Object3D();
  mesh.name='随风移动的立体雨雾墙与近地薄雾';mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(mesh);
  let initialized=false;
  function update(dt,clock,weather,visual,camera,surfaceHeight){
    const step=Math.max(0,dt),angle=Math.atan2(weather.vn,weather.ve),blend=1-Math.exp(-step*1.8);
    uniforms.mistClock.value=clock;uniforms.mistOpacity.value=visual.mistOpacity*.16;
    mesh.count=visual.mistOpacity>.005?total:0;
    const wrap=(x,a,b)=>a+((x-a)%(b-a)+(b-a))%(b-a);
    for(let i=0;i<total;i++){
      const p=items[i];
      p.depthFactor=p.ground?1:RainField.variation(clock*.63,p.phase);
      if(!initialized){p.x+=camera.position.x;p.z+=camera.position.z;p.angle=angle+p.skew;}
      const nextX=p.x+weather.ve*visual.curtainDrift*1.25*step,nextZ=p.z-weather.vn*visual.curtainDrift*1.25*step;
      p.x=wrap(nextX,camera.position.x-halfExtent,camera.position.x+halfExtent);
      p.z=wrap(nextZ,camera.position.z-halfExtent,camera.position.z+halfExtent);
      p.recycled=Math.abs(nextX-p.x)>halfExtent||Math.abs(nextZ-p.z)>halfExtent;
      const surface=surfaceHeight(p.x),low=Math.max(surface-160,camera.position.y-220),high=camera.position.y+220;
      floors[i]=surface+(p.ground?0:4);
      if(!initialized)p.y=p.ground?surface+2:Math.max(surface+8,camera.position.y-100)+p.y*160;
      if(p.ground)p.y=surface+2;
      else{const nextY=p.y-visual.curtainFall*.12*step;p.y=wrap(nextY,low,high);p.recycled=p.recycled||Math.abs(nextY-p.y)>(high-low)*.5;}
      // Every face of the recycle volume lies beyond a fully transparent buffer.
      // The wide horizontal feather spans several seconds at hurricane flow speeds.
      const distance=Math.max(Math.abs(p.x-camera.position.x),Math.abs(p.z-camera.position.z));
      p.fade=(1-RainField.smooth(150,430,distance))*(1-RainField.smooth(110,190,Math.abs(p.y-camera.position.y)));
      p.angle+=Math.atan2(Math.sin(angle+p.skew-p.angle),Math.cos(angle+p.skew-p.angle))*blend;
      // Suppress the whole supported volume before it intersects a solid building.
      // After clearing the facade, rebuild opacity over weather seconds instead
      // of exposing a full-strength curtain as soon as it emerges from the wall.
      const c=Math.abs(Math.cos(p.angle)),s=Math.abs(Math.sin(p.angle)),supportLength=p.length*(p.ground?1:1.70),rx=(c*supportLength+s*p.thickness)*.5,rz=(s*supportLength+c*p.thickness)*.5,ry=p.height*.5;
      let clearance=1;p.blocked=false;
      for(const b of buildings){
        const gapX=Math.max(b.minX-p.x-rx,p.x-rx-b.maxX),gapZ=Math.max(b.minZ-p.z-rz,p.z-rz-b.maxZ),gapY=Math.max(b.minY-p.y-ry,p.y-ry-b.maxY);
        const gap=Math.max(gapX/24,gapZ/24,gapY/8);
        clearance=Math.min(clearance,RainField.smooth(0,1,gap));
        if(gap<=0)p.blocked=true;
      }
      p.recovery=p.blocked?0:Math.min(1,p.recovery+step/2.5);
      p.buildingFade=clearance*RainField.smooth(0,1,p.recovery);
      fades[i]=p.fade*p.buildingFade;
      object.position.set(p.x,p.y,p.z);object.rotation.set(0,p.angle,0);object.scale.set(p.length*p.depthFactor,p.height,p.thickness);
      object.updateMatrix();mesh.setMatrixAt(i,object.matrix);
    }
    initialized=true;mesh.instanceMatrix.needsUpdate=true;geometry.attributes.mistFloor.needsUpdate=true;geometry.attributes.mistFade.needsUpdate=true;
  }
  function diagnostics(){
    return{count:mesh.count,opacity:uniforms.mistOpacity.value,clock:uniforms.mistClock.value,groundCount:mesh.count?groundCount:0,wallCount:mesh.count?total-groundCount:0,halfExtent,fadeStart:150,fadeEnd:430,buildingCount:buildings.length,recoverySeconds:2.5,sizeFactor:1.35,crosswindFactor:6,speedFactor:1.25,skyMask:uniforms.mistUseBackground.value>.5,frequency:rainField?.diagnostics().fogFrequency,
      items:items.map((p,index)=>({index,ground:p.ground,world:{x:p.x,y:p.y,z:p.z},length:p.length*p.depthFactor,baseLength:p.length,depthFactor:p.depthFactor,height:p.height,thickness:p.thickness,angle:p.angle,strength:p.strength,fade:p.fade,recycled:p.recycled,blocked:p.blocked,recovery:p.recovery,buildingFade:p.buildingFade}))};
  }
  function setBackground(depth,size,far){uniforms.mistSceneDepth.value=depth;uniforms.mistViewport.value.copy(size);uniforms.mistFarLog.value=Math.log2(far+1);uniforms.mistUseBackground.value=1;}
  return{update,diagnostics,mesh,setBackground};
}
ViewAtmosphere.createMistCurtains=createMistCurtains;
if(typeof module!=='undefined'&&module.exports)module.exports=ViewAtmosphere;
