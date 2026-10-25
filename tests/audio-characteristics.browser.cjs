/* Render the production Web Audio graph, then measure the actual PCM at each threshold. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'tmp','audio-validation');
fs.mkdirSync(folder,{recursive:true});
const baseline=process.argv.includes('--baseline');
function wav(samples,rate){
 const bytes=Buffer.alloc(44+samples.length*2);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples.length*2,40);
 for(let i=0;i<samples.length;i++)bytes.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),44+i*2);return bytes;
}
function writeReport(report){
 const n=x=>x.toFixed(1),db=x=>x<-100?'静音':n(x),rows=report.rain.map(r=>`<tr><td>${r.rain}</td><td>${db(r.rainDb)}</td><td>${db(r.rainPeakDbFS)}</td><td>${r.events.length?n(Math.min(...r.events.map(e=>e.variationDb)))+"～"+n(Math.max(...r.events.map(e=>e.variationDb))):"—"}</td><td>${r.dropCount}</td></tr>`).join('');
 const windRows=report.wind.map(r=>`<tr><td>${r.kt}</td><td>${db(r.mixDb)}</td><td>${db(r.whistleDb)}</td><td>${r.kt>155?n(r.whistleProminenceDb):'—'}</td><td>${db(r.rumbleDb)}</td></tr>`).join('');
 const gain=report.wind.at(-1).mixDb-report.wind[1].mixDb,wetGain=report.wetWind.at(-1).mixDb-report.wetWind[0].mixDb;
 const events=report.variation[0].whistles,swings=events.map(e=>e.swingDb),eventLevels=events.map(e=>e.rmsDb);
 const sections=`<h1>风雨声音：节点测试与试听</h1><p>原生 Web Audio 渲染生产声音引擎，测量实际 PCM 的能量、频谱及峰值。采样率 24 kHz，默认主音量 50%；所有试听保持相同增益，没有逐片段归一化。</p>
 <p>结果：连续增雨约在 ${n(report.onset[0].events[0].rain)} mm/h 出现第一滴微弱雨声；150→250 kt 的纯风场输出增加 ${n(gain)} dB，65 mm/h 混合风雨增加 ${n(wetGain)} dB。阈值衔接、雨声音色、随机尖啸和最大音量峰值检查通过。</p>
 <h2>弱雨起步试听</h2><p>20 秒内从 0 增至 2 mm/h，保留泊松随机间隔与远近音量差异。</p><audio controls preload="metadata" src="light-rain-onset.wav"></audio><h2>连续增雨试听</h2><p>40 秒内从 0 连续增加至 40 mm/h；7 秒开始交叉，24 秒完全进入持续雨声。</p><audio controls preload="metadata" src="rain-ramp.wav"></audio>
 <h2>分档雨声</h2><p>每档 4 秒，依次为 ${report.rain.map(r=>r.rain).join('、')} mm/h。</p><audio controls preload="metadata" src="rain-nodes.wav"></audio>
 <h2>分档风声</h2><p>每档 4 秒，依次为 ${report.wind.map(r=>r.kt).join('、')} kt。155 kt 以上取尖啸发生的代表片段，完整测量包含随机间歇。</p><audio controls preload="metadata" src="wind-nodes.wav"></audio>
 <h2>强降雨中的风速变化</h2><p>雨强固定 65 mm/h，每档 4 秒，风速依次为 150、170、200、250 kt；尖啸档位取发生时段。</p><audio controls preload="metadata" src="wind-and-rain.wav"></audio>
 <h2>雨强节点</h2><p>雨声 RMS 和峰值 dBFS 均为独立雨声在 50% 主音量下的实际 PCM，含共享滤波、未经过末端峰值保护；滴声也经过 dB 增益，每滴增益按平面落点和三维距离计算，约 −24.5 至 +1.5 dB；小音量更常见。事件数统计每档 10 秒。</p><table><tr><th>mm/h</th><th>RMS dBFS</th><th>峰值 dBFS</th><th>随机增益 dB</th><th>滴声事件</th></tr>${rows}</table>
 <h2>尖啸起伏与漏风</h2><p>固定 200 kt、65 mm/h 的连续 70 秒，保留随机事件和间歇。每次基准增益在 −20 至 −10.5 dB 间变化，事件内增益在 −10 至 +2.5 dB 间缓慢起伏，并混合宽带漏风气声。本次 ${events.length} 次完整事件的中央段实际起伏为 ${n(Math.min(...swings))}–${n(Math.max(...swings))} dB，不同次 RMS 相差 ${n(Math.max(...eventLevels)-Math.min(...eventLevels))} dB；不把首尾淡入淡出计作内部波动。</p><audio controls preload="metadata" src="whistle-variation.wav"></audio>
 <h2>实录参考</h2><p>参考了公开预览的频谱和 250 ms RMS 包络；没有进行人工听辨。实录与模拟的录音增益和环境不同，绝对 dBFS 不直接互相标定。</p><ul><li><a href="https://freesound.org/people/kyles/sounds/452531/">kyles：厨房窗缝阵风（CC0）</a>：短时响度 P90−P10 约 20.7 dB；合成采用更克制的起伏。</li><li><a href="https://freesound.org/people/klankbeeld/sounds/262029/">klankbeeld：林地边缘无风细雨（CC BY 4.0）</a>：参考稀疏雨滴与低频环境底声的频谱关系。</li></ul><p>实录只用于分析参考，模拟器仍使用程序合成。详细数据见 <a href="reference-measurements.json">实录测量</a>。</p>
 <h2>风速节点</h2><p>总输出 dBFS 包括风、尖啸和轰鸣，并经过完整混音。谱峰突出度比较尖啸频点与其附近的混音噪声频点，用于检测尖啸是否被掩盖。</p><table><tr><th>kt</th><th>总输出 dBFS</th><th>尖啸声道 dBFS</th><th>谱峰突出 dB</th><th>轰鸣声道 dBFS</th></tr>${windRows}</table>
 <h2>检查范围</h2><p>13 档雨强、9 档风速、4 档风雨混合、7/24 mm/h 两侧、连续增雨、3 组随机尖啸种子，以及 100% 音量极端工况。通过 RMS、频段能量分布、事件计数、谱峰突出度与完整采样峰值验证。</p><p><a href="measurements.json">完整测量 JSON</a> · 运行：node tests/audio-characteristics.browser.cjs</p>`;
 fs.writeFileSync(path.join(folder,'report.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>声音节点测试</title><style>body{font:15px/1.7 system-ui,sans-serif;max-width:960px;margin:36px auto;padding:0 20px;color:#202a30;background:#fafbf9}h1{font-size:27px}h2{font-size:19px;margin-top:32px}audio{width:min(100%,680px)}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:7px 12px;text-align:right;border-bottom:1px solid #d6dcd6}th{background:#edf1eb}a{color:#156045}</style>${sections.replace(/src="([^"]+\.wav)"/g,'src="$1?v=soft-rain-leak-20261025"')}</html>`);
 const rainTable=['| mm/h | 雨声 dBFS | 10秒滴声事件 |','| --- | --- | --- |',...report.rain.map(r=>`| ${r.rain} | ${db(r.rainDb)} | ${r.dropCount} |`)].join('\n');
 fs.writeFileSync(path.join(folder,'report.md'),`# 声音节点验证\n\n原生 Web Audio 渲染生产声音引擎；24 kHz，主音量 50%，各试听片段保持同一增益。\n\n- 连续增雨在约 ${n(report.ramp[0].events[0].rain)} mm/h 开始出现微弱滴声。\n- 150→250 kt 总风场输出增加 ${n(gain)} dB，65 mm/h 混合雨声时增加 ${n(wetGain)} dB。\n- 7/24 mm/h 边界、雨声音色频段、尖啸谱峰、轰鸣低频能量与最大音量峰值检查通过。\n\n${rainTable}\n\n试听、风速表及测试条件见同目录 report.html；完整数据见 measurements.json。\n`);
}
async function render(page,cases,duration,name,seedInit=73519){
 return page.evaluate(async({cases,duration,legacy,seedInit})=>{
  const rate=24000,total=duration*cases.length,context=new OfflineAudioContext(6,Math.ceil(total*rate),rate);
  let seed=seedInit;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const weather=c=>({rain:c.ramp?c.rain*(context.currentTime%duration)/duration:c.rain,ms:c.kt*StormModel.KT,sustained:c.sustained??c.kt,gust:c.kt,gustRiseRate:c.gustRiseRate??0,ve:c.kt*StormModel.KT,vn:0});
  let engine,nodes;
  if(legacy){
   const declarations=legacy.slice(legacy.indexOf('  let audioCtx,'),legacy.indexOf('  const view ='));
   const functions=legacy.slice(legacy.indexOf('  function createSound(){'),legacy.indexOf('  function updateReadings()'));
   const math=Object.create(Math);math.random=random;
   const factory=new Function('M','window','Math',declarations+'const clamp=M.clamp;const state={sound:true,paused:false,soundVolume:50};let weather;'+functions+'return{init:()=>{createSound();return{output:soundGain,rain:rainSoundGain,wind:windSoundGain,whistle:whistleGain,rumble:rumbleGain,windWet:distortionGain};},update:w=>{weather=w;updateSound();},diagnostics:()=>({dropCount:0})};');
   const old=factory(StormModel,{AudioContext:function(){return context;}},math);nodes=old.init();engine={update:w=>old.update(w),diagnostics:old.diagnostics};
  }else{engine=WeatherSound.create(context,StormModel,random);nodes=engine.nodes;}
  nodes.output.disconnect();const merger=context.createChannelMerger(6);merger.connect(context.destination);
  for(const [channel,key]of ['output','rain','wind','whistle','rumble','windWet'].entries())nodes[key].connect(merger,0,channel);
  const diagnostics=cases.map(()=>({dropStart:0,dropEnd:0,profile:null,events:[],whistles:[]}));let last=-1;
  function update(){const i=Math.min(cases.length-1,Math.floor(context.currentTime/duration));if(i!==last){diagnostics[i].dropStart=engine.diagnostics().dropCount;last=i;}engine.update(weather(cases[i]),{enabled:true,volume:cases[i].volume??50});const d=engine.diagnostics(),row=diagnostics[i];row.dropEnd=d.dropCount;row.profile=d.profile;if(d.lastDrop&&d.lastDrop.time!==row.events.at(-1)?.time)row.events.push({...d.lastDrop,rain:d.profile.rain});if(d.whistleCount&&d.whistleStart!==row.whistles.at(-1)?.start)row.whistles.push({start:d.whistleStart,end:d.whistleEnd,eventDb:d.whistleEventDb});}
  update();let next=context.suspend(.1);const rendered=context.startRendering();
  for(let t=.1;t<total-.05;t+=.1){await next;update();if(t+.1<total-.05)next=context.suspend(t+.1);await context.resume();}
  const audio=await rendered,channels=Array.from({length:6},(_,i)=>audio.getChannelData(i));
  function power(data,start,end){let sum=0,peak=0;for(let i=start;i<end;i++){sum+=data[i]*data[i];peak=Math.max(peak,Math.abs(data[i]));}return{rms:Math.sqrt(sum/Math.max(1,end-start)),peak};}
  function spectrum(data,offset){
   const n=4096,re=new Float64Array(n),im=new Float64Array(n);
   for(let i=0;i<n;i++)re[i]=(data[offset+i]||0)*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));
   for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
   for(let len=2;len<=n;len*=2){const a=-2*Math.PI/len;for(let i=0;i<n;i+=len)for(let j=0;j<len/2;j++){const r=Math.cos(a*j),s=Math.sin(a*j),u=i+j,v=u+len/2,x=re[v]*r-im[v]*s,y=re[v]*s+im[v]*r;re[v]=re[u]-x;im[v]=im[u]-y;re[u]+=x;im[u]+=y;}}
   return Array.from({length:n/2},(_,i)=>re[i]*re[i]+im[i]*im[i]);
  }
  const db=x=>20*Math.log10(Math.max(1e-12,x));
  const results=cases.map((c,index)=>{
   const start=Math.round((index*duration+1.5)*rate),end=Math.round((index+1)*duration*rate),r=channels.map(data=>power(data,start,end));
   const rainBands=[0,0,0,0,0],best=[];
   for(let offset=start;offset+4096<end;offset+=2048)best.push({offset,energy:power(channels[1],offset,offset+4096).rms});
   best.sort((a,b)=>b.energy-a.energy);
   for(const {offset}of best.slice(0,16)){const bins=spectrum(channels[1],offset);for(let i=1;i<bins.length;i++){const hz=i*rate/4096,band=hz<350?0:hz<1000?1:hz<3000?2:hz<6500?3:4;rainBands[band]+=bins[i];}}
   const sum=rainBands.reduce((a,b)=>a+b,0);for(let i=0;i<rainBands.length;i++)rainBands[i]/=Math.max(1e-30,sum);
   let whistleOffset=start,whistleRms=0;const whistleWindows=[];
   for(let offset=start;offset+4096<end;offset+=2048){const v=power(channels[3],offset,offset+4096).rms;whistleWindows.push({offset,energy:v});if(v>whistleRms){whistleRms=v;whistleOffset=offset;}}
   // Average several strong windows so random wind in one FFT bin cannot mask a persistent tone.
   whistleWindows.sort((a,b)=>b.energy-a.energy);
   const tone=spectrum(channels[3],whistleOffset),mix=new Array(2048).fill(0);
   for(const {offset}of whistleWindows.slice(0,8)){const bins=spectrum(channels[0],offset);for(let i=0;i<mix.length;i++)mix[i]+=bins[i];}
   let peakBin=Math.round(900*4096/rate);
   let rumbleLow=0,rumbleTotal=0;
   for(const {offset}of best.slice(0,16)){const bins=spectrum(channels[4],offset);for(let i=1;i<bins.length;i++){const hz=i*rate/4096;rumbleTotal+=bins[i];if(hz>=28&&hz<=210)rumbleLow+=bins[i];}}
   for(let i=Math.round(700*4096/rate);i<Math.round(2300*4096/rate);i++)if(tone[i]>tone[peakBin])peakBin=i;
   const floor=[];for(let i=peakBin-32;i<=peakBin+32;i++)if(Math.abs(i-peakBin)>5&&i>0&&i<mix.length)floor.push(mix[i]);floor.sort((a,b)=>a-b);
   const tonalProminence=10*Math.log10(Math.max(1e-30,mix[peakBin])/Math.max(1e-30,floor[Math.floor(floor.length/2)]));
   const whistles=diagnostics[index].whistles.filter(e=>e.start>=index*duration&&e.end<=(index+1)*duration).map(e=>{
    const levels=[];for(let t=e.start+1;t+.25<e.end-1;t+=.25)levels.push(db(power(channels[3],Math.floor(t*rate),Math.floor((t+.25)*rate)).rms*.5));
    levels.sort((a,b)=>a-b);return{...e,rmsDb:db(power(channels[3],Math.floor((e.start+1)*rate),Math.floor((e.end-1)*rate)).rms*.5),swingDb:levels[Math.floor(levels.length*.9)]-levels[Math.floor(levels.length*.1)]};
   });
   // Off-harmonic energy in the whistle bus verifies the added broadband breath.
   let breathEnergy=0,toneEnergy=0;for(let i=1;i<tone.length;i++){const hz=i*rate/4096;if(hz<350||hz>6500)continue;toneEnergy+=tone[i];if([1,2,3,4].every(h=>Math.abs(i-peakBin*h)>6))breathEnergy+=tone[i];}
   return{...c,mixDb:db(r[0].rms),rainDb:db(r[1].rms*.5),rainPeakDbFS:db(r[1].peak*.5),windDb:db(r[2].rms*.5),whistleDb:db(r[3].rms*.5),rumbleDb:db(r[4].rms*.5),rumbleLowFraction:rumbleLow/Math.max(1e-30,rumbleTotal),peak:power(channels[0],Math.round(index*duration*rate),end).peak,rainBands,whistles,breathFraction:breathEnergy/Math.max(1e-30,toneEnergy),
    whistlePeakHz:peakBin*rate/4096,whistleTime:whistleOffset/rate,whistleProminenceDb:tonalProminence,dropCount:diagnostics[index].dropEnd-diagnostics[index].dropStart,profile:diagnostics[index].profile,events:diagnostics[index].events};
  });
  // Identical playback gain for every node; no per-clip normalization.
  const float=new Float32Array(cases.reduce((s,c)=>s+(c.previewFull?duration:4)*rate,0));let written=0;
  for(let i=0;i<cases.length;i++){const length=(cases[i].previewFull?duration:4)*rate;
   const time=cases[i].previewFull?i*duration:cases[i].kt>155?Math.max(i*duration+1.5,Math.min((i+1)*duration-4,results[i].whistleTime-1)):(i+1)*duration-4;
   const start=Math.floor(time*rate);float.set(channels[0].subarray(start,start+length),written);written+=length;
  }
  const bytes=new Uint8Array(float.buffer);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return{results,rate,excerpts:btoa(binary)};
 },{cases,duration,seedInit,legacy:baseline?fs.readFileSync(path.join(root,'tmp','audio-before-app.js'),'utf8'):null}).then(data=>{
  const bytes=Buffer.from(data.excerpts,'base64'),samples=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
  fs.writeFileSync(path.join(folder,(baseline?'before-':'')+name+'.wav'),wav(samples,data.rate));delete data.excerpts;return data.results;
 });
}
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage();await page.addScriptTag({content:fs.readFileSync(path.join(root,'src/model.js'),'utf8')});await page.addScriptTag({content:fs.readFileSync(path.join(root,'src/rain-grains.js'),'utf8')});await page.addScriptTag({content:fs.readFileSync(path.join(root,'src/sound.js'),'utf8')});
 const rain=await render(page,[0,.2,.5,1,2,5,7,9,10,15,25,35,65].map(rain=>({rain,kt:0})),10,'rain-nodes');
 const wind=await render(page,[110,150,155,160,170,185,200,220,250].map(kt=>({kt,rain:0})),10,'wind-nodes');
 const wetWind=await render(page,[150,170,200,250].map(kt=>({kt,rain:65})),10,'wind-and-rain');
 const boundaries=[];if(!baseline)for(const rain of [6.5,6.9,7,7.1,7.5,23.5,23.9,24,24.1,24.5])boundaries.push(...await render(page,[{rain,kt:0}],20,'rain-boundary-'+rain));
 const ramp=baseline?[]:await render(page,[{rain:40,kt:0,ramp:true,previewFull:true}],40,'rain-ramp');
 const onset=baseline?[]:await render(page,[{rain:2,kt:0,ramp:true,previewFull:true}],20,'light-rain-onset');
 const stress=baseline?[]:await render(page,[{rain:200,kt:300,volume:100},{rain:65,kt:250,volume:100}],10,'maximum-volume');
 const randomWhistles=[];
 if(!baseline)for(const seed of [2,17,853])randomWhistles.push({seed,results:await render(page,[170,200,250].map(kt=>({kt,rain:65})),12,'random-whistles-'+seed,seed)});
 const variation=baseline?[]:await render(page,[{rain:65,kt:200,previewFull:true}],70,'whistle-variation');
 const crestReference=baseline?[]:await render(page,[{rain:65,kt:200}],12,'gust-reference',17);
 const crest=baseline?[]:await render(page,[{rain:65,kt:200,sustained:160}],12,'gust-crest',17);
 const crestStress=baseline?[]:await render(page,[{rain:200,kt:300,sustained:240,volume:100}],12,'gust-crest-maximum',17);
 const crestRise=baseline?[]:await render(page,[{rain:65,kt:200,sustained:160,gustRiseRate:4.8}],12,'gust-rising',17);
 const riseStress=baseline?[]:await render(page,[{rain:200,kt:300,sustained:240,gustRiseRate:7.2,volume:100}],12,'gust-rising-maximum',17);
 const report={baseline,rain,wind,wetWind,boundaries,ramp,onset,stress,randomWhistles,variation,crestReference,crest,crestStress,crestRise,riseStress};fs.writeFileSync(path.join(folder,baseline?'before.json':'measurements.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({rain:rain.map(r=>({mm:r.rain,db:r.rainDb,drops:r.dropCount})),wind:wind.map(r=>({kt:r.kt,db:r.mixDb,tone:r.whistleDb,prominence:r.whistleProminenceDb})),wetWind:wetWind.map(r=>({kt:r.kt,db:r.mixDb,peak:r.peak}))},null,2));
 if(!baseline){
  assert(rain[0].rainDb<-100,'no rain must be silent');
  for(let i=1;i<rain.length;i++){assert(rain[i].rainDb>rain[i-1].rainDb+.5,'rain loudness grows through every node');if(rain[i].rain<10)assert(rain[i].dropCount>0,'light rain must occur before 7 mm/h');}
  const drops=rain.flatMap(r=>r.events).filter(e=>e.variationDb!==undefined);
  assert(drops.length>50,'measure accepted grain events');
  for(const e of drops){assert(e.variationDb<=1.5&&e.variationDb>=-24.54,'disk/3D attenuation range');assert(Math.abs(e.distance-Math.hypot(e.x,e.y,1.2))<1e-8,'3D propagation distance');assert(e.playback>=.72&&e.playback<=1.32,'accepted random grain duration');}
  assert(drops.filter(e=>e.variationDb<-18).length/drops.length>.65,'distant quiet drops must predominate');
  assert(rain[5].dropCount>100,'5 mm/h uses the accepted higher event density');
  assert(rain[10].profile.continuous===1&&rain[10].dropCount===0,'24 mm/h completes the earlier crossover');
  assert(rain[3].rainDb<-47&&rain[5].rainDb<-32,'weak drops retain distance falloff and slow growth');
  assert(wind[8].mixDb-wind[1].mixDb>7,'extreme wind must be audibly stronger than 150 kt');
  for(const r of wind.filter(r=>r.kt>=170))assert(r.whistleProminenceDb>10&&r.whistleDb>-45,'whistle must survive in the rendered mix');
  for(const r of wetWind.filter(r=>r.kt>=170))assert(r.whistleProminenceDb>10,'whistle must survive even with heavy rain');
  for(const group of randomWhistles)for(const r of group.results)assert(r.whistleProminenceDb>6,'random whistle must remain distinguishable under different seeds and heavy rain');
  for(let i=1;i<boundaries.length;i++)if(boundaries[i].rain-boundaries[i-1].rain<1)assert(Math.abs(boundaries[i].rainDb-boundaries[i-1].rainDb)<1.5,'no loudness step at the 7/24 mm/h boundaries');
  for(let i=1;i<boundaries.length;i++)if(boundaries[i].rain-boundaries[i-1].rain<1)assert(boundaries[i].rainBands.reduce((sum,v,k)=>sum+Math.abs(v-boundaries[i-1].rainBands[k]),0)<.18,'shared rain filter must not cause a colour jump at crossover');
  const events=variation[0].whistles;assert(events.length>=5,'render enough complete random whistle events');
  assert(Math.max(...events.map(e=>e.eventDb))-Math.min(...events.map(e=>e.eventDb))>6,'different whistle events must have a broad gain range');
  assert(Math.max(...events.map(e=>e.rmsDb))-Math.min(...events.map(e=>e.rmsDb))>5,'event loudness differences must reach the actual PCM');
  assert(events.filter(e=>e.swingDb>3).length>=events.length*.7,'most whistle events must fluctuate internally beyond fades');
  assert(variation[0].breathFraction>.005,'whistle bus must contain measurable off-harmonic leak noise');
  assert(onset[0].events.some(e=>e.rain<1),'a slow continuous onset must produce accepted grains below 1 mm/h');
  assert(wind.filter(r=>r.kt<=155).every(r=>r.whistleDb<-90&&r.rumbleDb<-90),'extreme channels start from silence');
  for(let i=4;i<wind.length;i++)assert(wind[i].rumbleDb>wind[i-1].rumbleDb,'rumble grows across the extreme-wind nodes');
  for(const r of wind.filter(r=>r.kt>=170))assert(r.rumbleLowFraction>.65,'rumble must actually concentrate energy in the low-frequency band');
  assert(wetWind[3].mixDb-wetWind[0].mixDb>3,'high wind boost must also survive with heavy rain');
  assert(crest[0].whistleDb-crestReference[0].whistleDb>11.8,'a gust crest adds the further strengthened whistle to real PCM');
  assert(crest[0].profile.speed>crestReference[0].profile.speed,'rain sound uses crest-accelerated world rain speed');
  assert(crestRise[0].whistleDb>crest[0].whistleDb+3,'rising gust makes the rendered whistle louder at the same wind speed');
  assert(Math.abs(crestRise[0].whistlePeakHz-crest[0].whistlePeakHz)<12,'at equal instantaneous wind, rising and steady gusts have the same rendered whistle pitch');
  assert(wind[5].whistlePeakHz>wind[3].whistlePeakHz,'whistle pitch rises with instantaneous wind speed');
  assert([...rain,...wind,...wetWind,...boundaries,...ramp,...stress,...variation,...crest,...crestStress,...crestRise,...riseStress].every(r=>r.peak<=1),'output must not clip, including maximum volume and rising gust boosts');
  console.log('PASS measured PCM: accepted 01 grains/spatial volume, onset/density/crossfade, wind growth, whistle swells/event contrast/breath and output peaks');
  writeReport(report);
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
