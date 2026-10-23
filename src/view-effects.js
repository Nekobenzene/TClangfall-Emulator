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
/* World-space rain concentration: translated by the flow, with slow deformation. */
const RainField=(()=>{
  const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
  function density(x,y,z,shift,phase){
    x-=shift.x;y-=shift.y;z-=shift.z;
    const warp=Math.sin((x+z)*.006+phase*.08)*22;
    const a=Math.sin((x+warp)*.017+y*.019),b=Math.sin((z-warp*.7)*.023-y*.013+phase*.07),c=Math.sin((x*.8+z)*.049+y*.028-phase*.11);
    return .12+1.76*smooth(.18,.82,.5+.5*(.55*a+.30*b+.15*c));
  }
  const glsl=`uniform vec3 rainFogShift;uniform float rainFogPhase;uniform float rainFogAmount;
    float rainFieldDensity(vec3 world){
      vec3 p=world-rainFogShift;
      float warp=sin((p.x+p.z)*.006+rainFogPhase*.08)*22.;
      float a=sin((p.x+warp)*.017+p.y*.019);
      float b=sin((p.z-warp*.7)*.023-p.y*.013+rainFogPhase*.07);
      float c=sin((p.x*.8+p.z)*.049+p.y*.028-rainFogPhase*.11);
      return .12+1.76*smoothstep(.18,.82,.5+.5*(.55*a+.30*b+.15*c));
    }`;
  return{density,glsl,smooth};
})();
function createRainFog(T){
  const uniforms={rainFogShift:{value:new T.Vector3()},rainFogPhase:{value:0},rainFogAmount:{value:0}},installed=new WeakSet();
  let amount=0,frame=0;
  // Recover world position from the final model-view position, including instances/deformation.
  if(!T.ShaderChunk.fog_fragment.includes('rainFieldDensity')){
    T.ShaderChunk.fog_pars_vertex+='\n#ifdef USE_FOG\nvarying vec3 vRainFogWorld;\n#endif';
    T.ShaderChunk.fog_vertex+='\n#ifdef USE_FOG\nvRainFogWorld=cameraPosition+mvPosition.xyz*mat3(viewMatrix);\n#endif';
    T.ShaderChunk.fog_pars_fragment+='\n#ifdef USE_FOG\nvarying vec3 vRainFogWorld;\n'+RainField.glsl+'\n#endif';
    T.ShaderChunk.fog_fragment=T.ShaderChunk.fog_fragment.replace('float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );',`vec3 ray=vRainFogWorld-cameraPosition;
      float concentration=(rainFieldDensity(cameraPosition+ray*.18)+rainFieldDensity(cameraPosition+ray*.50)+rainFieldDensity(cameraPosition+ray*.82))/3.;
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
    shift.x+=weather.ve*visual.curtainDrift*step;shift.z-=weather.vn*visual.curtainDrift*step;shift.y-=visual.curtainFall*step;
    uniforms.rainFogPhase.value+=step;
    amount=RainField.smooth(6,70,weather.rain)*(.65+.35*visual.mistMix);
    uniforms.rainFogAmount.value=clearFog?0:amount;
    if(scene&&frame++%60===0)install(scene);
  }
  const densityAt=(x,y,z)=>1+(RainField.density(x,y,z,uniforms.rainFogShift.value,uniforms.rainFogPhase.value)-1)*amount;
  const diagnostics=()=>({shift:{...uniforms.rainFogShift.value},phase:uniforms.rainFogPhase.value,amount,fogAmount:uniforms.rainFogAmount.value,samples:[densityAt(-100,20,-60),densityAt(0,20,-60),densityAt(100,20,-60)]});
  return{install,update,densityAt,diagnostics,uniforms};
}
ViewAtmosphere.RainField=RainField;ViewAtmosphere.createRainFog=createRainFog;
if(typeof module!=='undefined'&&module.exports)module.exports=ViewAtmosphere;
