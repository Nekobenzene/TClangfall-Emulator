import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
let html = read('./src/index.source.html');
for (const [tag, file] of [['STYLE','./src/style.css'],['THREE','./three-vendor.min.js'],['MODEL','./src/model.js'],['APP','./src/app.js']]) {
  const source = (tag === 'APP' ? read('./src/sliders.js') + '\n' + read('./src/sites.js') + '\n' + read('./src/camera.js') + '\n' + read('./src/touch.js') + '\n' + read('./src/mobile-view.js') + '\n' + read('./src/view-effects.js') + '\n' + read('./src/wind-colors.js') + '\n' + read('./src/map.js') + '\n' + read('./src/scenery.js') + '\n' + read('./src/flood-debris.js') + '\n' + read('./src/eye-wall.js') + '\n' + read(file) : read(file)).replace(/<\/script/gi, '<\\/script');
  html = html.replace(`/* ${tag} */`, () => source);
}
html += `\n<!-- Project license\n${read('./LICENSE').replace(/-->/g, '-- >')}\n-->\n`;
html += `\n<!-- Third-party license: Three.js r160\n${read('./THREE-LICENSE.txt').replace(/-->/g, '-- >')}\n-->\n`;
fs.writeFileSync(new URL('./台风模拟器.html', import.meta.url), html);
console.log('Built 台风模拟器.html: ' + Buffer.byteLength(html) + ' bytes');
if (process.argv.includes('--pages')) {
  const site = new URL('./_site/', import.meta.url);
  fs.mkdirSync(site, { recursive: true });
  fs.writeFileSync(new URL('index.html', site), html);
  fs.writeFileSync(new URL('.nojekyll', site), '');
  console.log('Built GitHub Pages site: _site/index.html');
}
