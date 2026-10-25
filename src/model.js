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
  // Direct continuous-time random flight in log space. A monotone cubic CDF
  // supplies a continuous density with the specified central masses and tails.
  // Random reversals integrate -d(log density); no threshold is a fixed turning
  // point, and no temporal waveform or selected peak is interpolated/reshaped.
  function logFlight(widths,seed){
    let word=seed>>>0;
    const random=()=>{word=(word+0x6D2B79F5)>>>0;let n=word;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return((n^(n>>>14))>>>0)/4294967296;};
    const exponential=()=>-Math.log1p(-random());
    const knots=[0,...widths.map(Math.log1p)],mass=[.025,.225,.225],c=knots[3];
    const spans=mass.map((p,i)=>knots[i+1]-knots[i]),secants=mass.map((p,i)=>p/spans[i]);
    const density=[];
    density[0]=Math.max(0,((2*spans[0]+spans[1])*secants[0]-spans[0]*secants[1])/(spans[0]+spans[1]));
    for(let i=1;i<3;i++){
      const w1=2*spans[i]+spans[i-1],w2=spans[i]+2*spans[i-1];
      density[i]=(w1+w2)/(w1/secants[i-1]+w2/secants[i]);
    }
    density[3]=Math.max(0,((2*spans[2]+spans[1])*secants[2]-spans[2]*secants[1])/(spans[2]+spans[1]));
    const tail=.025/density[3],pieces=mass.map((p,i)=>({
      a:density[i],b:6*secants[i]-4*density[i]-2*density[i+1],d:3*density[i]+3*density[i+1]-6*secants[i]
    }));
    const cdf=(i,t)=>spans[i]*(pieces[i].a*t+pieces[i].b*t*t/2+pieces[i].d*t*t*t/3);
    const logDensity=x=>{
      const r=Math.abs(x);if(r>=c)return Math.log(density[3])-(r-c)/tail;
      const i=r<knots[1]?0:r<knots[2]?1:2,t=(r-knots[i])/spans[i],p=pieces[i];
      return Math.log(p.a+t*(p.b+p.d*t));
    };
    // Split only at density extrema so each integrated hazard is monotone.
    const positive=knots.slice(1);
    for(let i=0;i<3;i++){const p=pieces[i],t=-p.b/(2*p.d);if(t>0&&t<1)positive.push(knots[i]+spans[i]*t);}
    positive.sort((a,b)=>a-b);
    const edges=[-Infinity,...positive.slice().reverse().map(x=>-x),0,...positive,Infinity];
    const speed=()=>c/3*(.55+.9*random())*(random()<.5?-1:1);
    const u=random()/2;let magnitude;
    if(u>=.475)magnitude=c+tail*exponential();
    else{
      const i=u<.025?0:u<.25?1:2,target=u-[0,.025,.25][i];let low=0,high=1;
      for(let j=0;j<44;j++){const mid=(low+high)/2;if(cdf(i,mid)<target)low=mid;else high=mid;}
      magnitude=knots[i]+spans[i]*(low+high)/2;
    }
    let x=magnitude*(random()<.5?-1:1),band=edges.findIndex(edge=>edge>x)-1;
    let velocity=speed(),refresh=2.5*exponential(),hazard=exponential();
    function advance(dt){
      let remaining=Math.max(0,dt);
      while(remaining>0){
        const direction=velocity>0?1:-1,boundary=edges[band+(direction>0?1:0)];
        const crossing=Math.max(0,(boundary-x)/velocity);
        const limit=Math.min(remaining,crossing,refresh),end=limit===crossing?boundary:x+velocity*limit;
        const startDensity=logDensity(x),consumed=Math.max(0,startDensity-logDensity(end));
        if(consumed>=hazard){
          const target=startDensity-hazard;let low=0,high=1;
          for(let j=0;j<44;j++){const mid=(low+high)/2;if(logDensity(x+(end-x)*mid)>target)low=mid;else high=mid;}
          const fraction=(low+high)/2,step=limit*fraction;
          x+=(end-x)*fraction;remaining-=step;refresh-=step;velocity=-velocity;hazard=exponential();
        }else{
          x=end;remaining-=limit;hazard-=consumed;
          const refreshed=limit===refresh;refresh-=limit;
          if(limit===crossing)band+=direction;
          if(refreshed){velocity=speed();refresh=2.5*exponential();}
        }
      }
      return Math.exp(x);
    }
    return{advance,value:()=>Math.exp(x)};
  }
  function createVariability(seed=Date.now()){
    const initialSeed=Number(seed)>>>0;
    const wind=logFlight([.02,.10,.25],initialSeed^0x9E3779B9);
    const stormWind=logFlight([.03,.12,.25],initialSeed^0x27D4EB2F);
    const storm=logFlight([.02,.08,.15],initialSeed^0x85EBCA6B);
    const wall=logFlight([.01,.04,.08],initialSeed^0xC2B2AE35);
    let seconds=0;
    const snapshot=()=>({seed:initialSeed,seconds,gust:wind.value(),stormGust:stormWind.value(),stormRain:storm.value(),wallRain:wall.value()});
    return{snapshot,advance(dt){const step=Math.max(0,dt);seconds+=step;wind.advance(step);stormWind.advance(step);storm.advance(step);wall.advance(step);return snapshot();}};
  }
  // A sharp, continuous crest response acts on rendering and sound only.
  function gustResponse(weather){
    const ratio=weather.sustained>0?weather.gust/weather.sustained:1;
    const charge=smooth(1.08,1.25,ratio),gate=smooth(80,120,weather.sustained);
    const crest=gate*Math.pow(charge,3),pileup=gate*charge*(1-charge)*4;
    // Positive kt per real second only; falling gusts have no rise contribution.
    const rise=gate*-Math.expm1(-Math.max(0,weather.gustRiseRate??0)/Math.max(1,weather.sustained)/.012);
    const burst=1-(1-crest)*(1-rise);
    return{ratio,crest,rise,burst,pileup,frequency:1+burst,speed:1+.3*burst};
  }
  function weatherVisuals(weather){
    const visual=visuals(Math.max(weather.sustained,weather.gust*.85),weather.rain),gust=gustResponse(weather);
    const rise=weather.gustVisualRise??gust.rise,burst=1-(1-gust.crest)*(1-rise),speed=1+.3*burst;
    return{...visual,rainSpeed:visual.rainSpeed*speed,rainFall:visual.rainFall*speed,rainDensity:visual.rainDensity*(1+.25*burst),rainOpacity:1+.35*burst,
      curtainDrift:visual.curtainDrift*speed,curtainFall:visual.curtainFall*speed,
      gustFrequency:1+burst,gustSpeed:speed,gustBurst:burst,gustPileup:gust.pileup};
  }
  // Smooth the display response only; the random wind and raw rise factor stay intact.
  function advanceGustVisualRise(previous,weather,dt){
    const value=clamp(previous??0,0,1),goal=gustResponse(weather).rise;
    return value+(goal-value)*-Math.expm1(-Math.max(0,dt)/(goal>value?.25:.55));
  }
  // Nested event chance and duration: more frequent inward without increasing pulse amplitude.
  function cell(t,period,seed,inward=1,occurrence=1){
    const index=Math.floor(t/period),f=t-index*period;
    if(hash(index+seed+103)>(.24+.74*inward)*occurrence)return 0;
    const duration=period*(.19+.40*inward)*(.75+.25*hash(index+seed+17));
    const start=.24+hash(index+seed)*Math.max(.2,period-duration-.9);
    return smooth(start,start+.18,f)*(1-smooth(start+duration,start+duration+.45,f))*(.55+.45*hash(index+seed+61));
  }
  function squall(t,seed=0,inward=1,occurrence=1){return Math.max(cell(t,6.7,seed+13,inward,occurrence),cell(t+2.2,11.3,seed+81,inward,occurrence));}
  function stormBackground(cfg,radius,intensity){
    return cfg.hasStorm?smooth(34,67,intensity)*smooth(cfg.rmw,Math.max(cfg.rmw+8,cfg.windWallRadius),radius)*(1-smooth(cfg.wallRadius,cfg.stormRadius,radius)):0;
  }
  function meanWind(east,north,intensity=110,options=28,time=0){
    intensity=strength(intensity);
    const cfg=options.preparedIntensity===intensity?options:structure(options,intensity);
    const {eyeRadius,stormRadius,influenceRadius,rmw,bandRadius,hasEye,hasStorm,eyeDevelopment,windWallRadius,heading,motionSpeed}=cfg;
    const radius=Math.hypot(east,north),q=radius/rmw;
    // Willoughby et al. (2006) inspired family, adapted to the editable surface geometry.
    // A power-law core joins two exponential tails with a smooth, exactly preserved peak.
    const coreExponent=.79+.65*smooth(67,185,intensity),fastFraction=.10+.50*smooth(83,185,intensity);
    const fastLength=clamp((windWallRadius-rmw)*2,8,80),shoulder=clamp((windWallRadius-rmw)*.10,.5,4);
    const background=.015,tailTarget=.045;
    const slowLength=Math.max(fastLength,(influenceRadius-rmw)/Math.log((1-background)*(1-fastFraction)/(tailTarget-background)));
    let profile;
    if(radius<=rmw){const power=Math.pow(q,coreExponent);profile=power+(1-power)*smooth(.78,1,q);}
    else{
      const s=radius-rmw,d=s-shoulder*(1-Math.exp(-s/shoulder));
      profile=background+(1-background)*(fastFraction*Math.exp(-d/fastLength)+(1-fastFraction)*Math.exp(-d/slowLength));
    }
    // Smooth low-order asymmetry only. The peak is preserved and strong cores become rounder.
    const a=Math.atan2(north,east),asym=.04*(1-.94*smooth(67,185,intensity));
    profile+=asym*profile*(1-profile)*(.7*Math.sin(a+.4+time*.002)+.3*Math.sin(2*a-.8));
    const backgroundWeight=stormBackground(cfg,radius,intensity);
    profile*=1+.06*backgroundWeight*(1-profile);
    profile=configured('wind.profile',()=>profile,{profile,radius,intensity,rmw,eyeRadius,stormRadius,influenceRadius,eyeDevelopment,time});
    let ve=0,vn=0;
    if(radius>1e-8){const inflow=15*RAD;ve=(north*Math.cos(inflow)+east*Math.sin(inflow))/radius*intensity*profile;vn=(-east*Math.cos(inflow)+north*Math.sin(inflow))/radius*intensity*profile;}
    const translation=.65*motionSpeed*profile;ve+=Math.sin(heading*RAD)*translation;vn+=Math.cos(heading*RAD)*translation;
    const sustained=Math.hypot(ve,vn),right=(-east)*Math.cos(heading*RAD)-(-north)*Math.sin(heading*RAD);
    return {...cfg,radius,q,profile,backgroundWeight,sustained,meanMs:sustained*KT,ve,vn,
      semicircle:motionSpeed<.05||radius<.1?'none':right>=0?'danger':'safe',
      region:radius>=influenceRadius?'clear':hasEye&&eyeDevelopment>0&&radius<eyeRadius?'eye':hasEye&&eyeDevelopment>0&&radius<=cfg.wallRadius?'wall':hasStorm&&radius<=stormRadius?'storm':!hasStorm&&radius<=bandRadius?'core':'outer'};
  }
  function dropFall(diameter){
    // Atlas et al. (1973), D in mm. Smooth small-drop approximation below 0.6 mm.
    return diameter>=.6?9.65-10.3*Math.exp(-.6*diameter):(9.65-10.3*Math.exp(-.36))*Math.pow(Math.max(0,diameter)/.6,1.15);
  }
  function rainOptics(kt,rain){
    const rate=Math.max(0,rain),mistMix=configured('rain.mistTransition',()=>smooth(45,135,kt),{kt,rain});
    // Physical spectrum is not forcibly shrunk by ground-relative horizontal wind.
    // The broad 45–135 kt particle refinement is a separate display transformation.
    const diameter=configured('rain.effectiveDiameter',()=>(.85+.40*Math.log1p(Math.max(0,rain)/10)),{kt,rain:rate,mistMix});
    let flux=0,area=0,volume=0,number=0;
    for(let i=0;i<16;i++){
      const x=.125+i*.25,d=Math.max(.01,diameter*x),m=d/1000,weight=x*x*Math.exp(-3*x),v=dropFall(d);
      flux+=weight*Math.PI/6*m*m*m*v;area+=weight*Math.PI/2*m*m;volume+=weight*Math.PI/6*m*m*m;number+=weight;
    }
    const concentration=rate/3600000/Math.max(1e-14,flux),extinction=concentration*area;
    return{mistMix,diameter,extinction,numberDensity:concentration*number,liquidWater:concentration*volume*1e6,fallSpeed:flux/Math.max(1e-14,volume)};
  }
  function visuals(kt,rain){
    const severe=clamp((kt-35)/145,0,1.17),optics=rainOptics(kt,rain),mistMix=optics.mistMix,curtain=smooth(15,100,rain);
    const rainSpeed=1+mistMix*smooth(90,200,kt);
    return {debrisCount:kt<95?0:Math.min(113,Math.round(280/3*Math.pow(severe,2.25))),debrisScale:.38+3.2*Math.pow(clamp((kt-45)/135,0,1.3),1.65),mistMix,
      rainSpeed,rainFall:optics.fallSpeed*(3.6-2.85*mistMix)*rainSpeed,rainDensity:1+2.4*Math.pow(mistMix,1.15),dropDiameter:optics.diameter*(1-.83*mistMix),
      rainTrail:.003+.062*(1-mistMix)+.003*smooth(115,200,kt),rainTrailMinLength:.6*optics.fallSpeed*3.6*.065*smooth(135,200,kt),curtainFall:optics.fallSpeed*(.48-.20*mistMix),curtainDrift:.48+.45*mistMix,
      treeBend:.16*smooth(15,100,kt)+1.12*Math.pow(smooth(100,185,kt),.8),mistOpacity:clamp(.65*curtain+.65*mistMix*smooth(1,30,rain),0,1)};
  }
  function rainExtinction(rain,mist=0,dropExtinction=0,kt=0){
    // Scenario calibration: weak winds leave rain visibility unchanged; strong
    // winds add spray/haze. A logarithmic tail softens growth above 155 kt,
    // preserving value/slope at the join; 65 mm/h -> about 250 m at 200 kt.
    const windU=Math.min(kt,155),windAmplitude=1.142314,windPower=4.599372;
    const windSlope=windAmplitude*windPower/50*Math.pow(35/50,windPower-1);
    const windTail=6*Math.log1p(Math.max(0,kt-155)/6);
    const windGain=1+windAmplitude*Math.pow(Math.max(0,(windU-120)/50),windPower)+windSlope*windTail;
    return configured('weather.rainExtinction',()=>(Math.log(20)/350-Math.log(20)/11000)*Math.pow(Math.max(0,rain)/75,.85)*windGain,{rain,mist,dropExtinction,kt,windGain});
  }
  function visibility(weather){
    const {rain,gust,intensity,sustained,radius}=weather,ms=gust*KT,optics=rainOptics(gust,rain),mist=optics.mistMix;
    const extinction=rainExtinction(rain,mist,optics.extinction,gust);
    return configured('weather.visibility',()=>clamp(Math.log(20)/(Math.log(20)/11000+extinction),55,11000),{rain,ms,mist,gust,intensity,sustained,radius,extinction});
  }
  function debrisMotion(kt,kind){
    const heavy=kind>.8,medium=kind>.46&&!heavy,threshold=heavy?155:medium?137:95,lift=smooth(threshold,heavy?210:medium?190:160,kt);
    return {active:kt>=threshold,speed:heavy?.22+.34*lift:medium?.48+.30*lift:.78+.18*lift,height:heavy?.4+18*lift:medium?1+37*lift:3+66*lift,
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
    // Add a cubic excess-wind rate instead of retaining a minutes-long floor.
    // At threshold +20 kt even the strongest default prop (resistance 1.6)
    // completes within 48 simulated seconds; the rate vanishes at threshold.
    const baseRate=1/Math.max(cfg.minimum,cfg.budget/(load*load));
    const excessRate=Math.pow((kt-cfg.threshold)/20,3)/30;
    return resistance/(baseRate+excessRate);
  }
  function advanceDamage(damage,kind,kt,simDt,resistance=1){return clamp(damage+Math.max(0,simDt)/survivalTime(kind,kt,resistance),0,1);}
  function debrisSupply(ve,vn){const ms=Math.hypot(ve,vn);return .7*(1-.78*smooth(.05,.65,ms>0?-ve/ms:0));}
  // Surface wind drift: larger pieces accelerate more slowly and need deeper water.
  function floatingMotion(kt,volume,depth){
    const bulk=Math.cbrt(Math.max(.001,volume)),draft=.035+.13*bulk;
    const afloat=depth>draft,shallow=smooth(draft,draft+.3,depth);
    return{afloat,draft,speed:afloat?Math.max(0,kt)*KT*(.018+.047/(1+bulk*2.8))*(.25+.75*shallow):0,response:1.2+bulk*5};
  }
  function sample(east,north,intensity=110,options=28,time=0,fluctuations=null){
    intensity=strength(intensity);
    const field=meanWind(east,north,intensity,options,time);
    const {eyeRadius,wallRadius,influenceRadius,bandRadius,radius,hasEye,eyeDevelopment,eyeClearing,sustained}=field;
    const outerMix=smooth(bandRadius,influenceRadius,radius),inward=1-outerMix;
    const rainEdge=1-smooth(influenceRadius*.94,influenceRadius,radius);
    const rainOccurrence=smooth(0,.18,inward);
    const pulse=squall(time,5,inward),rainPulse=clamp(.72*squall(time-.65,5,inward,rainOccurrence)+.38*squall(time+1.4,47,inward,rainOccurrence),0,1);
    const wallWeight=eyeDevelopment*(1-smooth(eyeRadius+(wallRadius-eyeRadius)*.84,wallRadius,radius));
    const coreWeight=1-smooth(bandRadius,bandRadius+(influenceRadius-bandRadius)*.38,radius);
    const stormWeight=field.hasStorm?coreWeight*(1-wallWeight)*smooth(34,67,intensity):0;
    const gustFactor=Math.exp((1-stormWeight)*Math.log(fluctuations?.gust??1)+stormWeight*Math.log(fluctuations?.stormGust??fluctuations?.gust??1));
    const gust=sustained*gustFactor,angle=Math.log(gustFactor)*.8*outerMix;
    const cv=Math.cos(angle),sv=Math.sin(angle),ve=(field.ve*cv-field.vn*sv)*gustFactor*KT,vn=(field.ve*sv+field.vn*cv)*gustFactor*KT;
    const rainFactor=field.rainStrength/100,scale=rainFactor;
    const outerScale=(.9+.1*smooth(20,140,intensity))*(.85+.15*rainFactor);
    let rain;
    if(radius<=bandRadius){
      // Nearly level storm-circle rain; a narrow outer eyewall ramp leads to an inner plateau.
      // Without an eye, use a stronger, broad inward rain gradient instead.
      const broadRain=26+34*(1-smooth(0,bandRadius,radius));
      const stormRain=26+6*eyeDevelopment+2*(1-smooth(wallRadius,bandRadius,radius));
      const wallRamp=1-smooth(eyeRadius+(wallRadius-eyeRadius)*.84,wallRadius,radius);
      const developedRain=stormRain+(72-stormRain)*wallRamp;
      // Rain begins as the feathered inner cloud-wall footprint passes overhead.
      // Weak/developing eyes retain a wider, wetter inner transition.
      const sharpEye=smooth(100,150,intensity),rainStart=eyeRadius*(.25+.735*sharpEye);
      const rainEnd=eyeRadius+clamp((wallRadius-eyeRadius)*(.18-.171*sharpEye),.12,3);
      const eyeDrying=eyeClearing*(1-smooth(rainStart,rainEnd,radius));
      rain=(broadRain+(developedRain-broadRain)*eyeDevelopment)*(1-eyeDrying)*scale;
    }
    else{
      const mix=smooth(bandRadius,bandRadius+(influenceRadius-bandRadius)*.38,radius);
      const rare=hash(Math.floor(time/18.7)+307)<.045+.09*inward?1:0;
      const shower=(75*Math.pow(rainPulse,1.25)+190*rare*Math.pow(rainPulse,2.4))*smooth(.02,.08,rainPulse);
      rain=((1-mix)*(26+6*eyeDevelopment*eyeDevelopment)*scale+mix*shower*outerScale)*rainEdge;
    }
    rain+=3*field.backgroundWeight*(1-wallWeight)*scale;
    const eyeSun=configured('weather.eyeSun',()=>hasEye?smooth(145,180,intensity)*(1-smooth(eyeRadius*.35,eyeRadius*.88,radius)):0,{hasEye,intensity,eyeRadius,radius});
    const breakMix=smooth(bandRadius,bandRadius+(influenceRadius-bandRadius)*.38,radius),dryBreak=(1-smooth(.02,.18,rainPulse))*breakMix;
    let sunshine=clamp(eyeSun+dryBreak*.82*(1-rainEdge*.15)+.90*(1-rainEdge),0,1);
    rain*=1-sunshine;
    rain=configured('weather.rain',()=>rain*.90,{rain,intensity,sustained,radius,eyeRadius,wallRadius,bandRadius,rainFactor,rainPulse,sunshine,time});
    const meanRain=rain;
    const rainRatio=Math.exp(coreWeight*((1-wallWeight)*Math.log(fluctuations?.stormRain??1)+wallWeight*Math.log(fluctuations?.wallRain??1)));
    rain*=rainRatio;
    // Cloud events are broader and more frequent than rain, with an advance cloud shoulder.
    const futurePulse=offset=>clamp(.72*squall(time+offset-.65,5,inward,rainOccurrence)+.38*squall(time+offset+1.4,47,inward,rainOccurrence),0,1);
    const advanceCloud=smooth(0,.015,Math.max(rainPulse,futurePulse(.35),futurePulse(.7)));
    const dryCloud=smooth(.015,.12,squall(time,119,inward,.45+.55*inward));
    const eyeCloud=hasEye&&radius<eyeRadius?(1-eyeClearing*(1-smooth(eyeRadius*.25,eyeRadius,radius))):1;
    const cloudEdge=1-smooth(influenceRadius,influenceRadius+30,radius);
    const cloudCore=1-smooth(bandRadius+(influenceRadius-bandRadius)*.38,bandRadius+(influenceRadius-bandRadius)*.62,radius);
    const cloudCover=rain>0?1:clamp(Math.max(cloudCore*eyeCloud,advanceCloud*cloudEdge*breakMix,dryCloud*cloudEdge*breakMix),0,1);
    sunshine=Math.min(sunshine,1-cloudCover);
    const ms=Math.hypot(ve,vn),viewVisibility=visibility({rain,gust,intensity,sustained,radius});
    // MOR uses 5% transmission (ln(20)/beta), not a ground-wind-squared penalty.
    return {...field,ms,ve,vn,gust,gustRatio:gustFactor,rain,meanRain,rainRatio,wallWeight,stormWeight,visibility:viewVisibility,bearing:ms<.5?null:(Math.atan2(-ve,-vn)/RAD+360)%360,pulse,rainPulse,outerMix,inward,sunshine,cloudCover,rainEventChance:(.24+.74*inward)*rainOccurrence,gustEventChance:.24+.74*inward,surge:surge(sustained)};
  }
  const api={sample,meanWind,structure,visuals,weatherVisuals,gustResponse,advanceGustVisualRise,createVariability,visibility,rainOptics,rainExtinction,dropFall,debrisMotion,debrisSupply,floatingMotion,surge,surgeResponse,advanceSurge,survivalTime,advanceDamage,damageKinds,squall,clamp,smooth,KT,coastProfile,coastTerraces,coastalHeight,waterEdge,floodDepth};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.StormModel=api;
})(typeof window!=='undefined'?window:globalThis);
