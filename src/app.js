(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const M = StormModel, RAD = Math.PI / 180;
  const defaults={east:22.4,north:16.8,intensity:110,rainStrength:100,eyeRadius:15,wallRadius:40,stormRadius:110,influenceRadius:260,rmw:28,extent:180,mapEast:0,mapNorth:0,mapMode:'pan',siteId:'coast',floor:6,motionHeading:0,motionSpeed:0,advect:false,timeScale:60,simTime:0,yaw:8,pitch:-1.5,paused:false,sound:false,time:0};
  Object.assign(defaults,{freeCamera:false,freeX:0,freeY:18.9,freeZ:55,flightSpeed:35,zoom:1,clearFog:false});
  const state={...defaults},flightKeys=new Set(),touchFlightKeys=new Set(),touchReleases=[];
  const mobileControls=()=>matchMedia("(pointer:coarse)").matches||innerWidth<=1000;
  const currentSite=()=>OBSERVATION_SITES.find(p=>p.id===state.siteId)||OBSERVATION_SITES[0];
  const observer=()=>ObserverCamera.observer(state,currentSite());
  const fieldOptions=()=>({eyeRadius:state.eyeRadius,wallRadius:state.wallRadius,stormRadius:state.stormRadius,influenceRadius:state.influenceRadius,rainStrength:state.rainStrength,heading:state.motionHeading,motionSpeed:state.motionSpeed});
  const sampleField=()=>{const p=observer();return M.sample(state.east-p.east,state.north-p.north,state.intensity,fieldOptions(),state.simTime/60);};
  let target = sampleField();
  const weather = { ...target };
  let flowAngle = Math.atan2(weather.vn, weather.ve);
  let renderer,scene,camera,sky,sea,rain,rainPositions,rainGeo,rainMat,debris,debrisItems=[],trees=[],flag,mist,mistItems=[],sunDisk,sunGlow,cumulus,sunLight,ambientLight,foam,foamItems=[],impacts,impactItems=[],surgeLevel=0;
  let surgeRate=0,wideLens,mouseLookEnabled=false,hadPointerLock=false,hoverPointer=null,edgePan={x:0,y:0},lastShadowTime=-1,lastShadowX=Infinity,lastShadowZ=Infinity;
  const fullscreenActive=()=>document.fullscreenElement===view||view.classList.contains('is-fullscreen');
  let windScene,floodDebris,eyeWall,eyeClouds,rainFog,eyeViewState={visible:false},particleCamera=null,surgeMemory={level:0,crest:0,holdRadius:0};
  let sceneReady = false, last = performance.now(), renderedFrames = 0, fps = 60, elapsed = 0, dragging = null;
  let audioCtx, noiseSource, soundGain, lowFilter;
  const view = $('view'), map = $('map'), mapCtx = map.getContext('2d'), glass = $('glass'), glassCtx = glass.getContext('2d');
  const clamp = M.clamp;
  const mapController=createStormMap({canvas:map,state,getTarget:()=>target,getCamera:()=>camera,getObserver:observer,onChange:()=>updateTarget(),onSelectSite:selectSite});
  function selectSite(id){if(!OBSERVATION_SITES.some(p=>p.id===id))return;state.siteId=id;state.floor=clamp(state.floor,1,currentSite().maxFloor);setCameraMode(false);updateTarget();}
  function setCameraMode(free,overview=false){
    flightKeys.clear();touchReleases.forEach(clear=>clear());dragging=null;particleCamera=null;
    if(free&&!state.freeCamera){const p=observer();state.freeX=p.x;state.freeY=p.y;state.freeZ=p.z;}
    state.freeCamera=free;
    if(overview)Object.assign(state,{freeX:210,freeY:180,freeZ:300,yaw:-28,pitch:-25,zoom:1});
    if(!free){state.yaw=fullscreenActive()?ObserverCamera.bearing(state.yaw):clamp(ObserverCamera.bearing(state.yaw),-75,95);state.pitch=clamp(state.pitch,-40,38);}
    syncCameraControls();updateCamera();target=sampleField();drawMap();view.focus({preventScroll:true});
  }
  function syncCameraControls(){
    const free=state.freeCamera;view.classList.toggle('free-camera',free);
    $('freeCameraButton').setAttribute('aria-pressed',String(free));$('freeCameraButton').textContent=free?'返回楼房':'上帝视角';
    $('flightHint').hidden=!free;$('flightSettings').hidden=!free;
    for(const id of ['floorNumber','floorRange'])$(id).disabled=free;
    $('flightSpeedRange').value=state.flightSpeed;$('flightSpeedValue').textContent=state.flightSpeed+' m/s';
    $('clearFogButton').setAttribute('aria-pressed',String(state.clearFog));
  }
  function turnView(yaw,pitch){state.yaw=state.freeCamera||fullscreenActive()?ObserverCamera.bearing(yaw):clamp(yaw,-75,95);state.pitch=clamp(pitch,state.freeCamera?-89:-40,state.freeCamera?89:38);updateCamera();}
  let seed = 4512;
  function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  function randomRange(a, b) { return a + (b - a) * random(); }
  function directionName(deg) { return ['北','东北','东','东南','南','西南','西','西北'][Math.round(deg / 45) % 8]; }
  function category(v) { return v < 34 ? '热带低压' : v < 64 ? '热带风暴' : v < 83 ? 'SSHWS 1 级' : v < 96 ? 'SSHWS 2 级' : v < 113 ? 'SSHWS 3 级' : v < 137 ? 'SSHWS 4 级' : 'SSHWS 5 级'; }
  function updateLocationText(){
    $('mapDistance').textContent='距中心 '+target.radius.toFixed(1)+' km';
    const p=observer(),e=state.east-p.east,n=state.north-p.north;$('coordinates').textContent=(e<0?'W':'E')+' '+Math.abs(e).toFixed(1)+' / '+(n<0?'S':'N')+' '+Math.abs(n).toFixed(1)+' km';
    for(const id of ['east','north']){if(document.activeElement!==$(id))$(id).value=state[id].toFixed(1);if(document.activeElement!==$(id+'Range')){$(id+'Range').min=-Math.max(1600,Math.ceil(Math.abs(state[id])));$(id+'Range').max=Math.max(1600,Math.ceil(Math.abs(state[id])));$(id+'Range').value=state[id];}}
    const labels={eye:'风眼内部',wall:'核心眼墙',storm:'暴风圈内',core:'中心缓风区',outer:'外围阵雨带',clear:'下沉晴空 · 弱阵风'};
    $('regionTag').textContent=(target.sunshine>.7?(target.region==='eye'?'晴空风眼':target.region==='clear'?'下沉晴空 · 弱阵风':'雨带间晴空'):labels[target.region]);
    $('regionTag').classList.toggle('eye',target.region==='eye');
    const side={danger:'危险半圆 · 右侧增强',safe:'安全半圆 · 左侧较弱',none:'静止 · 对称风场'}[target.semicircle];
    $('semicircleLabel').textContent=side;
    $('flowText').textContent=target.region==='clear'?'下沉晴空 · 仍有弱阵风':target.region==='outer'?'外围雨带 · 风雨部分错峰':target.region==='storm'?'暴风圈 · 稳定持续风雨':side;
    $('motionReadout').textContent=state.motionSpeed?state.motionHeading+'° / '+state.motionSpeed+' kt':'静止';
    const sec=Math.floor(state.simTime);$('simClock').textContent='模拟经过 '+Math.floor(sec/3600).toString().padStart(2,'0')+':'+Math.floor(sec%3600/60).toString().padStart(2,'0')+':'+(sec%60).toString().padStart(2,'0');
  }
  function updateTarget(preset){
    const cfg=M.structure(fieldOptions(),state.intensity);
    Object.assign(state,{eyeRadius:cfg.eyeRadius,wallRadius:cfg.wallRadius,stormRadius:cfg.stormRadius,influenceRadius:cfg.influenceRadius,rmw:cfg.rmw});
    target=sampleField();
    $('intensity').value=state.intensity;$('intensityNumber').value=state.intensity;
    const fill=(state.intensity-20)/1.8;$('intensity').style.background='linear-gradient(90deg,#b6d4bd '+fill+'%,#34474b '+fill+'%)';
    $('category').textContent=category(state.intensity);
    for(const [id,min] of [['eyeRadius',2],['wallRadius',state.eyeRadius+4],['stormRadius',state.wallRadius+8],['influenceRadius',cfg.hasStorm?state.stormRadius+20:40]]){
      $(id).min=min;$(id+'Range').min=min;$(id).value=state[id];$(id+'Range').value=state[id];
      const disabled=(id==='eyeRadius'||id==='wallRadius')?!cfg.hasEye:id==='stormRadius'?!cfg.hasStorm:false;$(id).disabled=disabled;$(id+'Range').disabled=disabled;$(id).closest('label').classList.toggle('inactive-parameter',disabled);
    }
    for(const id of ['motionHeading','motionSpeed','timeScale','rainStrength']){$(id).value=state[id];$(id+'Range').value=id==='timeScale'?SliderScales.timeToSlider(state[id]):state[id];}
    $('timeScaleRange').setAttribute('aria-valuetext',state.timeScale+' 倍，对数刻度');
    $('eyeLegend').hidden=!cfg.hasEye;$('wallLegend').hidden=!cfg.hasEye;$('stormLegend').hidden=!cfg.hasStorm;
    $('thresholdNote').textContent=cfg.hasEye?'眼墙发展 '+Math.round(cfg.eyeDevelopment*100)+'% · 眼中心约100 kt趋于干燥，150 kt开始见阳光。':cfg.hasStorm?'低于67 kt：无风眼、无眼墙，中心仍减风，雨强向内明显增加。':'低于34 kt：无风眼、眼墙和暴风圈，中心仍减风。';
    const p=currentSite();state.floor=clamp(Math.round(state.floor),1,p.maxFloor);$('buildingSelect').value=p.id;for(const id of ['floorNumber','floorRange']){$(id).max=p.maxFloor;$(id).value=state.floor;}$('floorHeight').textContent=(state.floor*3)+' m / 地坪 '+p.ground.toFixed(2)+' m';$('locationName').textContent=p.name+' / '+state.floor+'F';$('heightLabel').textContent='视点海拔 '+(p.ground+state.floor*3).toFixed(1)+' m';
    document.querySelector('[data-preset="wall"]').disabled=!cfg.hasEye;document.querySelector('[data-preset="reverse"]').disabled=!cfg.hasEye;document.querySelector('[data-preset="storm"]').disabled=!cfg.hasStorm;document.querySelector('[data-preset="eye"]').textContent=cfg.hasEye?'风眼中心':'中心缓风';
    $('dialNeedle').style.transform=`rotate(${state.motionHeading}deg)`;$('headingDial').setAttribute('aria-valuenow',state.motionHeading);$('headingDial').setAttribute('aria-valuetext',state.motionHeading+'° 去向');
    $('structureNote').textContent='最大风速半径 '+state.rmw.toFixed(1)+' km · '+(cfg.hasEye?'暴风圈缓增 / 眼墙陡增':'宽峰风场 / 中心减风');
    document.querySelectorAll('[data-preset]').forEach(el=>{el.classList.toggle('selected',el.dataset.preset===preset);el.setAttribute('aria-pressed',String(el.dataset.preset===preset));});
    syncCameraControls();updateCamera();updateLocationText();drawMap();
  }

  function mapDimensions() {
    const rect = map.getBoundingClientRect();
    return { w: rect.width, h: rect.height, scale: rect.width / (state.extent * 2) };
  }
  function resizeCanvases() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const md = mapDimensions();
    map.width = Math.round(md.w * dpr); map.height = Math.round(md.h * dpr);
    mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rect = view.getBoundingClientRect();
    glass.width = Math.round(rect.width * dpr); glass.height = Math.round(rect.height * dpr);
    glassCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (renderer) { renderer.setSize(rect.width, rect.height); camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix(); }
    drawMap();
  }
  function drawMap(){mapController.draw();}

  function initScene() {
    if (typeof THREE === 'undefined') throw new Error('Three.js missing');
    const T = THREE;
    renderer = new T.WebGLRenderer({ antialias: true, alpha: false, logarithmicDepthBuffer:true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobileControls()?1.25:1.65));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
    wideLens=createWideLens(T,renderer);
    $('sceneMount').appendChild(renderer.domElement);
    scene = new T.Scene(); scene.background = new T.Color('#879498'); scene.fog = new T.FogExp2('#9ba8aa', .0019);rainFog=createRainFog(T);
    camera = new T.PerspectiveCamera(58, 1, .1, 800000); camera.position.set(0, 18, 55);
    const ambient = new T.HemisphereLight('#c1d0d4', '#596364', 2.3); ambientLight=ambient;scene.add(ambient);
    const sun = new T.DirectionalLight('#c6d2d2', 1.2);sunLight=sun; sun.position.set(1100,640,-950); scene.add(sun);scene.add(sun.target);
    sun.shadow.mapSize.set(mobileControls()?1024:2048,mobileControls()?1024:2048);Object.assign(sun.shadow.camera,{left:-440,right:440,top:440,bottom:-440,near:10,far:3500});sun.shadow.bias=-.00025;sun.shadow.normalBias=.25;sun.shadow.radius=2;
    eyeClouds=createEyeClouds(T);sky=createStormSky(T,eyeClouds.uniforms);scene.add(sky);
    eyeWall=createEyeWall(T,scene,eyeClouds.uniforms);
    const mat = (color, extra = {}) => new T.MeshStandardMaterial({color,roughness:.88,flatShading:true,...extra});
    const cube = new T.BoxGeometry(1,1,1), instanceGroups = new Map();
    function batch(material,x,y,z,w,h,d,rotation=0) { if(!instanceGroups.has(material))instanceGroups.set(material,[]);instanceGroups.get(material).push([x,y,z,w,h,d,rotation]); }
    function box(material,x,y,z,w,h,d) { const mesh = new T.Mesh(cube,material);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);scene.add(mesh);return mesh; }
    const concrete = [mat('#959d98'),mat('#afb0a2'),mat('#9aa7a9'),mat('#b5b4a6'),mat('#849695')];
    windScene=createWindScenery({T,scene,M,random,randomRange,sampleAt:(x,z)=>M.sample(state.east-x/1000,state.north-(55-z)/1000,state.intensity,fieldOptions(),state.simTime/60)});
    floodDebris=createFloodDebris({T,scene,M});
    const trim = mat('#c3c7bb'), darkTrim = mat('#6c7c7d'), windowDark = mat('#3d535a',{metalness:.2,roughness:.4}), windowMid = mat('#63797d',{metalness:.25,roughness:.4}), windowWarm = mat('#a7a087',{emissive:'#534c31',emissiveIntensity:.14}), balconyRail = mat('#5b6e71'), acMat=mat('#bdc3b7');
    // Permanent terrain determines inundation by depth, never by sliding a blue surface inland.
    box(mat('#66726e'),-985,-3,-1200,2050,2,4600);
    const terrainMats=[mat('#a5aaa0'),mat('#5c6b6c'),mat('#858e82'),mat('#929789'),mat('#7d8978'),mat('#74816d')],slopeMat=mat('#727b72');
    for(let i=1;i<M.coastProfile.length;i++){
      const a=M.coastProfile[i-1],b=M.coastProfile[i],x=(a[0]+b[0])/2;
      const vertices=new Float32Array([a[0],a[1],-3500,b[0],b[1],-3500,a[0],a[1],1100,b[0],b[1],1100]);
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(vertices,3));geometry.setIndex([0,1,2,2,1,3]);geometry.computeVertexNormals();
      const terrace=x>23?0:x>1.5?1:x>-62?2:x>-111?3:x>-176?4:5;
      scene.add(new T.Mesh(geometry,a[1]===b[1]?terrainMats[terrace]:slopeMat));
    }
    // Paving joints, curb edges and stair runs make each fixed elevation readable before flooding.
    const curb=mat('#b7bbaa');
    for(const terrace of M.coastTerraces.slice(0,5))for(let z=60;z>-900;z-=24)batch(curb,terrace.x,terrace.height+.012,z,terrace.name==='滨海道路'?.15:7,.024,.035);
    for(const [x,low,high,width] of [[24,.25,.55,2],[2.5,.55,.9,2],[-64,.9,1.7,4],[-113,1.7,2.9,4],[-179,2.9,4.65,6]]){
      for(const z of [-12,-180,-380,-620])for(let step=0;step<6;step++){const height=low+(high-low)*(step+1)/6;batch(curb,x+width/2-width*(step+.5)/6,(height-1)/2,z,width/6+.01,height+1,4);}
    }
    const roadMark = mat('#c3c6b1');
    for(let z=50;z>-900;z-=22) batch(roadMark,14,M.coastalHeight(14)+.025,z,.23,.04,9);
    const waterCanvas=document.createElement('canvas');waterCanvas.width=waterCanvas.height=512;const wc=waterCanvas.getContext('2d');wc.fillStyle='#657e83';wc.fillRect(0,0,512,512);
    for(let i=0;i<1200;i++){wc.strokeStyle=`rgba(170,190,187,${randomRange(.015,.075)})`;wc.lineWidth=randomRange(.3,1.2);wc.beginPath();const x=random()*512,y=random()*512;wc.moveTo(x,y);wc.lineTo(x+randomRange(5,70),y);wc.stroke();}
    const waterTexture=new T.CanvasTexture(waterCanvas);waterTexture.wrapS=waterTexture.wrapT=T.RepeatWrapping;waterTexture.repeat.set(12,50);waterTexture.colorSpace=T.SRGBColorSpace;
    const waterLevelUniform={value:0},waterOptics={day:{value:0},clock:{value:0},sunDir:{value:new T.Vector3(1100,640,-950).normalize()}};
    const waterMaterial=new T.MeshLambertMaterial({color:'#7a9091',map:waterTexture,transparent:true,depthWrite:false});
    waterMaterial.extensions={derivatives:true};
    const glFloat=n=>n.toFixed(4);
    const groundShader='float coastalGround(float x){if(x>='+glFloat(M.coastProfile[0][0])+')return '+glFloat(M.coastProfile[0][1])+';'+M.coastProfile.slice(1).map((b,i)=>{const a=M.coastProfile[i];return 'if(x>='+glFloat(b[0])+')return mix('+glFloat(a[1])+','+glFloat(b[1])+',('+glFloat(a[0])+'-x)/'+glFloat(a[0]-b[0])+');';}).join('')+'return 4.65;}';
    // Shallow flood water reveals submerged steps and road markings; the open sea stays opaque.
    waterMaterial.onBeforeCompile=shader=>{
      shader.uniforms.coastalWaterLevel=waterLevelUniform;
      shader.uniforms.waterDay=waterOptics.day;shader.uniforms.waterClock=waterOptics.clock;shader.uniforms.waterSunDir=waterOptics.sunDir;
      shader.vertexShader='varying vec3 waterWorld;varying float coastalX;\n'+shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nwaterWorld=(modelMatrix*vec4(transformed,1.0)).xyz;coastalX=waterWorld.x;');
      shader.fragmentShader='varying float coastalX;uniform float coastalWaterLevel;\n'+groundShader+'\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat waterDepth=max(0.0,coastalWaterLevel-coastalGround(coastalX));float shallowAlpha=.28+.65*(1.0-exp(-waterDepth*.9));diffuseColor.a*=mix(1.0,shallowAlpha,1.0-smoothstep(39.0,48.0,coastalX));');
      shader.fragmentShader=`varying vec3 waterWorld;uniform float waterDay;uniform float waterClock;uniform vec3 waterSunDir;
        float seaHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float seaNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(seaHash(i),seaHash(i+vec2(1.,0.)),f.x),mix(seaHash(i+vec2(0.,1.)),seaHash(i+vec2(1.,1.)),f.x),f.y);}
      `+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`vec3 waterView=normalize(cameraPosition-waterWorld);
        float footprint=max(length(dFdx(waterWorld.xz)),length(dFdy(waterWorld.xz)));
        float detail=1.-smoothstep(.8,4.5,footprint);
        vec2 rippleCoord=vec2(waterWorld.x*.13+waterWorld.z*.045,waterWorld.z*.51-waterWorld.x*.12);
        vec2 drift=vec2(waterClock*.18,-waterClock*.30);
        float rippleA=(seaNoise(rippleCoord+drift)*2.-1.)*detail;
        float rippleB=(seaNoise(rippleCoord*1.17+vec2(31.7,12.4)+drift)*2.-1.)*detail;
        vec3 rippleNormal=normalize(vec3(rippleA*.09,1.,rippleB*.07));
        float horizon=pow(1.-max(0.,dot(waterView,rippleNormal)),3.);
        vec3 skyReflection=mix(vec3(.16,.40,.48),vec3(.48,.67,.75),horizon);
        float reflectedSun=max(0.,dot(reflect(-waterSunDir,rippleNormal),waterView));
        float sparkle=pow(reflectedSun,160.)*(.45+.55*pow(abs(rippleA*rippleB),.6));
        float broadGlint=pow(reflectedSun,24.)*.09;
        outgoingLight=mix(outgoingLight,skyReflection,waterDay*(.18+horizon*.48));
        outgoingLight+=waterDay*vec3(1.,.90,.68)*(sparkle*2.7+broadGlint);
        #include <opaque_fragment>`);
    };
    sea = new T.Mesh(new T.PlaneGeometry(6200,6500),waterMaterial);sea.userData.waterLevel=waterLevelUniform;sea.userData.optics=waterOptics;sea.rotation.x=-Math.PI/2;sea.position.set(1040,0,-1300);scene.add(sea);
    foam=new T.InstancedMesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({color:'#e8efec',transparent:true,opacity:.3,depthWrite:false,side:T.DoubleSide}),180);foam.frustumCulled=false;foam.instanceMatrix.setUsage(T.DynamicDrawUsage);foam.userData.object=new T.Object3D();scene.add(foam);
    for(let i=0;i<180;i++)foamItems.push({x:randomRange(0,550),z:randomRange(-1550,230),length:randomRange(9,65),width:randomRange(.16,1.4),phase:random()*6});
    impacts=new T.InstancedMesh(new T.CircleGeometry(1,6),new T.MeshBasicMaterial({color:'#e6f0ee',transparent:true,opacity:.2,depthWrite:false,side:T.DoubleSide}),700);impacts.frustumCulled=false;impacts.instanceMatrix.setUsage(T.DynamicDrawUsage);impacts.userData.object=new T.Object3D();scene.add(impacts);
    for(let i=0;i<700;i++)impactItems.push({x:randomRange(3,350),z:randomRange(-420,125),phase:random(),size:randomRange(.05,.28)});
    function building(x,z,width,height,depth,index,detailed=true) {
      floodDebris.addObstacle(x,z,width,depth);
      const base=M.coastalHeight(x-width/2);
      const raisedBox=(m,xx,y,zz,w,h,d)=>box(m,xx,y+base,zz,w,h,d);
      const raisedBatch=(m,xx,y,zz,w,h,d,rotation=0)=>batch(m,xx,y+base,zz,w,h,d,rotation);
      // A level foundation supports buildings spanning two terraces.
      box(darkTrim,x,base/2-.5,z,width+.8,base+1,depth+.8);
      const material=concrete[index%concrete.length],shell=raisedBox(material,x,height/2,z,width,height,depth);shell.castShadow=shell.receiveShadow=true;
      raisedBatch(trim,x,height+.25,z,width+1,.5,depth+1);raisedBatch(darkTrim,x,height+.8,z-depth*.4,width,.9,.35);
      // Front elevations: windows, recessed balconies, slab edges, utility units.
      const floors=Math.floor((height-2)/3.1), columns=Math.max(2,Math.floor(width/4));
      for(let f=0;f<floors;f++){
        const y=2.0+f*3.1;
        if(f>0)raisedBatch(trim,x,y-1.12,z+depth/2+.30,width+.4,.17,.85);
        for(let col=0;col<columns;col++){
          const xx=x-width/2+(col+.5)*width/columns;
          const wm=random()<.07?windowWarm:random()<.44?windowMid:windowDark;
          if(detailed&&z>-650&&f<16&&(f+col+index)%4===0){const pane=raisedBox(wm,xx,y,z+depth/2+.035,2.10,1.82,.08);windScene.registerWindow(pane);}
          else raisedBatch(wm,xx,y,z+depth/2+.035,2.10,1.82,.08);
          raisedBatch(trim,xx,y,z+depth/2+.11,.055,1.85,.11);
          if((col+index)%3===0&&f>0){
            raisedBatch(darkTrim,xx,y-.82,z+depth/2+.7,2.6,.12,1.5);
            raisedBatch(balconyRail,xx,y-.38,z+depth/2+1.42,2.65,.08,.07);
            for(let k=-1;k<=1;k++)raisedBatch(balconyRail,xx+k*1.1,y-.64,z+depth/2+1.42,.06,.62,.06);
          }else if(random()>.47)raisedBatch(acMat,xx+.9,y-.77,z+depth/2+.35,.68,.48,.58);
        }
        for(let side=0;side<Math.floor(depth/4);side++){
          const zz=z-depth/2+(side+.5)*4;
          raisedBatch(random()<.3?windowMid:windowDark,x+width/2+.04,y,zz,.08,1.75,1.95);
        }
      }
      for(let col=0;col<columns-1;col++)raisedBatch(darkTrim,x-width/2+(col+1)*width/columns, height/2,z+depth/2+.07,.15,height,.12);
      raisedBatch(acMat,x-width*.2,height+1.3,z-depth*.2,width*.16,2.1,depth*.13);
      const tank=new T.Mesh(new T.CylinderGeometry(1.2,1.25,2.3,8),darkTrim);tank.position.set(x+width*.25,height+base+1.4,z);scene.add(tank);
      // Long subdued stains prevent an overly clean, toy-like facade.
      for(let n=0;n<3;n++) raisedBatch(darkTrim,x+randomRange(-width*.4,width*.4),height*.4,z+depth/2+.06,.10,height*.57,.025);
    }
    building(-35,-19,42,43,34,0);building(-25,-115,38,55,32,1);building(-59,-191,39,66,34,2);building(-16,-235,29,47,28,3);
    building(-50,-323,43,60,36,4);building(-18,-405,32,73,32,2);building(-65,-451,38,50,30,1);
    building(-18,-534,33,56,30,0);building(-49,-640,44,71,42,3);building(-13,-747,35,55,35,4);
    for(let i=0;i<12;i++)building(-55-random()*80,-850-i*110,randomRange(26,45),randomRange(38,78),30,i);
    // Taller and lower inland blocks remain visible when looking farther to either side.
    for(const [i,v]of [[-89,65,34,92,38],[-40,135,30,29,28],[-130,-78,40,118,42],[-113,-260,48,34,36],[-105,-420,36,101,37],[-167,-600,54,125,40],[-184,45,47,62,39],[-72,225,35,76,30]].entries())building(...v,i);
    // Inland streets, southern blocks and low shops give free flight a complete town to explore.
    for(let row=0;row<3;row++)for(let col=0;col<6;col++){
      building(-250-row*116+randomRange(-12,12),220-col*179+randomRange(-15,15),randomRange(32,58),randomRange(22,110),randomRange(30,47),row+col,false);
    }
    for(let i=0;i<7;i++)building(-44-i%3*95,340+Math.floor(i/3)*125,randomRange(28,44),randomRange(18,68),32,i,false);
    for(let i=0;i<6;i++)building(-111-i%2*105,-155-i*87,22,randomRange(6,12),18,i,false);
    // Promenade railings and lamps recede to the coast's vanishing point.
    const steel=mat('#566d70');
    // Far headland, static and deliberately understated.
    const island=new T.Mesh(new T.ConeGeometry(440,100,7),mat('#657f80'));island.scale.z=.42;island.position.set(1500,0,-2350);scene.add(island);
    // Layered ridges due north, behind the town and bay; scene fog controls their visibility.
    for(let layer=0;layer<3;layer++){
      const mountainMat=mat(['#697f80','#788e90','#879a9b'][layer]);
      for(let i=0;i<12;i++){
        const phase=i*1.71+layer*2.3,height=110+layer*35+Math.sin(phase)**2*185;
        const mountain=new T.Mesh(new T.ConeGeometry(300+Math.sin(i*.9+layer)**2*180,height,7),mountainMat);
        mountain.position.set(-2300+i*430+Math.sin(phase)*95,height/2-12,-2850-layer*480+Math.cos(phase)*90);
        mountain.scale.z=.58;mountain.rotation.y=phase;scene.add(mountain);
      }
    }
    const trunkMat=mat('#646f5f'),leafMats=['#485f57','#536e54','#59765e','#405e55'].map(color=>mat(color,{side:T.DoubleSide}));
    function plantTree(x,z,kind,H){
      const tree=new T.Group();tree.position.set(x,M.coastalHeight(x),z);scene.add(tree);
      const radius=kind===0?.28:kind===3?.25:.38,geo=new T.CylinderGeometry(radius*.45,radius,H,7,12),trunk=new T.Mesh(geo,trunkMat);trunk.position.y=H*.5;trunk.frustumCulled=false;tree.add(trunk);
      const crown=new T.Group();crown.position.y=H;tree.add(crown);const material=leafMats[kind];
      if(kind===0){for(let k=0;k<7;k++){const a=k*Math.PI*2/7,leaf=new T.Mesh(new T.ConeGeometry(.7,H*.59,4),material);leaf.position.set(Math.cos(a)*1.4,.2,Math.sin(a)*1.4);leaf.rotation.set(Math.sin(a)*.9,0,-Math.cos(a)*.9);crown.add(leaf);}}
      else if(kind===1){for(let k=0;k<6;k++){const a=k*2.4,leaf=new T.Mesh(new T.IcosahedronGeometry(H*.25,0),material);leaf.position.set(Math.sin(a)*H*.18,k%2*1.2-.6,Math.cos(a)*H*.18);leaf.scale.set(1.2,.8,1);crown.add(leaf);}}
      else if(kind===2){for(let k=0;k<4;k++){const leaf=new T.Mesh(new T.ConeGeometry(H*(.30-k*.052),H*.43,7),material);leaf.position.y=-H*.35+k*H*.19;crown.add(leaf);}}
      else {for(let k=0;k<3;k++){const leaf=new T.Mesh(new T.IcosahedronGeometry(H*.2,1),material);leaf.position.y=-H*.3+k*H*.19;leaf.scale.set(.58,1.4,.65);crown.add(leaf);}}
      tree.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});tree.userData={trunk,crown,height:H,radius,kind,original:geo.attributes.position.array.slice()};trees.push(tree);windScene.registerTree(tree);
    }
    for(let i=0;i<17;i++)plantTree(29.5,38-i*48,i%4===0?1:0,randomRange(6,10));
    for(let i=0;i<28;i++)plantTree([-8,-76,-178,-218][i%4],65-Math.floor(i/4)*111,(i+1)%4,randomRange(5.5,12.5));
    for(let i=0;i<14;i++)plantTree(-237-i%2*132,280-Math.floor(i/2)*160,1+i%3,randomRange(8,16));

    batch(steel,30,5.25,-16,.12,10,.12);
    flag = new T.Group();flag.position.set(30,9.95,-16);scene.add(flag);
    const flagCloth=new T.Mesh(new T.PlaneGeometry(2.6,.85,6,2),mat('#be9a79',{side:T.DoubleSide}));flagCloth.position.x=1.3;flag.add(flagCloth);flag.userData.cloth=flagCloth;
    // A few parked vehicles establish the observer's sixth-floor height.
    const carMat=mat('#8b9d9a'),carDark=mat('#354e59');
    for(let z=-65;z>-400;z-=91){batch(carMat,8,1.55,z,2.2,1.2,4.6);batch(carDark,8,2.35,z,1.9,.75,2.2);}
    for(let i=0;i<14;i++){const x=i%2?-86:-205,z=185-i*73,y=M.coastalHeight(x);batch(i%3?carMat:concrete[1],x,y+.8,z,2.2,1.2,4.7);batch(carDark,x,y+1.6,z,1.9,.7,2.3);for(const side of [-1,1])for(const end of [-1.4,1.4])batch(carDark,x+side*1.1,y+.4,z+end,.25,.65,.65);}
    const wood=mat('#9b9278');
    for(let i=0;i<14;i++){const x=i%2?33:-9,z=63-i*54,y=M.coastalHeight(x);batch(wood,x,y+.53,z,1.9,.15,.65);batch(wood,x,y+.95,z-.28,1.9,.7,.1);for(const side of [-.7,.7])batch(steel,x+side,y+.25,z,.1,.5,.6);}
    for(let i=0;i<10;i++){const x=-80-i%2*130,z=175-i*98,y=M.coastalHeight(x);batch(darkTrim,x,y+.4,z,2.8,.8,1.4);batch(leafMats[1],x,y+1,z,2.6,.6,1.2);}
    for(const [material,items] of instanceGroups){
      const mesh=new T.InstancedMesh(cube,material,items.length), obj=new T.Object3D();
      items.forEach((v,i)=>{obj.position.set(v[0],v[1],v[2]);obj.scale.set(v[3],v[4],v[5]);obj.rotation.y=v[6];obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);});mesh.receiveShadow=true;mesh.instanceMatrix.needsUpdate=true;scene.add(mesh);
    }
    // Weather particles use world-space velocity; moving the storm reverses the flow correctly.
    const rainCount=120000;rainPositions=new Float32Array(rainCount*6);const initial=new Float32Array(rainCount*3);
    for(let i=0;i<rainCount;i++){const near=i%3!==0;initial[i*3]=randomRange(near?-62:-145,near?62:145);initial[i*3+1]=randomRange(near?-8:-15,near?67:115);initial[i*3+2]=randomRange(near?-15:-125,near?120:105);}
    rainGeo=new T.BufferGeometry();rainGeo.setAttribute('position',new T.BufferAttribute(rainPositions,3).setUsage(T.DynamicDrawUsage));
    rainGeo.setAttribute('rainPatchAlpha',new T.BufferAttribute(new Float32Array(rainCount*2).fill(1),1).setUsage(T.DynamicDrawUsage));
    rainMat=new T.LineBasicMaterial({color:'#c8dddf',transparent:true,opacity:.3,depthWrite:false});rain=new T.LineSegments(rainGeo,rainMat);rain.frustumCulled=false;rain.userData.points=initial;scene.add(rain);
    rainMat.onBeforeCompile=shader=>{
      shader.vertexShader='attribute float rainPatchAlpha;varying float vRainPatchAlpha;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRainPatchAlpha=rainPatchAlpha;');
      shader.fragmentShader='varying float vRainPatchAlpha;\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vRainPatchAlpha;');
    };
    debris=new T.InstancedMesh(new T.PlaneGeometry(1,1),mat('#a1a28d',{side:T.DoubleSide}),340);debris.instanceMatrix.setUsage(T.DynamicDrawUsage);debris.frustumCulled=false;scene.add(debris);
    for(let i=0;i<340;i++){
      debrisItems.push({x:randomRange(-100,100),y:randomRange(1,60),z:randomRange(-90,76),size:randomRange(.12,.60),spin:random()*6,kind:random(),vx:0,vz:0});
      debris.setColorAt(i,new T.Color(i%3===0?'#c3c5b3':i%3===1?'#64775c':'#8e7961'));
    }
    debris.userData.object=new T.Object3D();
    const cloudCanvas=document.createElement('canvas');cloudCanvas.width=cloudCanvas.height=128;const cc=cloudCanvas.getContext('2d');
    const cg=cc.createRadialGradient(64,64,1,64,64,64);cg.addColorStop(0,'rgba(231,239,238,.6)');cg.addColorStop(.35,'rgba(216,232,232,.3)');cg.addColorStop(1,'rgba(213,232,232,0)');cc.fillStyle=cg;cc.fillRect(0,0,128,128);
    const cloudTexture=new T.CanvasTexture(cloudCanvas);
    mist=new T.InstancedMesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:cloudTexture,color:'#c7d8d9',transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide}),150);mist.frustumCulled=false;mist.instanceMatrix.setUsage(T.DynamicDrawUsage);mist.userData.object=new T.Object3D();scene.add(mist);
    for(let i=0;i<150;i++)mistItems.push({x:randomRange(-95,95),y:randomRange(1,57),z:randomRange(-110,85),size:randomRange(8,27),phase:random()*6});
    sunDisk=new T.Mesh(new T.SphereGeometry(30,16,12),new T.MeshBasicMaterial({color:'#fff0bc',transparent:true,opacity:0,depthWrite:false,fog:false}));sunDisk.position.set(650,510,-1550);scene.add(sunDisk);
    sunGlow=new T.Sprite(new T.SpriteMaterial({map:cloudTexture,color:'#ffe8b0',transparent:true,opacity:0,depthWrite:false,fog:false,blending:T.AdditiveBlending}));sunGlow.position.copy(sunDisk.position);sunGlow.scale.set(320,320,1);scene.add(sunGlow);
    cumulus=new T.Group();scene.add(cumulus);const cm=new T.MeshLambertMaterial({color:'#f4f6ef',emissive:'#c5d3d6',emissiveIntensity:.6,transparent:true,opacity:0});
    for(let i=0;i<6;i++){const x=randomRange(140,1100),z=randomRange(-1300,-400),y=randomRange(110,185);for(let j=0;j<5;j++){const cloud=new T.Mesh(new T.SphereGeometry(randomRange(16,29),9,7),cm);cloud.position.set(x+j*15,y+Math.sin(j*Math.PI/4)*20+randomRange(-5,5),z+randomRange(-12,12));cloud.scale.set(1.1,.85,1);cumulus.add(cloud);}}cumulus.userData.material=cm;

    renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();$('renderError').hidden=false;$('renderError').textContent='图形上下文已丢失，请重新打开或刷新此页面。地图仍可使用。';});
    scene.traverse(o=>{if(o.isMesh&&o.material?.type==='MeshStandardMaterial')o.receiveShadow=true;});
    rainFog.install(scene);sceneReady=true;resizeCanvases();updateCamera();
  }

  function updateCamera() {
    if(!camera)return;
    const p=observer();camera.position.set(p.x,p.y,p.z);
    const nextFov=ObserverCamera.fov(state.zoom);if(Math.abs(camera.fov-nextFov)>.00001){camera.fov=nextFov;camera.updateProjectionMatrix();}
    sky.position.copy(camera.position);
    const lensLabel=state.zoom<1?'广角':'望远镜';$('zoomValue').textContent=(state.zoom<1?state.zoom.toFixed(2):state.zoom.toFixed(1))+'×';$('zoomReset').setAttribute('aria-label',lensLabel+' '+state.zoom.toFixed(2)+' 倍，垂直视场角 '+nextFov.toFixed(0)+' 度，点击复位');
    $('locationName').textContent=state.freeCamera?'上帝视角 · 自由飞行':currentSite().name+' / '+state.floor+'F';
    $('heightLabel').textContent='视点海拔 '+p.y.toFixed(1)+' m';
    $('flightPosition').textContent='E '+p.east.toFixed(3)+' / N '+p.north.toFixed(3)+' km · 海拔 '+p.y.toFixed(1)+' m';
    const yaw=state.yaw*RAD,pitch=state.pitch*RAD;
    camera.lookAt(camera.position.x+Math.sin(yaw)*Math.cos(pitch)*100,camera.position.y+Math.sin(pitch)*100,camera.position.z-Math.cos(yaw)*Math.cos(pitch)*100);
    const heading=(state.yaw+360)%360;
    $('heading').textContent=String(Math.round(heading)%360).padStart(3,'0')+'°';
    $('headingDir').textContent=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(heading/22.5)%16];
  }
  function animateWeather(dt,weatherDt=dt,viewDt=dt){
    const T=THREE,t=state.time,ms=weather.ms,kt=weather.sustained;
    const visual=M.visuals(Math.max(kt,weather.gust*.85),weather.rain),vx=weather.ve,vz=-weather.vn,fall=visual.rainFall;
    rainFog.update(dt,weather,visual,state.clearFog,scene);
    const anchor=camera.position,previous=particleCamera||anchor;
    let cameraDelta={x:anchor.x-previous.x,y:anchor.y-previous.y,z:anchor.z-previous.z};
    // Rebase instant viewpoint changes; continuous flight retains world-space particles.
    if(Math.hypot(cameraDelta.x,cameraDelta.y,cameraDelta.z)>Math.max(50,state.flightSpeed*8*viewDt))cameraDelta={x:0,y:0,z:0};
    particleCamera={x:anchor.x,y:anchor.y,z:anchor.z};
    const relativeRain=ObserverCamera.particleMotion({x:vx,y:-fall,z:vz},cameraDelta,dt,viewDt),wrap=ObserverCamera.wrap;
    rain.position.set(camera.position.x,camera.position.y-18,camera.position.z-55);debris.position.set(camera.position.x,0,camera.position.z-55);mist.position.set(camera.position.x,camera.position.y-18,camera.position.z-55);
    const count=Math.min(rain.userData.points.length/3,Math.round(Math.pow(clamp(weather.rain/150,0,1),.85)*55000*visual.rainDensity));
    rainGeo.setDrawRange(0,count*2);rainMat.opacity=clamp(.21+weather.rain*.0022,.21,.68);
    const p=rain.userData.points,patchAlpha=rainGeo.attributes.rainPatchAlpha.array,patchFrame=renderedFrames%6;
    for(let i=0;i<count;i++){
      const k=i*3,j=i*6;p[k]+=relativeRain.x;p[k+1]+=relativeRain.y;p[k+2]+=relativeRain.z;
      const near=i%3!==0,xmax=near?62:145,zmin=near?-15:-125,zmax=near?120:105,ymin=near?-8:-15;
      p[k]=wrap(p[k],-xmax,xmax);p[k+2]=wrap(p[k+2],zmin,zmax);p[k+1]=wrap(p[k+1],ymin,ymin+(near?75:130));
      const trail=visual.rainTrail*(1+.65*Math.sin(i*7.9))*(1+.25*M.smooth(55,180,weather.rain));
      rainPositions[j]=p[k];rainPositions[j+1]=p[k+1];rainPositions[j+2]=p[k+2];rainPositions[j+3]=p[k]-relativeRain.vx*trail;rainPositions[j+4]=p[k+1]-relativeRain.vy*trail;rainPositions[j+5]=p[k+2]-relativeRain.vz*trail;
      if(i%6===patchFrame){
        const density=rainFog.densityAt(rain.position.x+p[k],rain.position.y+p[k+1],rain.position.z+p[k+2]),seed=((Math.imul(i,2654435761)>>>0)/4294967296);
        const alpha=density<1&&seed>density?.06:Math.min(1.8,density);patchAlpha[i*2]=patchAlpha[i*2+1]=alpha;
      }
    }rainGeo.attributes.position.needsUpdate=true;rainGeo.attributes.rainPatchAlpha.needsUpdate=true;
    const debrisKt=Math.max(kt,weather.gust*.9),limit=Math.round(M.visuals(debrisKt,weather.rain).debrisCount*M.debrisSupply(weather.ve,weather.vn)),obj=debris.userData.object;let active=0;
    for(let i=0;i<limit;i++){
      const p=debrisItems[i],motion=M.debrisMotion(debrisKt,p.kind);if(!motion.active)continue;
      const inertia=1-Math.exp(-dt*(p.kind>.8?1.2:p.kind>.46?2.8:7));p.vx+=(weather.ve*motion.speed-p.vx)*inertia;p.vz+=(-weather.vn*motion.speed-p.vz)*inertia;
      p.x+=p.vx*dt;p.z+=p.vz*dt;const height=.18+motion.height*(.32+.68*(.5+.5*Math.sin(p.spin+t*(p.kind>.8?.5:1.1))));p.y+=(height-p.y)*(1-Math.exp(-dt*2));
      if(p.x>110)p.x-=220;if(p.x<-110)p.x+=220;if(p.z>95)p.z-=200;if(p.z<-105)p.z+=200;
      const scale=motion.size*(.8+p.size);obj.position.set(p.x,Math.max(.12,p.y),p.z);obj.rotation.set(t*motion.tumble+p.spin,t*motion.tumble*.7+p.spin,t*motion.tumble*1.2+p.spin);obj.scale.set(scale*(p.kind>.8?2.3:1.5),scale,1);obj.updateMatrix();debris.setMatrixAt(active++,obj.matrix);
    }debris.count=active;debris.instanceMatrix.needsUpdate=true;
    const windE=ms>.01?weather.ve/ms:0,windZ=ms>.01?-weather.vn/ms:0;
    windScene.update(dt,weatherDt*state.timeScale,t);
    trees.forEach((tree,i)=>{
      if(tree.userData.failed)return;
      const local=M.sample(state.east-tree.position.x/1000,state.north-(55-tree.position.z)/1000,state.intensity,fieldOptions(),state.simTime/60),localVisual=M.visuals(Math.max(local.sustained,local.gust*.85),local.rain),localMs=Math.max(.01,local.ms),treeE=local.ve/localMs,treeZ=-local.vn/localMs;
      const bend=Math.max(.001,localVisual.treeBend*(1+.08*Math.sin(t*3.3+i)+.04*Math.sin(t*6+i))),H=tree.userData.height;
      const {trunk,crown,original}=tree.userData,a=trunk.geometry.attributes.position;
      for(let k=0;k<a.count;k++){
        const h=original[k*3+1]+H*.5,angle=bend*h/H,d=H/bend*(1-Math.cos(angle)),yy=H/bend*Math.sin(angle);
        a.setXYZ(k,original[k*3]+treeE*d,yy-H*.5,original[k*3+2]+treeZ*d);
      }a.needsUpdate=true;trunk.geometry.computeVertexNormals();
      const crownD=H/bend*(1-Math.cos(bend));crown.position.set(treeE*crownD,H/bend*Math.sin(bend),treeZ*crownD);crown.rotation.set(treeZ*bend*.65,0,-treeE*bend*.65);
    });
    flag.rotation.y=Math.atan2(weather.vn,weather.ve);const cloth=flag.userData.cloth,attr=cloth.geometry.attributes.position;
    for(let i=0;i<attr.count;i++){const x=attr.getX(i)+1.3;attr.setZ(i,Math.sin(t*7-x*3)*x*.055*clamp(ms/20,0,2));}attr.needsUpdate=true;flag.rotation.z=-Math.max(0,1-ms/15)*.75;
    // Advected concentration curtains also occur in heavy rain with modest wind.
    // Their slower pattern drift and sedimentation are distinct from single-drop motion.
    mist.count=visual.mistOpacity>.005?150:0;
    mist.material.opacity=visual.mistOpacity*.24;
    const mo=mist.userData.object,cross=windE*Math.cos(state.yaw*RAD)-windZ*Math.sin(state.yaw*RAD);
    const relativeMist=ObserverCamera.particleMotion({x:vx*visual.curtainDrift,y:-visual.curtainFall,z:vz*visual.curtainDrift},cameraDelta,dt,viewDt);
    const roll=Math.atan2(-visual.curtainFall,ms*visual.curtainDrift*cross||.001);
    for(let i=0;i<mist.count;i++){
      const p=mistItems[i];p.x=wrap(p.x+relativeMist.x,-105,105);p.z=wrap(p.z+relativeMist.z,-115,95);p.y=wrap(p.y+Math.sin(t+p.phase)*dt*.6+relativeMist.y,1,57);
      const along=(p.x+camera.position.x)*windE+(p.z+camera.position.z-55)*windZ;
      const wave=.48+.52*(.5+.5*Math.sin(along*.055-t*ms*visual.curtainDrift*.055+p.phase*.18));
      mo.position.set(p.x,p.y,p.z);mo.quaternion.copy(camera.quaternion);mo.rotateZ(roll);mo.scale.set(p.size*(1+visual.mistMix*1.4)*wave,(1.2+wave*3)*(.45+.55*visual.mistMix),1);mo.updateMatrix();mist.setMatrixAt(i,mo.matrix);
    }mist.instanceMatrix.needsUpdate=true;
    const atmosphere=ViewAtmosphere.sample(weather,state.clearFog);
    scene.fog.density=atmosphere.fogDensity;
    const severity=clamp(weather.rain/100+ms/200,0,1),sun=atmosphere.sun;
    scene.fog.color.setRGB(.65-severity*.10,.71-severity*.10,.72-severity*.09);
    sky.material.uniforms.clock.value=t;sky.material.uniforms.veil.value=Math.max(M.smooth(22,72,weather.rain),M.smooth(40,100,kt))*(1-sun);sky.material.uniforms.top.value.setRGB(.29-severity*.06,.36-severity*.07,.40-severity*.07).lerp(new T.Color().setRGB(.15,.43,.80),atmosphere.blue);
    sky.material.uniforms.bottom.value.copy(scene.fog.color).lerp(new T.Color().setRGB(.68,.82,.94),atmosphere.blue);
    sky.material.uniforms.horizonHaze.value.copy(scene.fog.color);
    const eyeView=eyeWall.update(state,weather,observer(),scene.fog.color),solarCover=eyeView.sunBlocked?eyeView.formation:0;eyeViewState=eyeView;
    const eyeEnvironment=eyeClouds.update(state,observer(),weather,scene.fog.color,eyeWall.group.rotation.y);
    sky.material.uniforms.deck.value=eyeEnvironment.deck;sky.material.uniforms.cloudTime.value=state.simTime;
    sunLight.color.set(sun>.4?'#fff1d6':'#d2dfe5');sunLight.intensity=atmosphere.direct*(1-solarCover*.4);ambientLight.intensity=atmosphere.ambient;
    ambientLight.color.set(sun>.4?'#d9ebff':'#cedde6');ambientLight.groundColor.set(sun>.4?'#8b8770':'#626d6a');renderer.toneMappingExposure=atmosphere.exposure;
    const shadowX=camera.position.x,shadowZ=camera.position.z-140;
    sunLight.target.position.set(shadowX,0,shadowZ);sunLight.position.set(shadowX+1100,640,shadowZ-950);sunLight.castShadow=atmosphere.shadows;
    if(atmosphere.shadows&&(state.time-lastShadowTime>.15||lastShadowTime<0||Math.hypot(shadowX-lastShadowX,shadowZ-lastShadowZ)>8)){renderer.shadowMap.needsUpdate=true;lastShadowTime=state.time;lastShadowX=shadowX;lastShadowZ=shadowZ;}
    sunDisk.position.copy(camera.position).addScaledVector(sea.userData.optics.sunDir.value,2300);sunGlow.position.copy(sunDisk.position);
    sunDisk.material.opacity=sun*(1-solarCover);sunDisk.visible=sun*(1-solarCover)>.01;sunGlow.material.opacity=sun*.8*(1-solarCover);sunGlow.visible=sun*(1-solarCover)>.01;cumulus.visible=sun>.01&&!eyeEnvironment.inEye;cumulus.userData.material.opacity=sun*.9;
    sea.material.color.setRGB(.44-severity*.10,.54-severity*.08,.55-severity*.07).lerp(new T.Color().setRGB(.16,.43,.55),sun);
    sea.userData.optics.day.value=atmosphere.openness;sea.userData.optics.clock.value=t;
    // Only water elevation changes. The permanent terraces occlude water until overtopped.
    const previousWater=surgeLevel,hydroDt=weatherDt*state.timeScale;
    surgeLevel=M.advanceSurge(surgeMemory,{sustained:kt,intensity:state.intensity,radius:target.radius,simDt:hydroDt});
    surgeRate=hydroDt>0?(surgeLevel-previousWater)/hydroDt*3600:0;
    const shore=M.waterEdge(surgeLevel);sea.position.y=surgeLevel;sea.userData.waterLevel.value=surgeLevel;
    floodDebris.update(dt,t,surgeLevel,weather);
    const fo=foam.userData.object;foam.material.opacity=clamp(ms/95+weather.rain/500,.03,.65);
    for(let i=0;i<foamItems.length;i++){const p=foamItems[i];p.x-=dt*(1.2+ms*.10);if(p.x<0)p.x+=550;fo.position.set(shore+p.x,surgeLevel+.025,p.z);fo.rotation.set(-Math.PI/2,0,.04*Math.sin(p.phase+t*.3));fo.scale.set(p.width*(1+ms*.028),p.length*(.6+.4*Math.sin(p.phase+t*.8)**2),1);fo.updateMatrix();foam.setMatrixAt(i,fo.matrix);}foam.instanceMatrix.needsUpdate=true;
    const io=impacts.userData.object;impacts.count=Math.round(clamp(weather.rain/150,0,1)*700);impacts.material.opacity=clamp(weather.rain/300,0,.55);
    for(let i=0;i<impacts.count;i++){const p=impactItems[i],life=(t*2.8+p.phase)%1,x=p.x+camera.position.x;io.position.set(x,Math.max(surgeLevel,M.coastalHeight(x))+.035,p.z+camera.position.z-55);io.rotation.set(-Math.PI/2,0,0);const size=p.size*(.5+life*2);io.scale.set(size*(1+ms*.025),size,1);io.updateMatrix();impacts.setMatrixAt(i,io.matrix);}impacts.instanceMatrix.needsUpdate=true;
    wideLens.render(scene,camera,state.zoom);renderedFrames++;
  }


  const drops=Array.from({length:55},()=>({x:random(),y:random(),size:randomRange(.6,2.5),speed:randomRange(.008,.04),phase:random()*6}));
  function drawGlass(dt) {
    const {width:w,height:h}=view.getBoundingClientRect(),c=glassCtx;c.clearRect(0,0,w,h);
    if(weather.rain<1)return;
    const amount=clamp(weather.rain/65,0,1), cross=(weather.ve*Math.cos(state.yaw*RAD)+weather.vn*Math.sin(state.yaw*RAD))/100,mix=M.visuals(Math.max(weather.sustained,weather.gust*.85),weather.rain).mistMix;
    for(let i=0;i<drops.length*amount;i++){
      const p=drops[i];p.y+=p.speed*(1-mix*.7)*dt;p.x+=cross*.006*(1+mix*8)*dt;if(p.y>1.04){p.y=-.03;p.x=random();}if(p.x<0)p.x=1;if(p.x>1)p.x=0;
      const x=p.x*w,y=p.y*h,l=3+p.size*3;
      c.strokeStyle=`rgba(218,235,237,${.12+p.size*.035})`;c.lineWidth=p.size*.65;c.lineCap='round';c.beginPath();c.moveTo(x-cross*l*(1+5*mix),y-l*(1-.85*mix));c.quadraticCurveTo(x-1,y,x+cross,y+p.size*(1-mix));c.stroke();
      c.fillStyle='rgba(26,48,55,.15)';c.beginPath();c.ellipse(x,y,p.size,p.size*1.45,0,0,Math.PI*2);c.fill();
    }
  }
  function waterTrend(){return state.paused?'暂停':surgeRate>.005?'上涨 '+surgeRate.toFixed(2)+' m/模拟时':surgeRate<-.005?'回落 '+Math.abs(surgeRate).toFixed(2)+' m/模拟时':surgeMemory.retained&&surgeLevel>.01?'高水位滞留':'平稳';}
  function updateHud(){
    const value=$('hudWindMode').value==='gust'?weather.gust:weather.sustained;
    $('hudWindValue').textContent=Math.round(value)+' kt';
    const bearing=(Math.atan2(-weather.ve,-weather.vn)/RAD+360)%360;
    $('hudDirection').textContent=weather.ms<.5?'近静风':(mobileControls()?'':'风来自 ')+directionName(bearing)+(mobileControls()?'':' '+(Math.round(bearing)%360)+'°');
    $('hudMapTitle').textContent=$('hudMapField').checked?'实时持续风场 · kt':'风场位置图';
    $('hudRainValue').textContent=Math.round(weather.rain)+' mm/h';$('hudSurgeValue').textContent='+'+surgeLevel.toFixed(2)+' m';$('hudSurgeTrend').textContent=waterTrend();$('surgeTrend').textContent=waterTrend();
    for(const [toggle,panel]of [['hudWindVisible','hudWindPanel'],['hudRainVisible','hudRainPanel'],['hudWaterVisible','hudWaterPanel'],['hudMapVisible','hudMapPanel']])$(panel).hidden=!$(toggle).checked;
  }
  function updateReadings() {
    updateLocationText();
    const ms=weather.ms,kt=weather.sustained,t=state.time;
    const gust=weather.gust;
    $('surgeValue').textContent='+'+surgeLevel.toFixed(2)+' m';
    if(windScene){const damage=windScene.stats();$('damageStatus').textContent='风毁 '+damage.destroyed+' / '+damage.total;$('survivalNote').textContent=damage.destroyed===damage.total?'全部可损物体已失效，可点恢复重新计时':Number.isFinite(damage.nextSeconds)?'按当前风，最短剩余坚持约 '+(damage.nextSeconds<60?Math.ceil(damage.nextSeconds)+' 模拟秒':Math.ceil(damage.nextSeconds/60)+' 模拟分'):'当前风速未达到新增损坏门槛';}
    updateHud();$('rainValue').textContent=Math.round(weather.rain)+' mm/h';
    const flooded=M.coastTerraces.filter(p=>surgeLevel>p.height+.015),next=M.coastTerraces.find(p=>surgeLevel<=p.height+.015);
    $('floodStage').textContent=(flooded.length?'已漫过'+flooded[flooded.length-1].name:'海水未漫上步道')+(next?' · 下一阶 '+next.name+' '+next.height.toFixed(2)+' m':'');
    $('localWind').textContent=Math.round(kt);$('localMs').textContent=`${weather.meanMs.toFixed(1)} m/s`;$('gustWind').textContent=Math.round(gust);
    const vis=weather.visibility;$('visibility').textContent=vis>=1000?(vis/1000).toFixed(1):String(Math.round(vis/10)*10);$('visibilityUnit').textContent=vis>=1000?'km':'m';$('visibilityNote').textContent=weather.sunshine>.6?(target.region==='eye'?'晴空风眼':'下沉 / 雨歇晴空'):weather.sustained>=90?'横行碎雾':weather.rain>100?'外围密集暴雨':target.region==='outer'?'阵雨间歇变化':'风雨遮蔽';
    const deg=ms<.5?null:(Math.atan2(-weather.ve,-weather.vn)/RAD+360)%360;
    $('windDirection').textContent=deg===null?'可变':directionName(deg);$('windDegrees').textContent=deg===null?'近静风':`${Math.round(deg)%360}°`;
    // ↑ rotated to the downwind direction in the currently viewed horizontal plane.
    const to=deg===null?0:(deg+180-state.yaw+360)%360;
    $('windArrow').style.transform=`rotate(${to}deg)`;$('windArrow').style.opacity=deg===null?'.25':'1';
    $('mapWindArrow').style.transform=`rotate(${deg===null?0:deg+180+45}deg)`;
    $('windMeter').style.width=`${Math.min(100,kt/220*100)}%`;
    if(soundGain&&audioCtx){const volume=state.paused?0:clamp((ms/90+weather.rain/180)*.17,0,.23);soundGain.gain.setTargetAtTime(state.sound?volume:0,audioCtx.currentTime,.2);lowFilter.frequency.setTargetAtTime(250+ms*13,audioCtx.currentTime,.4);}
  }
  function frame(now) {
    const rawdt=(now-last)/1000;last=now;const dt=Math.min(rawdt,.045);
    fps=fps*.96+(1/Math.max(.001,rawdt))*.04;
    const logicalDt=Math.min(Math.max(rawdt,0),1),step=state.paused?0:dt;
    ObserverCamera.move(state,touchFlightKeys.size?new Set([...flightKeys,...touchFlightKeys]):flightKeys,logicalDt);
    if(fullscreenActive()&&mouseLookEnabled&&document.pointerLockElement!==view&&(edgePan.x||edgePan.y)){const speed=logicalDt/Math.sqrt(Math.max(.5,state.zoom));turnView(state.yaw+edgePan.x*95*speed,state.pitch-edgePan.y*65*speed);}
    if(!state.paused){state.time+=logicalDt;state.simTime+=logicalDt*state.timeScale;if(state.advect&&state.motionSpeed>0){const km=state.motionSpeed*1.852*logicalDt*state.timeScale/3600;state.east+=Math.sin(state.motionHeading*RAD)*km;state.north+=Math.cos(state.motionHeading*RAD)*km;}}
    target=sampleField();
    const blend=1-Math.exp(-logicalDt*(target.region==='outer'?16:6));
    ['sustained','meanMs','ms','gust','rain','visibility','sunshine','outerMix','pulse'].forEach(k=>weather[k]+=(target[k]-weather[k])*blend);
    if(target.ms>.001){const next=Math.atan2(target.vn,target.ve),difference=Math.atan2(Math.sin(next-flowAngle),Math.cos(next-flowAngle));flowAngle+=difference*blend;}
    weather.ve=Math.cos(flowAngle)*weather.ms;weather.vn=Math.sin(flowAngle)*weather.ms;

    if(sceneReady){updateCamera();animateWeather(step,state.paused?0:logicalDt,logicalDt);}drawGlass(step);
    elapsed+=dt;if(elapsed>.12){updateReadings();drawMap();elapsed=0;}
    requestAnimationFrame(frame);
  }

  function bindEvents() {
    $('intensity').addEventListener('input',e=>{state.intensity=Number(e.target.value);updateTarget();});
    function numberChanged(){const n=Number($('intensityNumber').value);state.intensity=Math.round(clamp(Number.isFinite(n)&&n>0?n:110,20,200));updateTarget();}
    $('intensityNumber').addEventListener('change',numberChanged);$('intensityNumber').addEventListener('keydown',e=>{if(e.key==='Enter'){numberChanged();e.target.blur();}});
    const parameters={eyeRadius:[2,100],wallRadius:[6,240],stormRadius:[20,900],influenceRadius:[40,1500],rainStrength:[0,200],motionHeading:[0,359],motionSpeed:[0,60],timeScale:[1,1000],east:[-10000,10000],north:[-10000,10000]};
    for(const [id,bounds]of Object.entries(parameters)){
      const change=el=>{let value=id==='timeScale'&&el===$(id+'Range')?SliderScales.timeFromSlider(Number(el.value)):Number(el.value);if(!Number.isFinite(value))value=state[id];state[id]=id==='motionHeading'?((value%360)+360)%360:id==='timeScale'?Math.round(clamp(value,...bounds)):clamp(value,...bounds);updateTarget();};
      $(id).addEventListener('change',()=>change($(id)));$(id+'Range').addEventListener('input',()=>change($(id+'Range')));
      $(id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();change(e.target);e.target.blur();}});
    }
    const dial=$('headingDial');let turning=false;
    $('timeScaleRange').addEventListener('keydown',e=>{const delta={ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1,PageUp:10,PageDown:-10}[e.key];if(delta===undefined&&e.key!=='Home'&&e.key!=='End')return;e.preventDefault();state.timeScale=e.key==='Home'?1:e.key==='End'?1000:clamp(state.timeScale+delta,1,1000);updateTarget();});
    const turn=e=>{const r=dial.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;if(Math.hypot(x,y)<6)return;state.motionHeading=Math.round((Math.atan2(x,-y)/RAD+360)%360)%360;updateTarget();};
    dial.addEventListener('pointerdown',e=>{turning=true;dial.setPointerCapture(e.pointerId);turn(e);});dial.addEventListener('pointermove',e=>{if(turning)turn(e);});dial.addEventListener('pointerup',()=>turning=false);dial.addEventListener('pointercancel',()=>turning=false);
    dial.addEventListener('keydown',e=>{const sign={ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1}[e.key];if(!sign)return;e.preventDefault();state.motionHeading=(state.motionHeading+sign*(e.shiftKey?15:1)+360)%360;updateTarget();});
    for(const p of OBSERVATION_SITES){const option=document.createElement('option');option.value=p.id;option.textContent=p.name+' · 最高 '+p.maxFloor+'F';$('buildingSelect').appendChild(option);}
    $('buildingSelect').onchange=e=>selectSite(e.target.value);
    const floorChanged=el=>{state.floor=clamp(Math.round(Number(el.value)||1),1,currentSite().maxFloor);updateCamera();updateTarget();};$('floorRange').oninput=e=>floorChanged(e.target);$('floorNumber').onchange=e=>floorChanged(e.target);$('floorNumber').onkeydown=e=>{if(e.key==='Enter'){floorChanged(e.target);e.target.blur();}};
    $('moveButton').onclick=()=>{state.advect=!state.advect;$('moveButton').textContent=state.advect?'暂停推进中心':'开始推进中心';$('moveButton').setAttribute('aria-pressed',String(state.advect));if(state.advect&&state.motionSpeed===0){state.motionSpeed=15;$('motionSpeed').value=15;updateTarget();}};

    document.querySelectorAll('[data-preset]').forEach(btn=>btn.addEventListener('click',()=>{
      const kind=btn.dataset.preset;
      const p=observer();let east=0,north=0;
      if(kind==='outer')east=target.bandRadius+(state.influenceRadius-target.bandRadius)*.65;else if(kind==='storm')east=(target.hasEye?state.wallRadius:state.rmw)*.5+state.stormRadius*.5;else if(kind==='clear')east=state.influenceRadius+70;else if(kind==='reverse'){east=-state.rmw*.8;north=-state.rmw*.6;}else if(kind==='wall'){east=state.rmw*.8;north=state.rmw*.6;}
      state.east=p.east+east;state.north=p.north+north;state.advect=false;$('moveButton').textContent='开始推进中心';$('moveButton').setAttribute('aria-pressed','false');state.mapEast=p.east;state.mapNorth=p.north;state.extent=Math.max(94,Math.abs(east)+state.wallRadius);resizeCanvases();updateTarget(kind);
    }));
    mapController.bind();

    const cameraUi='button,input,select,textarea,dialog,details,.hud-map-wrap,.camera-toolbar,.touch-flight,.touch-zoom,.mobile-controls,.guide-card';
    view.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.button!==0||e.target.closest(cameraUi))return;view.focus({preventScroll:true});if(fullscreenActive()&&e.pointerType==='mouse')return;dragging={x:e.clientX,y:e.clientY,yaw:state.yaw,pitch:state.pitch};view.setPointerCapture(e.pointerId);view.classList.add('dragging');});
    view.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;
      if(fullscreenActive()&&e.pointerType==='mouse'){
        if(!mouseLookEnabled)return;
        const sensitivity=.12/Math.sqrt(Math.max(.5,state.zoom));
        if(document.pointerLockElement===view){turnView(state.yaw+e.movementX*sensitivity,state.pitch-e.movementY*sensitivity);}
        else if(e.target.closest(cameraUi)){hoverPointer=null;edgePan={x:0,y:0};}
        else{
          if(hoverPointer){const dx=e.clientX-hoverPointer.x,dy=e.clientY-hoverPointer.y;if(Math.abs(dx)<180&&Math.abs(dy)<180)turnView(state.yaw+dx*sensitivity,state.pitch-dy*sensitivity);}
          hoverPointer={x:e.clientX,y:e.clientY};const r=view.getBoundingClientRect(),edge=(p,size)=>clamp((p-(size-65))/65,0,1)-clamp((65-p)/65,0,1);edgePan={x:edge(e.clientX-r.left,r.width),y:edge(e.clientY-r.top,r.height)};
        }
        return;
      }
      if(e.target.closest(cameraUi))return;
      if(dragging)turnView(dragging.yaw-(e.clientX-dragging.x)*.12/Math.sqrt(Math.max(.5,state.zoom)),dragging.pitch+(e.clientY-dragging.y)*.09/Math.sqrt(Math.max(.5,state.zoom)));
    });
    view.addEventListener('pointerleave',()=>{hoverPointer=null;edgePan={x:0,y:0};});
    const release=()=>{dragging=null;view.classList.remove('dragging');};view.addEventListener('pointerup',release);view.addEventListener('pointercancel',release);
    view.addEventListener('wheel',e=>{if(e.target.closest(cameraUi)||e.ctrlKey)return;e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?view.clientHeight:1);state.zoom=clamp(state.zoom*Math.exp(-clamp(delta,-200,200)*.0025),ObserverCamera.minZoom,ObserverCamera.maxZoom);updateCamera();drawMap();},{passive:false});
    let touchBaseline;
    TouchControls.bindGesture(view,{
      start:s=>{touchBaseline={...s,yaw:state.yaw,pitch:state.pitch,zoom:state.zoom};view.focus({preventScroll:true});},
      move:s=>{const b=touchBaseline;if(!b)return;if(s.count>1){state.zoom=clamp(b.zoom*s.distance/Math.max(1,b.distance),ObserverCamera.minZoom,ObserverCamera.maxZoom);updateCamera();drawMap();}else turnView(b.yaw-(s.x-b.x)*.18/Math.sqrt(Math.max(.5,state.zoom)),b.pitch+(s.y-b.y)*.14/Math.sqrt(Math.max(.5,state.zoom)));},
      end:()=>touchBaseline=null
    },e=>!!e.target.closest(cameraUi));
    touchReleases.push(TouchControls.joystick($('flightStick'),touchFlightKeys));
    MobileView.bind({view,isMobile:mobileControls,onChange:()=>{updateHud();resizeCanvases();},stop:()=>touchReleases.forEach(clear=>clear())});
    document.querySelectorAll('[data-flight]').forEach(b=>touchReleases.push(TouchControls.hold(b,b.dataset.flight,touchFlightKeys)));
    for(const [id,factor] of [['viewZoomIn',1.3],['viewZoomOut',1/1.3]])$(id).onclick=()=>{state.zoom=clamp(state.zoom*factor,ObserverCamera.minZoom,ObserverCamera.maxZoom);updateCamera();drawMap();};
    const flightCodes=new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyC','Space','ShiftLeft','ShiftRight']);
    view.addEventListener('keydown',e=>{if(e.target!==view||document.querySelector('dialog[open]'))return;if(state.freeCamera&&flightCodes.has(e.code)){e.preventDefault();flightKeys.add(e.code);return;}const move={ArrowLeft:[-1.5,0],ArrowRight:[1.5,0],ArrowUp:[0,1.5],ArrowDown:[0,-1.5]}[e.key];if(!move)return;e.preventDefault();turnView(state.yaw+move[0]/Math.sqrt(state.zoom),state.pitch+move[1]/Math.sqrt(state.zoom));});
    document.addEventListener('keyup',e=>flightKeys.delete(e.code));window.addEventListener('blur',()=>flightKeys.clear());view.addEventListener('blur',()=>flightKeys.clear(),true);
    $('freeCameraButton').onclick=()=>setCameraMode(!state.freeCamera);$('overviewButton').onclick=()=>setCameraMode(true,true);
    $('zoomReset').onclick=()=>{state.zoom=1;updateCamera();drawMap();};
    $('clearFogButton').onclick=()=>{state.clearFog=!state.clearFog;syncCameraControls();};
    $('flightSpeedRange').oninput=e=>{state.flightSpeed=Number(e.target.value);$('flightSpeedValue').textContent=state.flightSpeed+' m/s';};
    $('homeView').onclick=()=>{state.yaw=8;state.pitch=-1.5;if(state.freeCamera){const p=currentSite();state.freeX=p.x;state.freeY=p.ground+state.floor*3;state.freeZ=p.z;}updateCamera();drawMap();};
    const syncMouseLook=()=>{const locked=document.pointerLockElement===view;$('mouseLookButton').setAttribute('aria-pressed',String(mouseLookEnabled));$('mouseLookButton').textContent=mouseLookEnabled?'环视开启 · M 关闭':'鼠标自由 · M 环视';$('mouseLookButton').title=mouseLookEnabled?(locked?'M 释放鼠标以操作地图和控件；Esc 也可释放':'当前浏览器使用边缘连续环视：移到画面边缘持续转动；M 关闭'):'按 M 开启无限鼠标环视';};
    const releaseMouseLook=()=>{mouseLookEnabled=false;hoverPointer=null;edgePan={x:0,y:0};if(document.pointerLockElement===view)document.exitPointerLock();syncMouseLook();};
    const startMouseLook=async()=>{if(!fullscreenActive()||matchMedia("(pointer:coarse)").matches||document.querySelector('.guide-tour:not([hidden])'))return;mouseLookEnabled=true;hoverPointer=null;edgePan={x:0,y:0};view.focus({preventScroll:true});try{await view.requestPointerLock();}catch(e){/* Embedded browsers can deny pointer lock; edge panning still allows full turns. */}syncMouseLook();};
    const toggleMouseLook=()=>{if(document.pointerLockElement===view||mouseLookEnabled)releaseMouseLook();else startMouseLook();};
    $('mouseLookButton').onclick=toggleMouseLook;
    document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===view;if(hadPointerLock&&!locked)mouseLookEnabled=false;hadPointerLock=locked;hoverPointer=null;edgePan={x:0,y:0};flightKeys.clear();syncMouseLook();});
    document.addEventListener('pointerlockerror',syncMouseLook);
    document.addEventListener('keydown',e=>{if(e.code!=='KeyM'||e.repeat||!fullscreenActive()||e.target.closest('input,select,textarea,[contenteditable=true]')||document.querySelector('dialog[open]'))return;e.preventDefault();toggleMouseLook();});
    const syncFullscreen=()=>{dragging=null;view.classList.remove('dragging');view.classList.toggle('is-fullscreen',document.fullscreenElement===view);if(!fullscreenActive())releaseMouseLook();$('fullscreen').textContent=fullscreenActive()?'退出全屏':'全屏';syncCameraControls();updateHud();resizeCanvases();};
    $('fullscreen').onclick=async()=>{if(document.fullscreenElement){releaseMouseLook();await document.exitFullscreen();return;}if(view.classList.contains('is-fullscreen')){releaseMouseLook();view.classList.remove('is-fullscreen');$('fullscreen').textContent='全屏';syncCameraControls();resizeCanvases();return;}try{await view.requestFullscreen();}catch(e){view.classList.add('is-fullscreen');$('fullscreen').textContent='退出全屏';syncCameraControls();updateHud();resizeCanvases();}await startMouseLook();};
    document.addEventListener('fullscreenchange',syncFullscreen);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.fullscreenElement&&view.classList.contains('is-fullscreen')){releaseMouseLook();view.classList.remove('is-fullscreen');$('fullscreen').textContent='全屏';syncCameraControls();resizeCanvases();}});
    for(const id of ['hudWindVisible','hudRainVisible','hudWaterVisible','hudMapVisible','hudWindMode'])$(id).onchange=()=>{updateHud();resizeCanvases();};
    $('pauseButton').onclick=()=>{state.paused=!state.paused;$('pauseButton').textContent=state.paused?'继续模拟':'暂停模拟';$('pauseButton').setAttribute('aria-pressed',String(state.paused));};
    $('soundButton').onclick=async()=>{
      try{
        if(!audioCtx){audioCtx=new (window.AudioContext||window.webkitAudioContext)();const b=audioCtx.createBuffer(1,audioCtx.sampleRate*3,audioCtx.sampleRate),d=b.getChannelData(0);let brown=0;for(let i=0;i<d.length;i++){const white=Math.random()*2-1;brown=(brown+.022*white)/1.023;d[i]=brown*3+white*.08;}noiseSource=audioCtx.createBufferSource();noiseSource.buffer=b;noiseSource.loop=true;lowFilter=audioCtx.createBiquadFilter();lowFilter.type='lowpass';lowFilter.frequency.value=650;soundGain=audioCtx.createGain();soundGain.gain.value=0;noiseSource.connect(lowFilter).connect(soundGain).connect(audioCtx.destination);noiseSource.start();}
        await audioCtx.resume();state.sound=!state.sound;$('soundButton').textContent=state.sound?'关闭风雨声':'开启风雨声';$('soundButton').setAttribute('aria-pressed',String(state.sound));
      }catch(e){$('soundButton').textContent='声音不可用';}
    };
    $('aboutButton').onclick=()=>$('about').showModal();$('about').addEventListener('click',e=>{if(e.target===$('about')){const r=$('about').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('about').close();}});
    $('restoreButton').onclick=()=>{if(windScene)windScene.restore();if(floodDebris)floodDebris.reset();lastShadowTime=-1;updateReadings();};
    $('resetButton').onclick=()=>{touchReleases.forEach(clear=>clear());const sound=state.sound;surgeLevel=0;surgeMemory={level:0,crest:0,holdRadius:0};if(windScene)windScene.restore();if(floodDebris)floodDebris.reset();Object.assign(state,defaults,{sound});$('moveButton').textContent='开始推进中心';$('moveButton').setAttribute('aria-pressed','false');$('pauseButton').textContent='暂停模拟';$('pauseButton').setAttribute('aria-pressed','false');mapController.syncMode();updateCamera();resizeCanvases();updateTarget('wall');};

    window.addEventListener('resize',resizeCanvases);new ResizeObserver(resizeCanvases).observe(view);
    document.addEventListener('visibilitychange',()=>{flightKeys.clear();last=performance.now();if(audioCtx&&document.hidden)audioCtx.suspend();else if(audioCtx&&state.sound)audioCtx.resume().catch(()=>{});});
  }
  bindEvents();UsageGuide.bind();syncCameraControls();SliderScales.decorateAll();updateTarget('wall');resizeCanvases();
  try{initScene();$('loading').hidden=true;}catch(e){console.error(e);$('loading').hidden=true;$('renderError').hidden=false;}
  updateReadings();requestAnimationFrame(frame);
  // Read-only inspection hook for functional verification, no external services.
  window.TyphoonSimulator={getState:()=>({...state}),getWeather:()=>({...weather}),getTarget:()=>({...target}),diagnostics:()=>({sceneReady,renderedFrames,fps,drawCalls:renderer?renderer.info.render.calls:0,triangles:renderer?renderer.info.render.triangles:0,debrisCount:debris?.count,damage:windScene?.stats(),surgeMemory:{...surgeMemory},surgeLevel,waterEdge:M.waterEdge(surgeLevel),waterPosition:sea?{x:sea.position.x,z:sea.position.z}:null,terraceDepths:M.coastTerraces.map(p=>({name:p.name,height:p.height,depth:M.floodDepth(p.x,surgeLevel)})),rainCount:rainGeo?rainGeo.drawRange.count/2:0,mistMix:M.visuals(Math.max(weather.sustained,weather.gust*.85),weather.rain).mistMix,treeBend:M.visuals(Math.max(weather.sustained,weather.gust*.85),weather.rain).treeBend,windVectorWorld:{x:weather.ve,z:-weather.vn}})};
  window.TyphoonSimulator.floatingDiagnostics=()=>floodDebris?.stats();
  window.TyphoonSimulator.rainDiagnostics=()=>{
    const alpha=rainGeo?.attributes.rainPatchAlpha.array,count=rainGeo?.drawRange.count/2,patchSamples=[];
    for(let i=0;i<Math.min(count||0,256);i++)patchSamples.push(alpha[i*2]);
    return{count,mistCount:mist?.count,mistOpacity:mist?.material.opacity,trailLength:rainPositions?Math.hypot(rainPositions[0]-rainPositions[3],rainPositions[1]-rainPositions[4],rainPositions[2]-rainPositions[5]):0,patchRange:patchSamples.length?[Math.min(...patchSamples),Math.max(...patchSamples)]:[0,0],field:rainFog?.diagnostics()};
  };
  window.TyphoonSimulator.eyeEnvironment=(intensity=state.intensity,distance=0)=>EyeWall.environment(intensity,state.eyeRadius,state.stormRadius,distance);
  window.TyphoonSimulator.eyeMotion=()=>({wallPhase:eyeWall?.group.rotation.y,cloudRotation:eyeClouds?.uniforms.eyeRotation.value.toArray(),config:typeof SimulatorConfig==='undefined'?{source:'内置'}:SimulatorConfig.diagnostics()});
  // Keep the original caption defaults available while reducing visible duplicate text.
  document.querySelector('.reading:nth-child(2)>small').hidden=true;$('visibilityNote').hidden=true;
  const directionLabel=$('windDegrees').closest('.reading').querySelector('.metric-label');
  for(const node of directionLabel.childNodes)if(node.nodeType===Node.TEXT_NODE)node.nodeValue=node.nodeValue.replace('风来向','风向');
  directionLabel.append($('windDegrees'));
  document.querySelector('.observation-bottom').prepend(document.querySelector('.wind-info'));
})();
