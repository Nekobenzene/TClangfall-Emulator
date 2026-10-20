/* Camera sites sit just outside the sea-facing corners of existing buildings. */
const OBSERVATION_SITES=[
  {id:'coast',name:'海岸公寓',x:0,z:55,maxFloor:14,foundationX:0},
  {id:'front',name:'前排住宅',x:-12,z:2,maxFloor:13,foundationX:-56},
  {id:'tower',name:'云岸塔楼',x:-109,z:-55,maxFloor:38,foundationX:-150},
  {id:'south',name:'南湾公寓',x:-1,z:-387,maxFloor:23,foundationX:-34},
  {id:'harbor',name:'远港高层',x:-138,z:-578,maxFloor:40,foundationX:-194}
].map(site=>({...site,ground:StormModel.coastalHeight(site.foundationX),east:site.x/1000,north:(55-site.z)/1000}));
