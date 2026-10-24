/* Non-destructive, replayable guide: reveal real controls without changing weather. */
const UsageGuide=(()=>{
 function bind(){
  const $=id=>document.getElementById(id),workspace=document.querySelector('.workspace'),sidebar=$('settingsPanel'),toggle=$('settingsToggle'),dialog=$('usageGuide');
  const mobile=()=>matchMedia('(pointer:coarse)').matches||innerWidth<=1000;
  const setSidebar=open=>{workspace.classList.toggle('sidebar-collapsed',!open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'收起设置':'展开设置');toggle.querySelector('span').textContent='设置';};
  toggle.onclick=()=>setSidebar(workspace.classList.contains('sidebar-collapsed'));
  // Older browsers without native named-details grouping still keep one category open.
  const groups=[...sidebar.querySelectorAll('.control-group')];
  groups.forEach(group=>group.addEventListener('toggle',()=>{if(group.open)groups.forEach(other=>{if(other!==group)other.open=false;});}));
  groups.forEach(group=>group.querySelector('summary').addEventListener('click',()=>{
   if(group.open)return;
   requestAnimationFrame(()=>{
    if(!group.open)return;
    const behavior=matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth';
    sidebar.scrollTo({top:0,behavior});
    if(mobile())sidebar.scrollIntoView({block:'start',behavior});
   });
  }));
  const steps=[
   {title:'观察与环视',target:'#view',text:()=>mobile()?'在视窗内单指拖动环视，双指捏合缩放。下方是观测点的风雨读数；页面下方“设置”展开参数。':'在视窗内按住鼠标拖动，或点击视窗后按方向键环视；滚轮缩放。下方是观测点读数，右侧“设置”展开参数。'},
   {title:'换楼房与楼层',target:'.observer-controls',text:()=> '选择一座观测楼房，再拖动楼层滑条或输入楼层。不同地点和高度有不同的视野；自由飞行时先返回楼房，才能调节楼层。'},
   {title:'在地图定位风暴',target:'.map-section',group:'.map-section',text:()=> '地图默认拖动平移，双指或滚轮缩放。先开启“移动风暴中心”，再点击或拖动设置中心；关掉开关后恢复平移。“楼群”可定位观测楼房。'},
   {title:'独立调节风与雨',target:'.intensity-section',group:'.intensity-section',text:()=> '台风强度表示最大一分钟持续风，观测点读数还取决于距中心的位置。“独立雨强”可单独调节；风圈大小在“风圈结构”中设置。'},
   {title:'让风暴移动',target:'.motion-section',group:'.motion-section',text:()=> '转盘设置移动去向，速度使用 kt。点击“开始推进中心”才会移动；时间倍率同时影响推进、阵雨阵风、风毁和风暴潮。暂停按钮可冻结天气。'},
   {title:'自由飞行与去雾',target:'#sceneToolbar',camera:true,text:()=>mobile()?'点“上帝视角”进入自由飞行，用左侧摇杆水平移动，右侧“升 / 降”调高度。视角面板也有缩放、去雾、归中和恢复。':'点“上帝视角”后，在视窗内用 WASD 水平移动、Q/E 升降，Shift 加速。“去除雨雾”只改善画面通透度，不改变气象读数。'},
   {title:'水位与风毁',target:'.status-row',text:()=> '水位、雨量在左，风毁数量和剩余坚持时间在右。损坏随风速和受风时间积累；“恢复”修复景物并重新计时，顶部“重置”会复位全部设置。'},
   {title:'全屏观测',target:'#fullscreen',text:()=>mobile()?'全屏中可单独开关读数和地图。“净览”隐藏覆盖层，仅留“显示”按钮恢复；退出全屏后随时从顶部重开使用指南。':'点“全屏”专注观测。引导期间保留自由鼠标，完成后按 M 开关环视，Esc 释放鼠标。全屏菜单可选择读数和地图。'}
  ];
  const tour=document.createElement('div');tour.className='guide-tour';tour.hidden=true;tour.innerHTML='<div class="guide-spotlight" aria-hidden="true"></div><section class="guide-card" role="region" aria-label="交互式上手引导" tabindex="-1"><header><small id="guideProgress"></small><button id="endTour" aria-label="结束上手引导">结束 ×</button></header><h2 id="guideStepTitle"></h2><p id="guideStepText" aria-live="polite"></p><nav aria-label="引导步骤"><button id="previousGuideStep">上一步</button><button id="nextGuideStep">下一步 →</button></nav></section>';
  document.body.append(tour);const card=tour.querySelector('.guide-card'),spot=tour.querySelector('.guide-spotlight');let index=0,snapshot=null,target=null,raf=0;
  function position(){
   if(tour.hidden||!target)return;const r=target.getBoundingClientRect(),w=innerWidth,h=innerHeight,pad=8,visible=r.bottom>0&&r.top<h;
   spot.hidden=!visible;Object.assign(spot.style,{left:Math.max(4,r.left-4)+'px',top:Math.max(4,r.top-4)+'px',width:Math.max(4,Math.min(w-4,r.right+4)-Math.max(4,r.left-4))+'px',height:Math.max(4,Math.min(h-4,r.bottom+4)-Math.max(4,r.top-4))+'px'});
   const cw=card.offsetWidth,ch=card.offsetHeight,candidates=[{x:w-cw-pad,y:h-ch-pad},{x:pad,y:h-ch-pad},{x:w-cw-pad,y:pad},{x:pad,y:pad}];
   const overlap=c=>Math.max(0,Math.min(c.x+cw,r.right)-Math.max(c.x,r.left))*Math.max(0,Math.min(c.y+ch,r.bottom)-Math.max(c.y,r.top));candidates.sort((a,b)=>overlap(a)-overlap(b));Object.assign(card.style,{left:Math.max(pad,candidates[0].x)+'px',top:Math.max(pad,candidates[0].y)+'px'});
  }
  const schedule=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(position);};
  const targetSize=new ResizeObserver(schedule);
  function finish(restoreFocus=true){
   if(!snapshot)return;tour.hidden=true;targetSize.disconnect();setSidebar(snapshot.open);snapshot.details.forEach(([el,open])=>el.open=open);
   $('view').classList.toggle('controls-open',snapshot.cameraOpen);$('sceneControlsToggle').setAttribute('aria-expanded',String(snapshot.cameraOpen));
   $('view').classList.toggle('clean-view',snapshot.clean);$('sceneCleanToggle').setAttribute('aria-pressed',String(snapshot.clean));$('sceneCleanToggle').textContent=snapshot.clean?'显示':'净览';
   window.scrollTo(snapshot.x,snapshot.y);if(restoreFocus)$('guideButton').focus({preventScroll:true});snapshot=null;target=null;
  }
  function showStep(next){
   index=Math.max(0,Math.min(steps.length-1,next));const step=steps[index];
   $('view').classList.remove('clean-view');$('sceneCleanToggle').setAttribute('aria-pressed','false');$('sceneCleanToggle').textContent='净览';
   if(step.group){setSidebar(true);document.querySelector(step.group).open=true;}
   if(mobile()){$('view').classList.toggle('controls-open',!!step.camera);$('sceneControlsToggle').setAttribute('aria-expanded',String(!!step.camera));}
   target=document.querySelector(step.target);targetSize.disconnect();targetSize.observe(target);$('guideProgress').textContent=`上手引导 ${index+1} / ${steps.length}`;$('guideStepTitle').textContent=step.title;$('guideStepText').textContent=step.text();$('previousGuideStep').disabled=index===0;$('nextGuideStep').textContent=index===steps.length-1?'完成引导':'下一步 →';
   tour.hidden=false;target.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});position();schedule();
  }
  function start(step=0){
   if(snapshot)finish(false);snapshot={open:!workspace.classList.contains('sidebar-collapsed'),details:[...sidebar.querySelectorAll('details')].map(el=>[el,el.open]),cameraOpen:$('view').classList.contains('controls-open'),clean:$('view').classList.contains('clean-view'),x:scrollX,y:scrollY};
   (document.fullscreenElement||document.body).append(tour);
   if(dialog.open)dialog.close();showStep(step);card.focus({preventScroll:true});
  }
  $('guideButton').onclick=()=>{finish(false);dialog.showModal();};$('closeGuide').onclick=()=>dialog.close();$('startGuide').onclick=()=>start();$('guideModelNotes').onclick=()=>{dialog.close();$('aboutButton').click();};
  steps.forEach((step,i)=>{const button=document.createElement('button');button.type='button';button.textContent=String(i+1).padStart(2,'0')+'　'+step.title;button.onclick=()=>start(i);$('guideChapters').append(button);});
  $('previousGuideStep').onclick=()=>showStep(index-1);$('nextGuideStep').onclick=()=>index===steps.length-1?finish():showStep(index+1);$('endTour').onclick=()=>finish();
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&snapshot){e.preventDefault();finish();}});window.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);
  document.addEventListener('fullscreenchange',()=>{if(snapshot){(document.fullscreenElement||document.body).append(tour);schedule();}});
 }
 return{bind};
})();
