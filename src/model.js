/* Educational Northern Hemisphere cyclone. km, kt; weather phase in simulated minutes. */
(function(root){
  'use strict';
  const KT=1852/3600,RAD=Math.PI/180;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a),0,1);return t*t*(3-2*t);};
  const configured=(key,fallback,context)=>root.SimulatorConfig?root.SimulatorConfig.formula(key,fallback,context):fallback();
  const strength=n=>clamp(Number(n)||20,20,200);
  // Fixed coastal cross-section, ordered from sea to inland. Short slopes join level terraces.
  const coastProfile=Object.freeze([[80,-1],[40,-.55],[39,.25],[25,.25],[23,.55],[3.5,.55],[1.5,.9],[-62,.9],[-66,1.7],[-111,1.7],[-115,2.9],[-176,2.9],[-182,4.65],[-2010,4.65]].map(Object.freeze));
  const coastTerraces=Object.freeze([
    {name:'海滨步道',height:.25,x:32},
    {name:'滨海道路',height:.55,x:14},
    {name:'住宅前场',height:.9,x:-30},
    {name:'内街平台',height:1.7,x:-85},
    {name:'高处住宅台地',height:2.9,x:-145},
    {name:'内陆高地',height:4.65,x:-230}
  ].map(Object.freeze));
  function coastalHeight(x){
    if(x>=coastProfile[0][0])return coastProfile[0][1];
    for(let i=1;i<coastProfile.length;i++){const a=coastProfile[i-1],b=coastProfile[i];if(x>=b[0])return a[1]+(b[1]-a[1])*(a[0]-x)/(a[0]-b[0]);}
    return coastProfile[coastProfile.length-1][1];
  }
  function waterEdge(level){
    if(level<coastProfile[0][1])return coastProfile[0][0];
    for(let i=1;i<coastProfile.length;i++){const a=coastProfile[i-1],b=coastProfile[i];if(level<b[1])return a[0]+(b[0]-a[0])*(level-a[1])/(b[1]-a[1]);}
    return coastProfile[coastProfile.length-1][0];
  }
  const floodDepth=(x,level)=>Math.max(0,level-coastalHeight(x));
  function structure(options=28,intensity=110){
    intensity=strength(intensity);
    if(typeof options==='number')options={eyeRadius:options*.55,wallRadius:options*1.38};
    const hasEye=intensity>=67,hasStorm=intensity>=34;
    const eyeRadius=clamp(Number(options.eyeRadius)||15,2,100);
    const wallRadius=clamp(Number(options.wallRadius)||40,eyeRadius+4,240);
    const stormRadius=clamp(Number(options.stormRadius)||110,wallRadius+8,900);
    const influenceRadius=clamp(Number(options.influenceRadius)||260,hasStorm?stormRadius+20:40,1500);
    // A newly formed eye starts as the broad weak-system core, then contracts continuously.
    const eyeDevelopment=configured('eye.development',()=>smooth(67,110,intensity),{intensity}),eyeClearing=configured('eye.rainClearing',()=>smooth(67,100,intensity),{intensity});
    const broadRmw=hasStorm?stormRadius*.42:influenceRadius*.16;
    const rmw=broadRmw+(eyeRadius+(wallRadius-eyeRadius)*.52-broadRmw)*eyeDevelopment;
    const windWallRadius=stormRadius+(wallRadius-stormRadius)*eyeDevelopment;
    const bandRadius=hasStorm?stormRadius:influenceRadius*.32;
    return {eyeRadius,wallRadius,stormRadius,influenceRadius,rmw,bandRadius,hasEye,hasStorm,eyeDevelopment,eyeClearing,windWallRadius,preparedIntensity:intensity,
      rainStrength:clamp(Number(options.rainStrength??100),0,200),
      heading:((Number(options.heading)||0)%360+360)%360,motionSpeed:clamp(Number(options.motionSpeed)||0,0,60)};
  }
  function hash(n){const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);}
  // Nested event chance and duration: more frequent inward without increasing pulse amplitude.
  function cell(t,period,seed,inward=1,occurrence=1){
    const index=Math.floor(t/period),f=t-index*period;
    if(hash(index+seed+103)>(.24+.74*inward)*occurrence)return 0;
    const duration=period*(.19+.40*inward)*(.75+.25*hash(index+seed+17));
    const start=.24+hash(index+seed)*Math.max(.2,period-duration-.9);
    return smooth(start,start+.18,f)*(1-smooth(start+duration,start+duration+.45,f))*(.55+.45*hash(index+seed+61));
  }
  function squall(t,seed=0,inward=1,occurrence=1){return Math.max(cell(t,6.7,seed+13,inward,occurrence),cell(t+2.2,11.3,seed+81,inward,occurrence));}
  function meanWind(east,north,intensity=110,options=28,time=0){
    intensity=strength(intensity);
    const cfg=options.preparedIntensity===intensity?options:structure(options,intensity);
    const {eyeRadius,stormRadius,influenceRadius,rmw,bandRadius,hasEye,hasStorm,eyeDevelopment,windWallRadius,heading,motionSpeed}=cfg;
    const radius=Math.hypot(east,north),q=radius/rmw;
    let profile;
    const wallLevel=.24+.18*eyeDevelopment;
    if(radius<=rmw)profile=(1-.92*eyeDevelopment)*smooth(0,rmw,radius)+.92*eyeDevelopment*smooth(eyeRadius*.45,rmw,radius);
    else if(hasStorm&&radius<=windWallRadius)profile=1-(1-wallLevel)*smooth(rmw,windWallRadius,radius);
    else if(hasStorm&&radius<=stormRadius)profile=wallLevel-(wallLevel-.24)*smooth(windWallRadius,stormRadius,radius);
    else if(radius<=influenceRadius)profile=hasStorm?.24-.195*smooth(stormRadius,influenceRadius,radius):1-.955*smooth(rmw,influenceRadius,radius);
    else profile=.015+.030*Math.exp(-(radius-influenceRadius)/260);
    // Smooth low-order asymmetry only. The peak is preserved and strong cores become rounder.
    const a=Math.atan2(north,east),asym=.04*(1-.94*smooth(67,185,intensity));
    profile+=asym*profile*(1-profile)*(.7*Math.sin(a+.4+time*.002)+.3*Math.sin(2*a-.8));
    profile=configured('wind.profile',()=>profile,{profile,radius,intensity,rmw,eyeRadius,stormRadius,influenceRadius,eyeDevelopment,time});
    let ve=0,vn=0;
    if(radius>1e-8){const inflow=15*RAD;ve=(north*Math.cos(inflow)+east*Math.sin(inflow))/radius*intensity*profile;vn=(-east*Math.cos(inflow)+north*Math.sin(inflow))/radius*intensity*profile;}
    const translation=.65*motionSpeed*profile;ve+=Math.sin(heading*RAD)*translation;vn+=Math.cos(heading*RAD)*translation;
    const sustained=Math.hypot(ve,vn),right=(-east)*Math.cos(heading*RAD)-(-north)*Math.sin(heading*RAD);
    return {...cfg,radius,q,profile,sustained,meanMs:sustained*KT,ve,vn,
      semicircle:motionSpeed<.05||radius<.1?'none':right>=0?'danger':'safe',
      region:radius>=influenceRadius?'clear':hasEye&&eyeDevelopment>0&&radius<eyeRadius?'eye':hasEye&&eyeDevelopment>0&&radius<=cfg.wallRadius?'wall':hasStorm&&radius<=stormRadius?'storm':!hasStorm&&radius<=bandRadius?'core':'outer'};
  }
  function visuals(kt,rain){
    const severe=clamp((kt-35)/145,0,1.17),mistMix=smooth(90,130,kt);
    return {debrisCount:Math.min(340,Math.round(280*Math.pow(severe,2.25))),debrisScale:.38+3.2*Math.pow(clamp((kt-45)/135,0,1.3),1.65),mistMix,
      rainFall:32*(1-mistMix)+2.2*mistMix,treeBend:.16*smooth(15,100,kt)+1.12*Math.pow(smooth(100,185,kt),.8),mistOpacity:mistMix*smooth(1,28,rain)};
  }
  function debrisMotion(kt,kind){
    const heavy=kind>.8,medium=kind>.46&&!heavy,threshold=heavy?100:medium?58:28,lift=smooth(threshold,heavy?195:medium?150:110,kt);
    return {active:kt>threshold,speed:heavy?.22+.34*lift:medium?.48+.30*lift:.78+.18*lift,height:heavy?.4+18*lift:medium?1+37*lift:3+66*lift,
      size:heavy?1.1+1.6*lift:medium?.35+.65*lift:.10+.24*lift,tumble:heavy?.55:medium?1.4:2.8};
  }
  function surge(kt){return configured('surge.level',()=>clamp(3*Math.pow(Math.max(0,kt-18)/152,2),0,4.5),{kt});}
  // Response constants are simulated seconds; at 60x the rise retains its previous visual pace.
  function surgeResponse(kt,rising=true){return configured('surge.responseSeconds',()=>rising?(65-25*smooth(95,185,kt))*60:6*3600,{kt,rising});}
  function advanceSurge(memory,{sustained,intensity,radius,simDt}){
    const desired=surge(sustained),dt=Math.max(0,simDt);
    memory.level=memory.level||0;memory.crest=Math.max(memory.crest||0,desired);
    if(desired>.03)memory.holdRadius=Math.max(memory.holdRadius||0,500*smooth(80,170,intensity));
    const retained=memory.crest>.03&&intensity>=100&&radius<=(memory.holdRadius||0);
    const goal=retained?Math.max(desired,memory.crest):desired;
    if(goal>memory.level)memory.level+=(goal-memory.level)*(1-Math.exp(-dt/surgeResponse(sustained)));
    else if(!retained)memory.level=Math.max(goal,memory.level-Math.max(.03,memory.crest)*dt/surgeResponse(sustained,false));
    memory.retained=retained;
    if(!retained&&memory.level<.005&&desired<.005){memory.level=0;memory.crest=0;memory.holdRadius=0;}
    return memory.level;
  }
  const damageKinds=Object.freeze({
    bin:{threshold:45,budget:1200,minimum:180},sign:{threshold:65,budget:1600,minimum:300},
    tree:{threshold:145,budget:4800,minimum:1200},lamp:{threshold:155,budget:6000,minimum:1800},
    window:{threshold:160,budget:1800,minimum:180},rail:{threshold:95,budget:14000,minimum:2400},
    banner:{threshold:75,budget:2100,minimum:300},hut:{threshold:120,budget:1800,minimum:180}
  });
  function survivalTime(kind,kt,resistance=1){
    const cfg=damageKinds[kind];if(!cfg||kt<=cfg.threshold)return Infinity;
    const load=Math.pow(kt/cfg.threshold,2)-1;
    return Math.max(cfg.minimum,cfg.budget/(load*load))*resistance;
  }
  function advanceDamage(damage,kind,kt,simDt,resistance=1){return clamp(damage+Math.max(0,simDt)/survivalTime(kind,kt,resistance),0,1);}
  function debrisSupply(ve,vn){const ms=Math.hypot(ve,vn);return .7*(1-.78*smooth(.05,.65,ms>0?-ve/ms:0));}
  // Surface wind drift: larger pieces accelerate more slowly and need deeper water.
  function floatingMotion(kt,volume,depth){
    const bulk=Math.cbrt(Math.max(.001,volume)),draft=.035+.13*bulk;
    const afloat=depth>draft,shallow=smooth(draft,draft+.3,depth);
    return{afloat,draft,speed:afloat?Math.max(0,kt)*KT*(.018+.047/(1+bulk*2.8))*(.25+.75*shallow):0,response:1.2+bulk*5};
  }
  function sample(east,north,intensity=110,options=28,time=0){
    intensity=strength(intensity);
    const field=meanWind(east,north,intensity,options,time);
    const {eyeRadius,wallRadius,influenceRadius,bandRadius,radius,hasEye,eyeDevelopment,eyeClearing,sustained}=field;
    const outerMix=smooth(bandRadius,influenceRadius,radius),inward=1-outerMix,outside=smooth(influenceRadius,influenceRadius+30,radius);
    const rainEdge=1-smooth(influenceRadius*.94,influenceRadius,radius);
    const rainOccurrence=smooth(0,.18,inward);
    const pulse=squall(time,5,inward),rainPulse=clamp(.72*squall(time-.65,5,inward,rainOccurrence)+.38*squall(time+1.4,47,inward,rainOccurrence),0,1);
    const gustFactor=(1.10+.035*Math.sin(time*1.37)+.10*pulse)*(1-outerMix)+(.72+1.75*pulse)*outerMix*(1-outside)+(.85+.65*pulse)*outside;
    const gust=sustained*gustFactor,angle=(hash(Math.floor((time+1.1)/6.7)+39)-.5)*1.9*pulse*outerMix+.12*Math.sin(time*2.4)*outerMix;
    const cv=Math.cos(angle),sv=Math.sin(angle),ve=(field.ve*cv-field.vn*sv)*gustFactor*KT,vn=(field.ve*sv+field.vn*cv)*gustFactor*KT;
    const rainFactor=field.rainStrength/100,scale=rainFactor;
    const outerScale=(.9+.1*smooth(20,140,intensity))*(.85+.15*rainFactor);
    let rain;
    if(radius<=bandRadius){
      // Nearly level storm-circle rain; a narrow outer eyewall ramp leads to an inner plateau.
      // Without an eye, use a stronger, broad inward rain gradient instead.
      const broadRain=26+34*(1-smooth(0,bandRadius,radius));
      const stormRain=26+3*(1-smooth(wallRadius,bandRadius,radius));
      const wallRamp=1-smooth(eyeRadius+(wallRadius-eyeRadius)*.72,wallRadius,radius);
      const developedRain=stormRain+43*wallRamp;
      const eyeDrying=eyeClearing*(1-smooth(eyeRadius*.25,eyeRadius,radius));
      rain=(broadRain+(developedRain-broadRain)*eyeDevelopment)*(1-eyeDrying)*scale;
      rain*=1+.035*Math.sin(time*.9)*smooth(0,bandRadius,radius);
    }
    else{
      const mix=smooth(bandRadius,bandRadius+(influenceRadius-bandRadius)*.38,radius);
      const rare=hash(Math.floor(time/18.7)+307)<.045+.09*inward?1:0;
      const shower=.15+75*Math.pow(rainPulse,1.25)+190*rare*Math.pow(rainPulse,2.4);
      rain=((1-mix)*26*scale*(1+.035*Math.sin(time*.9))+mix*shower*outerScale)*rainEdge;
    }
    const eyeSun=configured('weather.eyeSun',()=>hasEye?smooth(145,180,intensity)*(1-smooth(eyeRadius*.35,eyeRadius*.88,radius)):0,{hasEye,intensity,eyeRadius,radius});
    const breakMix=smooth(bandRadius,bandRadius+(influenceRadius-bandRadius)*.38,radius),dryBreak=(1-smooth(.02,.18,rainPulse))*breakMix;
    const sunshine=clamp(eyeSun+dryBreak*.82*(1-rainEdge*.15)+.90*(1-rainEdge),0,1);
    rain*=1-sunshine;
    rain=configured('weather.rain',()=>rain,{rain,intensity,sustained,radius,eyeRadius,wallRadius,bandRadius,rainFactor,rainPulse,sunshine,time});
    const ms=Math.hypot(ve,vn),mist=visuals(Math.max(sustained,gust*.85),rain).mistMix;
    const visibility=configured('weather.visibility',()=>clamp(11000/(1+rain*.12+3*Math.pow(rain/35,2.4)+Math.pow(ms/14,2)+mist*22*Math.pow(gust/130,2)),55,11000),{rain,ms,mist,gust,intensity,sustained,radius});
    return {...field,ms,ve,vn,gust,rain,visibility,bearing:ms<.5?null:(Math.atan2(-ve,-vn)/RAD+360)%360,pulse,rainPulse,outerMix,inward,sunshine,rainEventChance:(.24+.74*inward)*rainOccurrence,gustEventChance:.24+.74*inward,surge:surge(sustained)};
  }
  const api={sample,meanWind,structure,visuals,debrisMotion,debrisSupply,floatingMotion,surge,surgeResponse,advanceSurge,survivalTime,advanceDamage,damageKinds,squall,clamp,smooth,KT,coastProfile,coastTerraces,coastalHeight,waterEdge,floodDepth};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.StormModel=api;
})(typeof window!=='undefined'?window:globalThis);
