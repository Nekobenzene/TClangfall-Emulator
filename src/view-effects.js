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
  const material=new T.ShaderMaterial({uniforms:{sceneImage:{value:target.texture},amount:{value:0}},depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 uvPos;void main(){uvPos=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:'uniform sampler2D sceneImage;uniform float amount;varying vec2 uvPos;void main(){vec2 p=(uvPos-.5)*2.;float r=dot(p,p);vec2 q=p*(1.+amount*.055*r)/(1.+amount*.11);vec3 color=texture2D(sceneImage,.5+q*.5).rgb;gl_FragColor=vec4(color*(1.-amount*.055*smoothstep(.35,1.6,r)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});
  screen.add(new T.Mesh(new T.PlaneGeometry(2,2),material));
  const size=new T.Vector2();
  function render(scene,viewCamera,zoom){
    const amount=Math.min(1,Math.max(0,(1-zoom)/.65));
    if(amount<.002){renderer.render(scene,viewCamera);return;}
    renderer.getDrawingBufferSize(size);if(target.width!==size.x||target.height!==size.y)target.setSize(size.x,size.y);
    material.uniforms.amount.value=amount;renderer.setRenderTarget(target);renderer.render(scene,viewCamera);renderer.setRenderTarget(null);renderer.render(screen,camera);
  }
  return{render};
}
/* Short, gentle concentration ripples. Rain ~1.45 Hz, fog ~1 Hz at a fixed observer. */
const RainField=(()=>{
  const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
  function density(x,y,z,shift,phase,wave={axis:{x:1,y:0,z:0},wavelength:12,travel:0},pace=1){
    const axis=wave.axis,along=((x*axis.x+y*axis.y+z*axis.z)*Math.PI*2/wave.wavelength-wave.travel)*pace,px=x-shift.x,py=y-shift.y,pz=z-shift.z;
    const warp=.18*Math.sin((px*axis.z-pz*axis.x)*.15+py*.06+phase*.4);
    const ripple=.76*Math.sin(along+warp)+.24*Math.sin(along*1.13+1.7+warp*.7);
    const broad=Math.sin((x-shift.x)*.08+(y-shift.y)*.05+(z-shift.z)*.11+phase*.4);
    return 1+.18*ripple+.06*broad;
  }
  const glsl=`uniform vec3 rainFogShift;uniform vec3 rainFogAxis;
    uniform float rainFogPhase;uniform float rainFogAmount;uniform float rainPatchAmount;
    uniform float rainFogWaveLength;uniform float rainFogTravel;uniform float rainFogPace;
    float rainFieldDensity(vec3 world,float pace){
      float along=(dot(world,rainFogAxis)*6.28318530718/rainFogWaveLength-rainFogTravel)*pace;
      vec3 p=world-rainFogShift;
      float warp=.18*sin((p.x*rainFogAxis.z-p.z*rainFogAxis.x)*.15+p.y*.06+rainFogPhase*.4);
      float ripple=.76*sin(along+warp)+.24*sin(along*1.13+1.7+warp*.7);
      float broad=sin(p.x*.08+p.y*.05+p.z*.11+rainFogPhase*.4);
      return 1.+.18*ripple+.06*broad;
    }`;
  return{density,glsl,smooth};
})();
function createRainFog(T){
  const uniforms={rainFogShift:{value:new T.Vector3()},rainFogAxis:{value:new T.Vector3()},rainFogPhase:{value:0},rainFogAmount:{value:0},rainPatchAmount:{value:0},rainFogWaveLength:{value:12},rainFogTravel:{value:0},rainFogPace:{value:1/1.45}},installed=new WeakSet();
  const wave={axis:uniforms.rainFogAxis.value,wavelength:12,travel:0},frequency=1.45;
  let amount=0,frame=0,initialized=false;
  // Recover world position from the final model-view position, including instances/deformation.
  if(!T.ShaderChunk.fog_fragment.includes('rainFieldDensity')){
    T.ShaderChunk.fog_pars_vertex+='\n#ifdef USE_FOG\nvarying vec3 vRainFogWorld;\n#endif';
    T.ShaderChunk.fog_vertex+='\n#ifdef USE_FOG\nvRainFogWorld=cameraPosition+mvPosition.xyz*mat3(viewMatrix);\n#endif';
    T.ShaderChunk.fog_pars_fragment+='\n#ifdef USE_FOG\nvarying vec3 vRainFogWorld;\n'+RainField.glsl+'\n#endif';
    T.ShaderChunk.fog_fragment=T.ShaderChunk.fog_fragment.replace('float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );',`vec3 ray=vRainFogWorld-cameraPosition;
      float concentration=(rainFieldDensity(cameraPosition+ray*.18,rainFogPace)+rainFieldDensity(cameraPosition+ray*.50,rainFogPace)+rainFieldDensity(cameraPosition+ray*.82,rainFogPace))/3.;
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
    for(const axis of ['x','y','z'])wave.axis[axis]+=(flow[axis]/speed-wave.axis[axis])*blend;
    const norm=Math.max(.001,Math.hypot(wave.axis.x,wave.axis.y,wave.axis.z));for(const axis of ['x','y','z'])wave.axis[axis]/=norm;
    wave.wavelength+=(Math.max(.5,speed/frequency)-wave.wavelength)*blend;wave.travel+=Math.PI*2*frequency*step;initialized=true;
    uniforms.rainFogWaveLength.value=wave.wavelength;uniforms.rainFogTravel.value=wave.travel;
    uniforms.rainFogPhase.value+=step;
    amount=RainField.smooth(6,70,weather.rain)*(.65+.35*visual.mistMix);
    uniforms.rainFogAmount.value=clearFog?0:amount;uniforms.rainPatchAmount.value=amount;
    if(scene&&frame++%60===0)install(scene);
  }
  const densityAt=(x,y,z,pace=1)=>1+(RainField.density(x,y,z,uniforms.rainFogShift.value,uniforms.rainFogPhase.value,wave,pace)-1)*amount;
  const fogDensityAt=(x,y,z)=>densityAt(x,y,z,uniforms.rainFogPace.value);
  const diagnostics=()=>({shift:{...uniforms.rainFogShift.value},phase:uniforms.rainFogPhase.value,amount,fogAmount:uniforms.rainFogAmount.value,frequency,fogFrequency:frequency*uniforms.rainFogPace.value,wavelength:wave.wavelength,travel:wave.travel,samples:[fogDensityAt(-100,20,-60),fogDensityAt(0,20,-60),fogDensityAt(100,20,-60)]});
  return{install,update,densityAt,fogDensityAt,diagnostics,uniforms};
}
ViewAtmosphere.RainField=RainField;ViewAtmosphere.createRainFog=createRainFog;
if(typeof module!=='undefined'&&module.exports)module.exports=ViewAtmosphere;
