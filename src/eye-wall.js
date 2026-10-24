/* A world-scale eyewall: km controls are converted to metres, never a camera-following ring. */
const EyeWall=(()=>{
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  const configured=(key,fallback,context)=>typeof SimulatorConfig!=='undefined'?SimulatorConfig.formula(key,fallback,context):fallback();
  function shape(intensity,eyeRadius,wallRadius){
    const mature=smooth(145,185,intensity),inner=eyeRadius*1000,outer=wallRadius*1000;
    const height=configured('eye.wallHeight',()=>11500+5500*mature,{intensity,eyeRadius,wallRadius,mature});
    return{inner,outer,height,base:280,tilt:Math.min((outer-inner)*.52,height*(.30+.25*mature)),
      ragged:.028-.018*mature,formation:smooth(95,105,intensity),mature};
  }
  function section(s,angle,q){
    const wave=.60*Math.sin(angle*5+.4)+.27*Math.sin(angle*11-1.3)+.13*Math.sin(angle*19);
    const top=s.height*(1+(.07-.025*s.mature)*wave);
    return{inner:s.inner*(1+s.ragged*wave)+s.tilt*Math.pow(q,.85),outer:s.outer+s.tilt*.22*q,
      y:s.base+(top-s.base)*q};
  }
  // Ray/tilted-inner-wall intersection, used to occlude the decorative sun disk.
  function intersects(s,origin,direction){
    const k=s.tilt/(s.height-s.base),r=s.inner+k*(origin.y-s.base);
    const a=direction.x**2+direction.z**2-(k*direction.y)**2;
    const b=2*(origin.x*direction.x+origin.z*direction.z-r*k*direction.y);
    const c=origin.x**2+origin.z**2-r*r,disc=b*b-4*a*c;
    if(disc<0||Math.abs(a)<1e-10)return false;
    for(const t of [(-b-Math.sqrt(disc))/(2*a),(-b+Math.sqrt(disc))/(2*a)]){
      const h=origin.y+t*direction.y;if(t>0&&h>=s.base&&h<=s.height)return true;
    }
    return false;
  }
  function environment(intensity,eyeRadius,stormRadius,distance){
    const inEye=intensity>=67&&distance<eyeRadius;
    const inside=inEye?1-smooth(eyeRadius*.965,eyeRadius,distance):0;
    const eyeClouds=configured('eye.cloudCoverage',()=>inEye?(1-smooth(130,190,intensity))*inside:0,{inEye,intensity,eyeRadius,distance,inside});
    const deck=intensity<34?0:(intensity>=67?smooth(eyeRadius*.98,eyeRadius,distance):1)*(1-smooth(stormRadius*.97,stormRadius,distance));
    return{inEye,wallVisibility:inside,deck,lowClouds:eyeClouds,midClouds:Math.pow(eyeClouds,1.25)};
  }
  const angularSpeed=(intensity,rmw)=>configured('eye.angularSpeed',()=>intensity*(1852/3600)/Math.max(1000,rmw*1000),{intensity,rmw});
  // Franklin et al. (2003): 10 m wind ~75% of the ~500 m maximum.
  // A rounded proxy for low-cloud advection, not a universal cloud-motion fit.
  function cloudMotion(weather){
    const cloudWindFactor=1.3,speed=Math.max(0,weather.sustained??0)*(1852/3600)*cloudWindFactor;
    const direction=Math.hypot(weather.ve??0,weather.vn??0);
    return{factor:cloudWindFactor,speed:direction>0?speed:0,x:direction>0?weather.ve/direction*speed:0,z:direction>0?-weather.vn/direction*speed:0};
  }
  function ceiling(state,weather,distance){
    const env=environment(state.intensity,state.eyeRadius,state.stormRadius,distance);
    const outside=state.intensity<34?1:smooth(state.stormRadius*.95,state.stormRadius*1.05,distance);
    const wall=state.intensity<67?0:1-smooth(state.wallRadius,state.wallRadius+15,distance);
    const base=(400-120*wall)*(1-outside)+650*outside;
    const cover=(weather.rain??0)>0?1:(weather.cloudCover??0);
    return{base,coverage:Math.max(env.inEye?0:env.deck,cover)};
  }
  // Rain-only extinction preserves far dry-eye cloud detail; the 11 km background
  // component is removed before applying a weak, clear-air distance haze.
  function cloudTransmission(visibility,distance,concentration=1){
    const beta=Math.max(0,Math.log(20)/Math.max(55,visibility)-Math.log(20)/11000);
    return Math.exp(-Math.max(0,distance)*(beta*concentration+1/80000));
  }
  return{shape,section,intersects,smooth,environment,angularSpeed,cloudMotion,ceiling,cloudTransmission};
})();

function createEyeWall(T,scene,eyeUniforms=createEyeCloudUniforms(T)){
  const group=new T.Group();group.name='按实际半径渲染的眼墙';group.visible=false;scene.add(group);
  const uniforms={...eyeUniforms,opacity:{value:0},cloudHeight:{value:16000},cloudTime:{value:0},cloudBase:{value:280},
    sunDir:{value:new T.Vector3(1100,640,-950).normalize()}};
  const material=new T.ShaderMaterial({uniforms,defines:eyeUniforms.rainFogAmount?{RAIN_CLOUD_FIELD:1}:{},side:T.DoubleSide,transparent:true,depthWrite:true,toneMapped:false,
    extensions:{derivatives:true},
    vertexShader:`varying vec3 localP;varying vec3 worldP;varying vec3 cloudNormal;
      uniform float cloudBase;uniform float cloudHeight;
      ${CLOUD_BASE_GLSL}
      void main(){vec4 p=vec4(position,1.);vec3 n=normal;
        #ifdef USE_INSTANCING
        mat3 im=mat3(instanceMatrix);n=im*(n/vec3(dot(im[0],im[0]),dot(im[1],im[1]),dot(im[2],im[2])));p=instanceMatrix*p;
        #endif
        p.y+=cloudBaseRipple(p.xz)*(1.-smoothstep(cloudBase,cloudBase+1800.,p.y));
        localP=p.xyz;vec4 w=modelMatrix*p;worldP=w.xyz;cloudNormal=normalize(mat3(modelMatrix)*n);
        gl_Position=projectionMatrix*viewMatrix*w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader:`uniform float opacity;uniform float cloudHeight;
      uniform vec3 sunDir;varying vec3 localP;varying vec3 worldP;varying vec3 cloudNormal;
      #include <logdepthbuf_pars_fragment>
      ${EYE_CLOUD_GLSL}
      float hashCloud(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noiseCloud(vec2 p,float period){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec2 a=vec2(mod(i.x,period),i.y),b=vec2(mod(i.x+1.,period),i.y);return mix(mix(hashCloud(a),hashCloud(b),f.x),mix(hashCloud(a+vec2(0.,1.)),hashCloud(b+vec2(0.,1.)),f.x),f.y);}
      void main(){
        #include <logdepthbuf_fragment>
        float h=clamp(localP.y/cloudHeight,0.,1.);
        float azimuth=(atan(localP.z,localP.x)+3.14159265)/6.2831853;
        vec2 uv=vec2(azimuth*64.-h*23.,h*15.);
        float underside=smoothstep(.45,.9,abs(normalize(cloudNormal).y))*(1.-smoothstep(600.,1800.,localP.y));
        uv=mix(uv,localP.xz/900.,underside);
        float warp=noiseCloud(vec2(azimuth*16.,h*5.),16.);
        uv+=vec2(warp*3.5,warp*.65);
        float broad=noiseCloud(uv,64.);
        float filament=noiseCloud(vec2(uv.x*2.,uv.y*3.8),128.);
        float fine=noiseCloud(vec2(uv.x*4.,uv.y*9.),256.);
        float spiral=sin(h*92.-azimuth*6.2831853*7.+warp*3.5);
        float billow=.50*broad+.32*filament+.18*fine;
        float light=max(0.,dot(normalize(cloudNormal),sunDir));
        vec3 color=mix(vec3(.24,.29,.33),vec3(.86,.90,.94),smoothstep(.02,.85,h));
        color=color*(.83+.23*light)+(billow-.5)*(.38+.12*h)+spiral*.027+light*vec3(.08,.075,.065);
        float distanceToCloud=length(worldP-cameraPosition);
        color=mix(eyeHaze,color,cloudTransmission(cameraPosition,normalize(worldP-cameraPosition),distanceToCloud));
        vec4 foreground=eyeCloudAlong(cameraPosition,normalize(worldP-cameraPosition),distanceToCloud);
        color=mix(color,foreground.rgb,foreground.a);
        gl_FragColor=vec4(color,opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  // The default shader chunks require the matching vertex declaration for logarithmic depth.
  material.vertexShader='#include <common>\n#include <logdepthbuf_pars_vertex>\n'+material.vertexShader;
  let signature='',current=null,phase=0,lastSimTime=null;
  function rebuild(s){
    for(const child of [...group.children]){group.remove(child);child.geometry.dispose();}
    const vertices=[],indices=[],segments=288,levels=100;
    function strip(point,rows){const start=vertices.length/3;
      for(let j=0;j<=rows;j++)for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2;vertices.push(...point(a,j/rows));}
      for(let j=0;j<rows;j++)for(let i=0;i<segments;i++){const a=start+j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);}
    }
    for(const outer of [false,true])strip((a,q)=>{const p=EyeWall.section(s,a,q),fold=Math.sin(a*7-q*15+Math.sin(a*3+q*6)*.7)*230+Math.sin(a*17-q*31)*90,r=(outer?p.outer:p.inner)+fold*Math.sin(q*Math.PI);return[Math.cos(a)*r,p.y*(outer?.94:1),Math.sin(a)*r];},levels);
    strip((a,q)=>{const p=EyeWall.section(s,a,1),r=p.inner+(p.outer-p.inner)*q;return[Math.cos(a)*r,p.y*(1-.06*q)+Math.sin(q*Math.PI)*s.height*.025,Math.sin(a)*r];},8);
    // Close the annular cloud base, matching both side-wall bottom rings exactly.
    // Keep the eye opening clear; rain extinction, rather than a base fade, hides it.
    strip((a,q)=>{const p=EyeWall.section(s,a,0),r=p.inner+(p.outer-p.inner)*q;return[Math.cos(a)*r,p.y*(1-.06*q),Math.sin(a)*r];},Math.max(8,Math.min(160,Math.ceil((s.outer-s.inner)/500))));
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const shell=new T.Mesh(geometry,material);shell.renderOrder=2;group.add(shell);
  }
  function update(state,weather,observer,haze){
    current=EyeWall.shape(state.intensity,state.eyeRadius,state.wallRadius);
    const distance=Math.hypot(state.east-observer.east,state.north-observer.north)*1000;
    const rmw=state.rmw??(state.eyeRadius+(state.wallRadius-state.eyeRadius)*.52),omega=EyeWall.angularSpeed(state.intensity,rmw);
    if(lastSimTime!==null){const delta=state.simTime-lastSimTime;if(delta<0)phase=0;else phase+=omega*delta;}lastSimTime=state.simTime;
    group.rotation.y=phase;
    const environment=EyeWall.environment(state.intensity,state.eyeRadius,state.stormRadius??110,distance/1000);
    const viewVisibility=state.clearFog?22000:weather.visibility;
    // The cloud wall exists once the central rain stops. Dense eye clouds, flat light and
    // aerial scattering conceal it first; gaps gradually reveal its continuous surface.
    const alpha=current.formation*environment.wallVisibility;
    group.visible=alpha>.001;if(!group.visible)return{sunBlocked:false,visible:false};
    const key=[state.intensity,state.eyeRadius,state.wallRadius].join('/');if(key!==signature){rebuild(current);signature=key;}
    group.position.set(state.east*1000,0,55-state.north*1000);
    uniforms.opacity.value=alpha;uniforms.cloudHeight.value=current.height;uniforms.cloudBase.value=current.base;uniforms.cloudTime.value=state.simTime;uniforms.eyeVisibility.value=viewVisibility;uniforms.eyeHaze.value.copy(haze);
    return{sunBlocked:EyeWall.intersects(current,{x:observer.x-group.position.x,y:observer.y,z:observer.z-group.position.z},uniforms.sunDir.value),formation:current.formation,visible:true,height:current.height,rotationPeriod:Math.PI*2/omega};
  }
  return{update,group};
}
// Two broad undulations, kilometre wavelengths and a bounded +/-35 m excursion.
const CLOUD_BASE_GLSL=`uniform float cloudTime;
  float cloudBaseRipple(vec2 p){return 35.*(.65*sin(dot(p,vec2(.0017952,.0006283))+cloudTime*.0009)+.35*sin(dot(p,vec2(-.0003021,.0012083))-cloudTime*.0006));}`;
// Both sky and wall trace exactly the same foreground cloud banks, so openings
// reveal the wall naturally without giant transparent-plane depth seams.
const EYE_CLOUD_GLSL=`${typeof RainField!=='undefined'?RainField.glsl:''}
  uniform vec3 eyeCenter;uniform float eyeSpan;uniform vec4 eyeRotation;
  uniform float eyeLow;uniform float eyeMid;uniform float eyeSun;
  uniform float eyeVisibility;uniform vec3 eyeHaze;
  float cloudTransmission(vec3 origin,vec3 ray,float distanceToCloud){
    float concentration=1.;
    #ifdef RAIN_CLOUD_FIELD
    concentration=mix(1.,(rainMistDensity(origin+ray*distanceToCloud*.18)+rainMistDensity(origin+ray*distanceToCloud*.50)+rainMistDensity(origin+ray*distanceToCloud*.82))/3.,rainFogAmount);
    #endif
    float beta=max(0.,2.99573227/max(55.,eyeVisibility)-2.99573227/11000.);
    return exp(-max(0.,distanceToCloud)*(beta*concentration+1./80000.));
  }
  float noiseEye(vec2 p){return .5+.20*sin(dot(p,vec2(1.37,1.91))+1.2*sin(dot(p,vec2(-.61,1.13))))+.17*cos(dot(p,vec2(-1.69,.93))+.9*sin(dot(p,vec2(.83,.57))))+.13*sin(dot(p,vec2(2.13,-1.47))+1.5*cos(dot(p,vec2(.53,1.73))));}
  float eyeField(vec2 p){return .55*noiseEye(p)+.28*noiseEye(p*2.3)+.12*noiseEye(p*5.7)+.05*noiseEye(p*13.);}
  vec4 eyeCloudAlong(vec3 origin,vec3 ray,float limit){
    vec3 sum=vec3(0.);float transmission=1.;
    if(eyeLow<.0001||abs(ray.y)<.00001)return vec4(0.);
    mat2 rotation=mat2(eyeRotation.x,eyeRotation.y,eyeRotation.z,eyeRotation.w);
    for(int i=0;i<5;i++){
      float index=ray.y>0.?float(i):4.-float(i);
      float middle=step(2.5,index),coverage=mix(eyeLow,eyeMid,middle);
      float height=mix(750.+index*390.,2700.+(index-3.)*1050.,middle)*(1.15-.15*coverage);
      float distanceToLayer=(height-origin.y)/ray.y;
      if(distanceToLayer<=0.||distanceToLayer>=limit)continue;
      vec2 local=rotation*(origin.xz+ray.xz*distanceToLayer-eyeCenter.xz);
      float edge=1.-smoothstep(.80,1.,length(local)/eyeSpan);
      if(edge<=0.)continue;
      vec2 uv=local/1900.+index*19.71;
      // Warped continuous waves avoid lattice edges and form billowing connected banks.
      uv+=vec2(noiseEye(uv*.68+8.2),noiseEye(uv*.68-3.7))*1.4;
      float n=eyeField(uv),threshold=.88-coverage*.87;
      float density=smoothstep(threshold-.10,threshold+.13,n);
      float alpha=edge*density*smoothstep(0.,.10,coverage)*.985;
      float light=clamp(.52+(eyeField(uv+vec2(.22,-.13))-n)*3.2,0.,1.);
      vec3 color=mix(vec3(.29,.35,.40),vec3(.80,.85,.88),light)*(.87+eyeSun*.24);
      color=mix(eyeHaze,color,cloudTransmission(origin,ray,distanceToLayer));
      sum+=transmission*alpha*color;transmission*=1.-alpha;
    }
    return vec4(sum/max(.00001,1.-transmission),1.-transmission);
  }`;
function createEyeCloudUniforms(T,rainUniforms={}){
  return{...rainUniforms,deckShift:{value:new T.Vector2()},eyeCenter:{value:new T.Vector3()},eyeSpan:{value:15000},eyeRotation:{value:new T.Vector4(1,0,0,1)},eyeLow:{value:0},eyeMid:{value:0},eyeSun:{value:0},eyeVisibility:{value:11000},eyeHaze:{value:new T.Color()}};
}
function createEyeClouds(T,rainUniforms={}){
  const uniforms=createEyeCloudUniforms(T,rainUniforms);
  let lastSimTime=null;
  function update(state,observer,weather,haze,phase,weatherDt=0){
    const shift=uniforms.deckShift.value,motion=EyeWall.cloudMotion(weather);
    if(lastSimTime!==null&&state.simTime<lastSimTime)shift.set(0,0);
    else{shift.x+=motion.x*Math.max(0,weatherDt);shift.y+=motion.z*Math.max(0,weatherDt);}
    lastSimTime=state.simTime;
    const distance=Math.hypot(state.east-observer.east,state.north-observer.north),env=EyeWall.environment(state.intensity,state.eyeRadius,state.stormRadius,distance);
    uniforms.eyeCenter.value.set(state.east*1000,0,55-state.north*1000);uniforms.eyeSpan.value=state.eyeRadius*1000;
    uniforms.eyeLow.value=env.lowClouds;uniforms.eyeMid.value=env.midClouds;
    // Density sampling uses the inverse world rotation: a cloud travelling east
    // to north must still sample its original material point, not rotate it twice.
    const cloudPhase=phase*1,c=Math.cos(cloudPhase),s=Math.sin(cloudPhase);
    uniforms.eyeRotation.value.set(c,s,-s,c);
    uniforms.eyeSun.value=weather.sunshine;uniforms.eyeVisibility.value=state.clearFog?22000:weather.visibility;uniforms.eyeHaze.value.copy(haze);
    return{...env,ceiling:EyeWall.ceiling(state,weather,distance)};
  }
  return{uniforms,update,diagnostics:weather=>({...EyeWall.cloudMotion(weather),shift:{x:uniforms.deckShift.value.x,z:uniforms.deckShift.value.y}})};
}
// A continuous low ceiling, with no distant circular storm boundary drawn on the sky.
function createStormSky(T,eyeUniforms=createEyeCloudUniforms(T)){
  return new T.Mesh(new T.SphereGeometry(4500,32,24),new T.ShaderMaterial({defines:eyeUniforms.rainFogAmount?{RAIN_CLOUD_FIELD:1}:{},side:T.BackSide,depthWrite:false,toneMapped:false,
    uniforms:{...eyeUniforms,top:{value:new T.Color('#45565e')},bottom:{value:new T.Color('#adb9bb')},horizonHaze:{value:new T.Color('#adb9bb')},clock:{value:0},veil:{value:0},deck:{value:0},deckHeight:{value:400},cloudTime:{value:0}},
    vertexShader:'varying vec3 pos;void main(){pos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 pos;uniform vec3 top;uniform vec3 bottom;uniform vec3 horizonHaze;uniform float clock;uniform float veil;uniform float deck;uniform float deckHeight;uniform vec2 deckShift;
      ${CLOUD_BASE_GLSL}
      ${EYE_CLOUD_GLSL}
      void main(){vec3 p=normalize(pos);float h=max(0.,p.y);
        float clouds=sin(p.x*18.+sin(p.z*16.)*1.8+clock*.006)*sin(p.z*22.+p.x*9.);
        float shade=clouds*.025*smoothstep(0.,.3,h);
        vec3 color=mix(mix(bottom,top,smoothstep(0.,.8,h))+shade,bottom,veil);
        color=mix(color,horizonHaze,(1.-smoothstep(.005,.18,h))*.96);
        if(abs(p.y)>.00001){
          float distanceToDeck=(deckHeight-cameraPosition.y)/p.y;
          for(int i=0;i<3;i++){
            vec2 ground=cameraPosition.xz+p.xz*distanceToDeck;
            distanceToDeck=(deckHeight+cloudBaseRipple(ground)-cameraPosition.y)/p.y;
          }
          if(distanceToDeck>0.){
            vec2 uv=(cameraPosition.xz+p.xz*distanceToDeck-deckShift)/1800.;
            uv+=vec2(noiseEye(uv*.68+8.2),noiseEye(uv*.68-3.7))*.8;
            float n=eyeField(uv);
            float light=clamp(.52+(eyeField(uv+vec2(.22,-.13))-n)*3.2,0.,1.);
            vec3 ceiling=mix(vec3(.29,.35,.40),vec3(.80,.85,.88),light)+vec3((n-.5)*.10);
            ceiling=mix(eyeHaze,ceiling,cloudTransmission(cameraPosition,p,distanceToDeck));
            color=mix(color,ceiling,deck);
          }
        }
        vec4 banks=eyeCloudAlong(cameraPosition,p,800000.);color=mix(color,banks.rgb,banks.a);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`}));
}
if(typeof module!=='undefined'&&module.exports)module.exports=EyeWall;
