/* A world-scale eyewall: km controls are converted to metres, never a camera-following ring. */
const EyeWall=(()=>{
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  const configured=(key,fallback,context)=>typeof SimulatorConfig!=='undefined'?SimulatorConfig.formula(key,fallback,context):fallback();
  function shape(intensity,eyeRadius,wallRadius){
    const mature=smooth(145,185,intensity),inner=eyeRadius*1000,outer=wallRadius*1000;
    const height=configured('eye.wallHeight',()=>11500+5500*mature,{intensity,eyeRadius,wallRadius,mature});
    return{inner,outer,height,base:220,tilt:Math.min((outer-inner)*.52,height*(.30+.25*mature)),
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
  return{shape,section,intersects,smooth,environment,angularSpeed};
})();

function createEyeWall(T,scene,eyeUniforms=createEyeCloudUniforms(T)){
  const group=new T.Group();group.name='按实际半径渲染的眼墙';group.visible=false;scene.add(group);
  const uniforms={...eyeUniforms,opacity:{value:0},clarity:{value:0},cloudHeight:{value:16000},visibility:{value:11000},
    haze:{value:new T.Color('#b9c7ca')},sunDir:{value:new T.Vector3(1100,640,-950).normalize()}};
  const material=new T.ShaderMaterial({uniforms,side:T.DoubleSide,transparent:true,depthWrite:true,toneMapped:false,
    extensions:{derivatives:true},
    vertexShader:`varying vec3 localP;varying vec3 worldP;varying vec3 cloudNormal;
      void main(){vec4 p=vec4(position,1.);vec3 n=normal;
        #ifdef USE_INSTANCING
        mat3 im=mat3(instanceMatrix);n=im*(n/vec3(dot(im[0],im[0]),dot(im[1],im[1]),dot(im[2],im[2])));p=instanceMatrix*p;
        #endif
        localP=p.xyz;vec4 w=modelMatrix*p;worldP=w.xyz;cloudNormal=normalize(mat3(modelMatrix)*n);
        gl_Position=projectionMatrix*viewMatrix*w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader:`uniform float opacity;uniform float clarity;uniform float cloudHeight;uniform float visibility;
      uniform vec3 haze;uniform vec3 sunDir;varying vec3 localP;varying vec3 worldP;varying vec3 cloudNormal;
      #include <logdepthbuf_pars_fragment>
      ${EYE_CLOUD_GLSL}
      float hashCloud(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noiseCloud(vec2 p,float period){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec2 a=vec2(mod(i.x,period),i.y),b=vec2(mod(i.x+1.,period),i.y);return mix(mix(hashCloud(a),hashCloud(b),f.x),mix(hashCloud(a+vec2(0.,1.)),hashCloud(b+vec2(0.,1.)),f.x),f.y);}
      void main(){
        #include <logdepthbuf_fragment>
        float h=clamp(localP.y/cloudHeight,0.,1.);
        float azimuth=(atan(localP.z,localP.x)+3.14159265)/6.2831853;
        vec2 uv=vec2(azimuth*64.-h*23.,h*15.);
        float warp=noiseCloud(vec2(azimuth*16.,h*5.),16.);
        uv+=vec2(warp*3.5,warp*.65);
        float broad=noiseCloud(uv,64.);
        float filament=noiseCloud(vec2(uv.x*2.,uv.y*3.8),128.);
        float fine=noiseCloud(vec2(uv.x*4.,uv.y*9.),256.);
        float spiral=sin(h*92.-azimuth*6.2831853*7.+warp*3.5);
        float billow=mix(.5,.50*broad+.32*filament+.18*fine,clarity);
        float light=max(0.,dot(normalize(cloudNormal),sunDir));
        vec3 color=mix(vec3(.24,.29,.33),vec3(.86,.90,.94),smoothstep(.02,.85,h));
        color=color*(.83+.23*light)+(billow-.5)*(.38+.12*h)+spiral*.027*clarity+light*vec3(.08,.075,.065);
        float distanceToCloud=length(worldP-cameraPosition);
        float aerial=1.-exp(-distanceToCloud/(max(visibility,250.)*(3.4+9.*h)));
        color=mix(color,haze,aerial*.86);
        float lowFade=smoothstep(100.,650.,localP.y);
        if(lowFade<.01)discard;
        vec4 foreground=eyeCloudAlong(cameraPosition,normalize(worldP-cameraPosition),distanceToCloud);
        color=mix(color,foreground.rgb,foreground.a);
        gl_FragColor=vec4(color,opacity*lowFade);
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
    const clarity=.025+.975*EyeWall.smooth(100,170,state.intensity);
    const alpha=current.formation*environment.wallVisibility*EyeWall.smooth(300,6500,viewVisibility)*(.15+.85*clarity);
    group.visible=alpha>.001;if(!group.visible)return{sunBlocked:false,visible:false};
    const key=[state.intensity,state.eyeRadius,state.wallRadius].join('/');if(key!==signature){rebuild(current);signature=key;}
    group.position.set(state.east*1000,0,55-state.north*1000);
    uniforms.opacity.value=alpha;uniforms.clarity.value=clarity;uniforms.cloudHeight.value=current.height;uniforms.visibility.value=viewVisibility;uniforms.haze.value.copy(haze);
    return{sunBlocked:EyeWall.intersects(current,{x:observer.x-group.position.x,y:observer.y,z:observer.z-group.position.z},uniforms.sunDir.value),formation:current.formation,visible:true,height:current.height,rotationPeriod:Math.PI*2/omega};
  }
  return{update,group};
}
// Both sky and wall trace exactly the same foreground cloud banks, so openings
// reveal the wall naturally without giant transparent-plane depth seams.
const EYE_CLOUD_GLSL=`
  uniform vec3 eyeCenter;uniform float eyeSpan;uniform vec4 eyeRotation;
  uniform float eyeLow;uniform float eyeMid;uniform float eyeSun;
  uniform float eyeVisibility;uniform vec3 eyeHaze;
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
      color=mix(color,eyeHaze,(1.-exp(-distanceToLayer/max(eyeVisibility*2.5,1000.)))*.55);
      sum+=transmission*alpha*color;transmission*=1.-alpha;
    }
    return vec4(sum/max(.00001,1.-transmission),1.-transmission);
  }`;
function createEyeCloudUniforms(T){
  return{eyeCenter:{value:new T.Vector3()},eyeSpan:{value:15000},eyeRotation:{value:new T.Vector4(1,0,0,1)},eyeLow:{value:0},eyeMid:{value:0},eyeSun:{value:0},eyeVisibility:{value:11000},eyeHaze:{value:new T.Color()}};
}
function createEyeClouds(T){
  const uniforms=createEyeCloudUniforms(T);
  function update(state,observer,weather,haze,phase){
    const distance=Math.hypot(state.east-observer.east,state.north-observer.north),env=EyeWall.environment(state.intensity,state.eyeRadius,state.stormRadius,distance);
    uniforms.eyeCenter.value.set(state.east*1000,0,55-state.north*1000);uniforms.eyeSpan.value=state.eyeRadius*1000;
    uniforms.eyeLow.value=env.lowClouds;uniforms.eyeMid.value=env.midClouds;
    // Density sampling uses the inverse world rotation: a cloud travelling east
    // to north must still sample its original material point, not rotate it twice.
    const cloudPhase=phase*1,c=Math.cos(cloudPhase),s=Math.sin(cloudPhase);
    uniforms.eyeRotation.value.set(c,s,-s,c);
    uniforms.eyeSun.value=weather.sunshine;uniforms.eyeVisibility.value=state.clearFog?22000:weather.visibility;uniforms.eyeHaze.value.copy(haze);
    return env;
  }
  return{uniforms,update};
}
// A continuous low ceiling, with no distant circular storm boundary drawn on the sky.
function createStormSky(T,eyeUniforms=createEyeCloudUniforms(T)){
  return new T.Mesh(new T.SphereGeometry(4500,32,24),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,toneMapped:false,
    uniforms:{...eyeUniforms,top:{value:new T.Color('#45565e')},bottom:{value:new T.Color('#adb9bb')},horizonHaze:{value:new T.Color('#adb9bb')},clock:{value:0},veil:{value:0},deck:{value:0},cloudTime:{value:0}},
    vertexShader:'varying vec3 pos;void main(){pos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 pos;uniform vec3 top;uniform vec3 bottom;uniform vec3 horizonHaze;uniform float clock;uniform float veil;uniform float deck;uniform float cloudTime;
      ${EYE_CLOUD_GLSL}
      void main(){vec3 p=normalize(pos);float h=max(0.,p.y);
        float clouds=sin(p.x*18.+sin(p.z*16.)*1.8+clock*.006)*sin(p.z*22.+p.x*9.);
        float shade=clouds*.025*smoothstep(0.,.3,h);
        vec3 color=mix(mix(bottom,top,smoothstep(0.,.8,h))+shade,bottom,veil);
        vec2 uv=(cameraPosition.xz+p.xz*(max(100.,900.-cameraPosition.y)/max(.065,abs(p.y))))/2100.+vec2(cloudTime*.000012,cloudTime*.000006);
        float n=.65*noiseEye(uv)+.25*noiseEye(uv*2.8)+.10*noiseEye(uv*7.);
        vec3 ceiling=mix(bottom,top,.28)+vec3((n-.5)*.17*(1.-veil*.94));
        color=mix(color,mix(bottom,ceiling,smoothstep(-.025,.12,p.y)),deck);
        vec4 banks=eyeCloudAlong(cameraPosition,p,800000.);color=mix(color,banks.rgb,banks.a);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        // Fog uniforms are converted into the renderer's current output space,
        // then applied after tone mapping. Match both that space and that order.
        vec3 fogOutput=linearToOutputTexel(vec4(horizonHaze,1.)).rgb;
        gl_FragColor.rgb=mix(gl_FragColor.rgb,fogOutput,max(veil,(1.-smoothstep(.005,.18,h))*.96));
      }`}));
}
if(typeof module!=='undefined'&&module.exports)module.exports=EyeWall;
