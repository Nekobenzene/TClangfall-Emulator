/* Display-only optics and daylight; never changes meteorological observations. */
const ViewAtmosphere=(()=>{
  const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
  function sample(weather,clearFog){
    const sun=Math.min(1,Math.max(0,weather.sunshine));
    const dry=1-smooth(8,65,weather.rain),openness=Math.max(sun,dry*.58);
    return{openness,dry,sun,direct:1.05+dry*.75+sun*3.1,ambient:2.1+openness*.65,
      exposure:1.08+openness*.12,blue:Math.max(sun,dry*.28),
      fogDensity:clearFog?1.98/22000:1.98/Math.max(55,weather.visibility)*(1-openness*.46),
      shadows:openness>.12};
  }
  return{sample};
})();
function createWideLens(T,renderer){
  const target=new T.WebGLRenderTarget(1,1,{depthBuffer:true}),screen=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
  target.samples=renderer.capabilities.isWebGL2?4:0;
  const material=new T.ShaderMaterial({uniforms:{sceneImage:{value:target.texture},amount:{value:0}},depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 uvPos;void main(){uvPos=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:'uniform sampler2D sceneImage;uniform float amount;varying vec2 uvPos;void main(){vec2 p=(uvPos-.5)*2.;float r=dot(p,p);vec2 q=p*(1.+amount*.055*r)/(1.+amount*.11);vec3 color=texture2D(sceneImage,.5+q*.5).rgb;gl_FragColor=vec4(color*(1.-amount*.055*smoothstep(.35,1.6,r)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});
  screen.add(new T.Mesh(new T.PlaneGeometry(2,2),material));
  const size=new T.Vector2();
  function render(scene,viewCamera,zoom){
    const amount=Math.min(1,Math.max(0,(1-zoom)/.65));
    if(amount<.002){renderer.render(scene,viewCamera);return;}
    renderer.getDrawingBufferSize(size);if(target.width!==size.x||target.height!==size.y)target.setSize(size.x,size.y);
    material.uniforms.amount.value=amount;renderer.setRenderTarget(target);renderer.render(scene,viewCamera);renderer.setRenderTarget(null);renderer.render(screen,camera);
  }
  return{render};
}
if(typeof module!=='undefined'&&module.exports)module.exports=ViewAtmosphere;
