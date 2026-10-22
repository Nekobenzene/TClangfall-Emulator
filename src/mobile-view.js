/* One edge dock owns mobile overlays; the scene remains clear by default. */
const MobileView=(()=>{
 function bind({view,isMobile,onChange,stop}){
  const $=id=>document.getElementById(id),toolbar=$('sceneToolbar'),dock=view.querySelector('.view-buttons'),zoom=view.querySelector('.touch-zoom'),metrics=view.querySelector('.hud-metrics'),settings=view.querySelector('.hud-settings');
  const home=$('homeView'),restore=$('restoreButton'),zoomHome=zoom.parentElement;let mobile=null,mapOpen=false,readings=true,settingsOpen=false;
  const fs=()=>document.fullscreenElement===view||view.classList.contains('is-fullscreen');
  const clearPanels=()=>{view.classList.remove('controls-open','display-open');$('sceneControlsToggle').setAttribute('aria-expanded','false');settings.open=false;settingsOpen=false;$('mobileDisplaySettings')?.setAttribute('aria-expanded','false');};
  const sync=()=>{
   const next=isMobile();if(next!==mobile){mobile=next;clearPanels();view.classList.remove('clean-view');$('sceneCleanToggle').setAttribute('aria-pressed','false');$('sceneCleanToggle').textContent='净览';
    if(mobile){toolbar.append(home,restore,zoom);settings.append($('hudWindMode'));}else{dock.prepend(home,restore);zoomHome.insertBefore(zoom,$('flightHint'));$('hudWindPanel').querySelector('small').append($('hudWindMode'));mapOpen=false;readings=true;}
   }
   view.classList.toggle('mobile-map-open',mobile&&mapOpen&&fs());view.classList.toggle('mobile-readings-hidden',mobile&&!readings);$('sceneMapToggle').setAttribute('aria-pressed',String(mapOpen));$('sceneHudToggle').setAttribute('aria-pressed',String(readings));
   // Skip map painting when collapsed rather than drawing into a zero-sized canvas.
   view.dataset.mobileMapVisible=String(!mobile||(mapOpen&&!view.classList.contains('clean-view')));
   if(!fs())clearPanels();
   onChange();
  };
  $('sceneControlsToggle').onclick=()=>{const open=!view.classList.contains('controls-open');clearPanels();view.classList.toggle('controls-open',open);$('sceneControlsToggle').setAttribute('aria-expanded',String(open));stop();};
  $('sceneMapToggle').onclick=()=>{mapOpen=!mapOpen;clearPanels();stop();sync();};
  $('sceneHudToggle').onclick=()=>{readings=!readings;sync();};
  // Long menus are opened from the view panel, keeping only four small dock actions.
  const displayButton=document.createElement('button');displayButton.type='button';displayButton.id='mobileDisplaySettings';displayButton.textContent='显示选项';displayButton.setAttribute('aria-expanded','false');toolbar.append(displayButton);
  displayButton.onclick=()=>{settingsOpen=!settingsOpen;view.classList.toggle('display-open',settingsOpen);settings.open=settingsOpen;displayButton.setAttribute('aria-expanded',String(settingsOpen));};
  $('sceneCleanToggle').onclick=()=>{const clean=!view.classList.contains('clean-view');clearPanels();stop();view.classList.toggle('clean-view',clean);$('sceneCleanToggle').setAttribute('aria-pressed',String(clean));$('sceneCleanToggle').textContent=clean?'显示':'净览';sync();};
  toolbar.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&!['mobileDisplaySettings','viewZoomIn','viewZoomOut','zoomReset'].includes(b.id))clearPanels();});
  view.addEventListener('pointerdown',e=>{if(!e.target.closest('button,input,select,textarea,details,.camera-toolbar,.hud-map-wrap,.touch-flight'))clearPanels();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')clearPanels();});
  document.addEventListener('fullscreenchange',sync);window.addEventListener('resize',()=>{stop();clearPanels();sync();});
  new MutationObserver(changes=>{if(changes.some(c=>c.attributeName==='class')&&fs()!==view.classList.contains('mobile-fullscreen')){view.classList.toggle('mobile-fullscreen',fs());sync();}}).observe(view,{attributes:true,attributeFilter:['class']});
  sync();
 }
 return{bind};
})();
