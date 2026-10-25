/* Shared rain grains, continuous weather sound and independently mixed wind tones. */
const WeatherSound=(()=>{
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const fromDb=db=>Math.pow(10,db/20);
  function profile(weather,M){
    const kt=Math.max(0,weather.gust??weather.ms/M.KT),rain=Math.max(0,weather.rain);
    const visual=M.weatherVisuals(weather),gust=M.gustResponse(weather);
    const speed=Math.hypot(weather.ms*visual.rainSpeed,visual.rainFall),calm=M.visuals(0,rain).rainFall;
    const rainLevel=.25*Math.pow(rain/10,rain<10?1.05:.72);
    return{kt,rain,speed,rainLevel,gustBurst:gust.burst,gustRise:gust.rise,whistleBoost:(1+3*gust.burst)*(1+.75*gust.rise),whistleFrequency:1.05*clamp(900+8*(kt-155),900,2300),
      dropLevel:rainLevel*Math.pow(Math.max(1,(1+rain/3)/(1+1/3)),-.3),
      dropTrimDb:0,rainLowpass:6500,rainHighpass:350,
      flightGain:1.55+.45*Math.log1p(Math.max(0,speed/Math.max(.1,calm)-1)),
      continuous:M.smooth(7,24,rain),baseDropRate:10*Math.pow(rain/10,.8),dropRate:25*Math.pow(rain/10,.8),
      windLevel:1.7*Math.pow(kt/110,.9)*(1+2.3*Math.pow(clamp((kt-150)/100,0,1.7),1.25)),
      whistle:1-Math.exp(-Math.max(0,kt-155)/18),
      rumble:M.smooth(155,235,kt),distortion:M.smooth(190,250,kt)};
  }
  function create(context,M,random=Math.random){
    const gain=(value=0)=>{const node=context.createGain();node.gain.value=value;return node;};
    const filter=(type,hz)=>{const node=context.createBiquadFilter();node.type=type;node.frequency.value=hz;return node;};
    const noise=brownNoise=>{
      const buffer=context.createBuffer(1,context.sampleRate*7,context.sampleRate),data=buffer.getChannelData(0);let brown=0;
      for(let i=0;i<data.length;i++){const white=random()*2-1;brown=(brown+.022*white)/1.023;data[i]=brownNoise?brown*3+white*.08:white;}
      const source=context.createBufferSource();source.buffer=buffer;source.loop=true;return source;
    };
    const shape=drive=>{
      const node=context.createWaveShaper(),curve=new Float32Array(4096);
      for(let i=0;i<curve.length;i++){const x=i/(curve.length-1)*2-1;curve[i]=Math.tanh(drive*x)/Math.tanh(drive);}
      node.curve=curve;node.oversample='2x';return node;
    };
    const master=gain(),softOutput=context.createWaveShaper(),output=context.createWaveShaper(),headroom=gain(.25),safety=new Float32Array(8193);
    // A memoryless peak guard has no gain detector that could duck rain when wind rises.
    for(let i=0;i<safety.length;i++){const x=(i/(safety.length-1)*2-1)*4;safety[i]=.78*x/Math.pow(1+x**4,.25);}
    softOutput.curve=safety;softOutput.oversample='2x';
    // Catch oversampling-filter reconstruction overshoot without a shared gain envelope.
    const peakGuard=new Float32Array(8193);
    for(let i=0;i<peakGuard.length;i++){const x=i/(peakGuard.length-1)*2-1,a=Math.abs(x);peakGuard[i]=Math.sign(x)*(a<=.9?a:.9+.08*Math.tanh((a-.9)/.08));}
    output.curve=peakGuard;master.connect(headroom).connect(softOutput).connect(output).connect(context.destination);
    const windNoise=noise(true),whiteNoise=noise(false),wind=gain(),windLow=filter('lowpass',1100);
    windNoise.connect(windLow).connect(wind).connect(master);
    const rain=gain(),continuous=gain(),grains=gain(1),rainHigh=filter('highpass',350),rainLow=filter('lowpass',6500);
    // Accepted grains already include their crop envelope and rain filtering.
    whiteNoise.connect(continuous).connect(rainHigh);grains.connect(rain);
    rainHigh.connect(rainLow).connect(rain).connect(master);
    const encoded=atob(AcceptedRainGrains.pcm16),grainBank=[];
    for(let k=0;k<AcceptedRainGrains.count;k++){
      const buffer=context.createBuffer(1,AcceptedRainGrains.frames,AcceptedRainGrains.sampleRate),data=buffer.getChannelData(0);let energy=0;
      for(let i=0;i<data.length;i++){const offset=(k*data.length+i)*2,value=encoded.charCodeAt(offset)|(encoded.charCodeAt(offset+1)<<8);data[i]=(value>=32768?value-65536:value)/32768;energy+=data[i]*data[i]/buffer.sampleRate;}
      grainBank.push({buffer,energy});
    }
    const whistleOsc=context.createOscillator(),whistle=gain(),whistleSwell=gain(1),whistleBand=filter('bandpass',1300),whistleAir=gain(.55);
    whistleBand.Q.value=10;whistleOsc.connect(whistleSwell).connect(whistle).connect(master);
    whiteNoise.connect(whistleBand).connect(whistleAir).connect(whistleSwell);
    const leakBand=filter('bandpass',1600),leak=gain();
    whiteNoise.connect(leakBand).connect(leak).connect(whistleSwell);leakBand.Q.value=1;
    const windDrive=shape(2.2),windWet=gain();wind.connect(windDrive).connect(windWet).connect(master);
    const rumble=gain(),rumbleLow=filter('lowpass',210),rumbleHigh=filter('highpass',28),rumbleDrive=shape(5.5),rumbleWet=gain();
    windNoise.connect(rumbleHigh).connect(rumbleLow).connect(rumble).connect(master);
    rumbleLow.connect(rumbleDrive).connect(rumbleWet).connect(rumble);
    windNoise.start();whiteNoise.start();whistleOsc.start();
    const nextDrop=()=>-Math.log(Math.max(1e-12,1-random()));
    let scheduledUntil=context.currentTime,phase=0,threshold=nextDrop(),dropCount=0,lastDrop=null;
    let whistleStart=0,whistleEnd=0,nextWhistle=context.currentTime+.5+random(),whistleLevel=0,whistleCount=0;
    let swellAt=0,whistleSwellDb=0,whistleEventDb=0,leakTarget=0;
    let gustWhistleArmed=true;
    let nextDistortion=context.currentTime+4+random()*7,distortionEnd=0,distortionLevel=0,lastProfile=null,masterTarget=0;
    const target=(param,value,now,time)=>param.setTargetAtTime(value,now,time);
    function update(weather,{enabled=false,paused=false,volume=50}={}){
      const now=context.currentTime,active=enabled&&!paused,p=profile(weather,M);lastProfile=p;
      masterTarget=active?clamp(volume,0,100)/100:0;target(master.gain,masterTarget,now,.08);
      target(wind.gain,p.windLevel,now,.25);target(windLow.frequency,650+Math.min(p.kt,300)*8,now,.4);
      target(rain.gain,p.flightGain,now,.22);
      target(rainHigh.frequency,p.rainHighpass,now,.18);target(rainLow.frequency,p.rainLowpass,now,.18);
      // A dB trim applies to every drop; energy normalization cannot bypass this fader.
      target(grains.gain,fromDb(p.dropTrimDb),now,.16);
      // Spatial falloff intentionally makes sparse grains quieter than the continuous bed.
      target(continuous.gain,p.rainLevel*Math.sqrt(p.continuous),now,.16);
      if(active&&p.rain>0&&p.continuous<1){
        let cursor=Math.max(now,scheduledUntil),remaining=now+.18-cursor,scheduled=0;
        while(remaining>0){
          const wait=(threshold-phase)/Math.max(1e-9,p.dropRate);
          if(wait>remaining){phase+=p.dropRate*remaining;break;}
          cursor+=wait;remaining-=wait;phase=0;threshold=nextDrop();scheduled++;
          const item=grainBank[Math.floor(random()*grainBank.length)],playback=.72+random()*.6;
          // Uniform disk area: r=R*sqrt(U); spherical pressure falls as 1/d.
          const radius=24*Math.sqrt(random()),angle=2*Math.PI*random(),distance=Math.hypot(radius,1.2);
          const variationDb=1.5+20*Math.log10(1.2/distance),source=context.createBufferSource(),envelope=gain();
          source.buffer=item.buffer;source.playbackRate.value=playback;
          const amplitude=p.dropLevel*.6*Math.sqrt(1-p.continuous)/Math.sqrt(Math.max(1e-9,p.baseDropRate));
          const peak=amplitude*fromDb(variationDb)*Math.sqrt(playback/item.energy);
          envelope.gain.value=peak;
          source.connect(envelope).connect(grains);source.onended=()=>{source.disconnect();envelope.disconnect();};
          source.start(cursor);
          dropCount++;lastDrop={time:cursor,peak,playback,variationDb,distance,x:radius*Math.cos(angle),y:radius*Math.sin(angle),duration:item.buffer.duration/playback,trimDb:p.dropTrimDb};
        }
        scheduledUntil=now+.18;
      }else{scheduledUntil=now;phase=0;}
      if(p.gustBurst<.08)gustWhistleArmed=true;
      const gustWhistle=p.gustBurst>.2&&gustWhistleArmed;
      if(active&&p.whistle>0&&gustWhistle)gustWhistleArmed=false;
      if(active&&p.whistle>0&&now>=whistleEnd&&(now>=nextWhistle||gustWhistle)){
        whistleStart=now;whistleEnd=now+4+random()*6;nextWhistle=whistleEnd+1+random()*3;
        whistleEventDb=-20+random()*9.5;whistleLevel=fromDb(whistleEventDb);swellAt=now;whistleCount++;
        const real=new Float32Array(5),imag=new Float32Array([0,1,.02+random()*.12,random()*.07,random()*.025]);
        whistleOsc.setPeriodicWave(context.createPeriodicWave(real,imag));whistleBand.Q.value=6+random()*8;
      }
      if(active&&now<whistleEnd){
        target(whistleOsc.frequency,p.whistleFrequency,now,.12);target(whistleBand.frequency,p.whistleFrequency,now,.12);
        target(leakBand.frequency,p.whistleFrequency,now,.18);
      }
      if(active&&now<whistleEnd&&now>=swellAt){
        whistleSwellDb=-10+random()*12.5;
        target(whistleSwell.gain,fromDb(whistleSwellDb),now,.12+random()*.18);
        leakTarget=.15+random()*1.25;target(leak.gain,leakTarget,now,.2);
        target(whistleAir.gain,.35+random()*.85,now,.2);target(leakBand.Q,.7+random()*1.5,now,.35);
        swellAt=now+.35+random()*1.05;
      }
      const whistleEnvelope=M.smooth(whistleStart,whistleStart+.7,now)*(1-M.smooth(whistleEnd-.9,whistleEnd,now));
      target(whistle.gain,active&&now<whistleEnd?whistleLevel*p.whistle*p.whistleBoost*(1+.8*clamp((p.kt-190)/60,0,1))*whistleEnvelope:0,now,.1);
      if(active&&p.distortion>0&&now>=nextDistortion){distortionEnd=now+.3+random()*.9;nextDistortion=distortionEnd+4+random()*10;distortionLevel=.035+random()*.085;}
      target(windWet.gain,active&&now<distortionEnd?distortionLevel*p.distortion:0,now,.15);
      target(rumble.gain,.8*p.rumble,now,.45);target(rumbleWet.gain,.7*p.rumble,now,.5);
    }
    return{update,nodes:{master,output,rain,continuous,grains,wind,whistle,rumble,rumbleWet,windWet},
      diagnostics:()=>({profile:lastProfile,dropCount,lastDrop,whistleCount,whistleStart,whistleEnd,whistleFrequency:whistleOsc.frequency.value,
        whistleEventDb,whistleSwellDb,leak:leak.gain.value,dropTrimDb:lastProfile?.dropTrimDb,
        master:master.gain.value,masterTarget,continuous:continuous.gain.value,wind:wind.gain.value,whistle:whistle.gain.value,rumble:rumble.gain.value,rumbleWet:rumbleWet.gain.value})};
  }
  return{create,profile};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WeatherSound;
