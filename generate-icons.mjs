import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const OUT = 'C:/Projects/elazigapp/assets/images';
const NAVY = '#0F2A4A';
const NAVY2 = '#163A66';
const AMBER = '#E8792B';
const AMBER2 = '#F2994A';
const BLUE = '#66AFFE';

/**
 * Sembol (1024x1024 koordinat sisteminde). fg = kale rengi, sun = güneş rengi, road = hat çizgisi rengi.
 * Kale: ortada yüksek kule, iki yanda alçak kuleler, mazgallar; güneş orta kulenin arkasında.
 */
function symbol({ fg, sun, road, monochrome = false }) {
  const win = monochrome ? 'none' : 'inherit';
  return `
  <g id="symbol">
    <!-- güneş -->
    <circle cx="512" cy="420" r="150" fill="${sun}"/>
    <!-- yan kuleler -->
    <rect x="262" y="450" width="140" height="240" fill="${fg}"/>
    <rect x="622" y="450" width="140" height="240" fill="${fg}"/>
    <!-- yan kule mazgalları -->
    <rect x="262" y="405" width="44" height="50" fill="${fg}"/>
    <rect x="358" y="405" width="44" height="50" fill="${fg}"/>
    <rect x="622" y="405" width="44" height="50" fill="${fg}"/>
    <rect x="718" y="405" width="44" height="50" fill="${fg}"/>
    <!-- duvarlar -->
    <rect x="402" y="540" width="40" height="150" fill="${fg}"/>
    <rect x="582" y="540" width="40" height="150" fill="${fg}"/>
    <!-- orta kule -->
    <rect x="432" y="330" width="160" height="360" fill="${fg}"/>
    <rect x="432" y="285" width="44" height="50" fill="${fg}"/>
    <rect x="490" y="285" width="44" height="50" fill="${fg}"/>
    <rect x="548" y="285" width="44" height="50" fill="${fg}"/>
    <!-- taban -->
    <rect x="222" y="690" width="580" height="54" rx="14" fill="${fg}"/>
    <!-- pencereler (monokromda yok) -->
    <g display="${win}">
      <path d="M492 520 a20 20 0 0 1 40 0 v70 h-40 z" fill="${NAVY}" opacity="0.9"/>
      <rect x="318" y="560" width="28" height="44" rx="6" fill="${NAVY}" opacity="0.9"/>
      <rect x="678" y="560" width="28" height="44" rx="6" fill="${NAVY}" opacity="0.9"/>
    </g>
    <!-- hat/yol çizgisi -->
    <path d="M236 810 Q512 900 788 810" fill="none" stroke="${road}" stroke-width="30" stroke-linecap="round"/>
    <circle cx="512" cy="855" r="26" fill="${monochrome ? fg : AMBER}"/>
  </g>`;
}

const defs = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${NAVY2}"/>
      <stop offset="1" stop-color="${NAVY}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.5">
      <stop offset="0" stop-color="${AMBER}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${AMBER}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${AMBER2}"/>
      <stop offset="1" stop-color="${AMBER}"/>
    </linearGradient>
  </defs>`;

const svg = (inner, w = 1024, h = 1024) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1024 1024">${defs}${inner}</svg>`;
const scaled = (inner, s) => `<g transform="translate(${512 - 512 * s} ${512 - 512 * s}) scale(${s})">${inner}</g>`;

// 1) Ana ikon (iOS/genel): gradyan arka plan + parıltı + sembol
const iconSvg = svg(`
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="1024" fill="url(#glow)"/>
  ${scaled(symbol({ fg: '#FFFFFF', sun: 'url(#sun)', road: BLUE }), 0.86)}
`);

// 2) Android adaptif: ön plan (güvenli bölge ~%66 → sembol 0.6 ölçek), arka plan, monokrom
const fgSvg = svg(scaled(symbol({ fg: '#FFFFFF', sun: 'url(#sun)', road: BLUE }), 0.6));
const bgSvg = svg(`<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#glow)"/>`);
const monoSvg = svg(scaled(symbol({ fg: '#FFFFFF', sun: '#FFFFFF', road: '#FFFFFF', monochrome: true }), 0.6));

// 3) Splash: şeffaf zemin, beyaz sembol (splash arka planı lacivert)
const splashSvg = svg(scaled(symbol({ fg: '#FFFFFF', sun: 'url(#sun)', road: BLUE }), 0.8));

const jobs = [
  ['icon.png', iconSvg, 1024],
  ['android-icon-foreground.png', fgSvg, 1024],
  ['android-icon-background.png', bgSvg, 1024],
  ['android-icon-monochrome.png', monoSvg, 1024],
  ['splash-icon.png', splashSvg, 1024],
  ['favicon.png', iconSvg, 64],
];

if (!fs.existsSync(OUT)) {
  fs.mkdirSync(OUT, { recursive: true });
}

for (const [name, s, size] of jobs) {
  const buf = await sharp(Buffer.from(s), { density: 300 }).resize(size, size).png().toBuffer();
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(name, size, buf.length);
}

// önizleme: ikon + yuvarlatılmış maske (mağaza görünümü) ve küçük boy
const preview = await sharp(Buffer.from(iconSvg)).resize(512, 512).png().toBuffer();
fs.writeFileSync(path.join('C:/Projects/elazigapp', 'preview.png'), preview);
console.log('preview.png', 512, preview.length);
