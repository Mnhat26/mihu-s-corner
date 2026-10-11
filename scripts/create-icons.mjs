// Draws the sunflower app icon (original artwork) and writes every size the app uses.
// Run: node scripts/create-icons.mjs
import sharp from 'sharp';
import fs from 'node:fs/promises';

function petals(count, inner, outer, width, fill, rotate = 0) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const a = rotate + (360 / count) * i;
    // A petal: narrow at the disc, round in the middle, pointed at the tip.
    out += `<path transform="rotate(${a.toFixed(2)} 256 256)" d="M256 ${256 - inner} C ${256 - width} ${256 - inner - 30}, ${256 - width * 0.9} ${256 - outer + 40}, 256 ${256 - outer} C ${256 + width * 0.9} ${256 - outer + 40}, ${256 + width} ${256 - inner - 30}, 256 ${256 - inner} Z" fill="${fill}"/>`;
  }
  return out;
}

function seeds(radius) {
  // Golden-angle spiral, like a real sunflower head.
  let out = ''; const n = 150; const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 1; i <= n; i++) {
    const r = radius * Math.sqrt(i / n) * 0.92; const t = i * golden;
    const x = 256 + r * Math.cos(t), y = 256 + r * Math.sin(t);
    const size = 2.2 + 2.6 * (i / n);
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size.toFixed(1)}" fill="${i % 3 ? '#4a2a14' : '#a0662e'}" opacity="0.9"/>`;
  }
  return out;
}

const flower = (scale) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <circle cx="256" cy="262" r="178" fill="#e8a417" opacity="0.18"/>
    ${petals(18, 70, 196, 30, 'url(#petalBack)', 10)}
    ${petals(18, 70, 176, 30, 'url(#petalFront)')}
    <circle cx="256" cy="256" r="82" fill="url(#disc)"/>
    ${seeds(80)}
    <circle cx="256" cy="256" r="82" fill="none" stroke="#3b2110" stroke-width="5" opacity="0.5"/>
  </g>`;

const defs = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#ffe7b0"/></linearGradient>
    <linearGradient id="petalFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd23f"/><stop offset="1" stop-color="#f5a90f"/></linearGradient>
    <linearGradient id="petalBack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7b52a"/><stop offset="1" stop-color="#d98a0b"/></linearGradient>
    <radialGradient id="disc" cx="0.45" cy="0.4" r="0.7"><stop offset="0" stop-color="#8a5226"/><stop offset="1" stop-color="#3f2210"/></radialGradient>
  </defs>`;

// Full-bleed square: iOS and Android round the corners themselves. Flower kept inside the
// central safe zone so "maskable" crops on Android never cut petals.
const icon = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${defs}<rect width="512" height="512" fill="url(#bg)"/>${flower(scale)}</svg>`;
// Browser tab: transparent background and a slightly larger flower so it reads at 16px.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 512 512">${defs}${flower(1.18)}</svg>`;

await fs.writeFile('public/favicon.svg', favicon);
for (const size of [180, 192]) await sharp(Buffer.from(icon(0.98))).resize(size, size).png().toFile(`public/icon-${size}.png`);
await sharp(Buffer.from(icon(0.98))).resize(512, 512).png().toFile('public/icon-512.png');
await sharp(Buffer.from(icon(0.78))).resize(512, 512).png().toFile('public/icon-maskable-512.png');
console.log('Generated sunflower icons.');
