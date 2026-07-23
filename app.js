/* ============================================================================
   Match Cut Studio — text match-cut video generator
   100% client-side: canvas rendering + Web Audio + MediaRecorder.
   Bundled offline fonts, multiple backgrounds, webm + PNG-frame export.
   Nothing leaves the browser.
   ========================================================================== */

'use strict';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const ctx = canvas.getContext('2d', { alpha: true });

const el = {
  word: $('wordInput'),
  fps: $('fpsInput'), fpsVal: $('fpsVal'),
  hold: $('holdInput'), holdVal: $('holdVal'),
  dur: $('durInput'), durVal: $('durVal'),
  paper: $('paperColor'), ink: $('inkColor'), highlight: $('highlightColor'),
  filler: $('fillerToggle'), grain: $('grainToggle'),
  jitter: $('jitterToggle'), flash: $('flashToggle'), upper: $('uppercaseToggle'),
  blurRange: $('blurRange'), blurVal: $('blurVal'),
  fontFiles: $('fontFiles'), fontChips: $('fontChips'), fontCount: $('fontCount'),
  shuffle: $('shuffleFonts'),
  soundSelect: $('soundSelect'), soundFile: $('soundFile'),
  vol: $('volInput'), volVal: $('volVal'),
  perFrame: $('perFrameSound'), soundHint: $('soundHint'),
  playBtn: $('playBtn'), exportBtn: $('exportBtn'),
  framesBtn: $('framesBtn'), frameBtn: $('frameBtn'),
  status: $('status'), recBadge: $('recBadge'),
  stageWrap: $('stageWrap'), dimNote: $('dimNote'), bgNote: $('bgNote'),
};

const state = {
  ratio: '9:16', quality: 1080, bg: 'newspaper', hlStyle: 'box',
  fonts: [], fontOrder: [], playing: false, recording: false,
};

/* 30 trendy display fonts bundled in fonts/ (see fonts/fonts.css). These render
   offline with no CDN. Names must match the @font-face family names. */
const BUNDLED_FONTS = [
  'Anton', 'Archivo Black', 'Bebas Neue', 'Oswald', 'Teko', 'Fjalla One',
  'Staatliches', 'Passion One', 'Alfa Slab One', 'Ultra', 'Rye', 'Special Elite',
  'Playfair Italic', 'DM Serif Italic', 'Fraunces Italic', 'Bodoni Moda Italic',
  'Cinzel Black', 'Yeseva One', 'Abril Fatface', 'Bungee', 'Bungee Inline',
  'Rubik Mono One', 'Monoton', 'Bowlby One SC', 'Titan One', 'Squada One',
  'Big Shoulders', 'Libre Franklin Black', 'Zilla Slab Highlight', 'Shrikhand',
];
/* Common system faces — add variety on the user's machine if present. Harmless
   if missing (canvas falls back), so they simply enrich the rotation. */
const SYSTEM_FONTS = [
  'Impact', 'Georgia', 'Times New Roman', 'Courier New', 'Arial Black',
  'Trebuchet MS', 'Garamond', 'Palatino Linotype', 'Franklin Gothic Medium',
];

const RATIOS = { '9:16':[9,16], '16:9':[16,9], '1:1':[1,1], '4:5':[4,5], '3:4':[3,4], '2.35:1':[2.35,1] };
const BG_DEFAULTS = {
  newspaper: { paper:'#f4f1e8', ink:'#141414', note:'Real newspaper article — the word is highlighted inline with a focus blur.' },
  clean:     { paper:'#f4f1e8', ink:'#141414', note:'Solid paper, no filler — just the hero word.' },
  dark:      { paper:'#0d0d0d', ink:'#f5f5f5', note:'Modern dark background with light ink.' },
  green:     { paper:'#00ff00', ink:'#111111', note:'Chroma-key green (#00FF00). Key it out in any editor.' },
  transparent:{ paper:'#00000000', ink:'#141414', note:'No background — export PNG frames to keep alpha.' },
};

const FILLER = ('the of and to in a is that for it as was with he his on be at by i this had not are but from or have '
+ 'an they which one you were her all she there would their we him been has when who will more no if out so said what up '
+ 'its about into than them can only other new some could time these two may then do first any my now such like our over '
+ 'man me even most made after also did many before must through back years where much your way well down should because '
+ 'each just those people how too little state good very make world still own see men work long get here between both '
+ 'life being under never day same another know while last might great old year off come since against go came right used '
+ 'take three states himself few house use during without again place american around however home small found thought '
+ 'went say part once general high upon school every does got united left number course war until always away something '
+ 'fact though water less public put think almost hand enough far took head yet government system set told nothing night '
+ 'end why called eyes find going look asked later knew').split(' ');

/* ============================================================================
   FONTS
   ========================================================================== */
function initFonts() {
  BUNDLED_FONTS.forEach((name) => state.fonts.push({ name, source: 'builtin' }));
  SYSTEM_FONTS.forEach((name) => state.fonts.push({ name, source: 'system' }));
  rebuildFontOrder();
  renderFontChips();
}

function rebuildFontOrder() {
  state.fontOrder = state.fonts.map((_, i) => i);
  if (el.shuffle.checked) shuffle(state.fontOrder);
}

function renderFontChips() {
  const users = state.fonts.filter((f) => f.source === 'user');
  el.fontCount.textContent = `${state.fonts.length} fonts`;
  el.fontChips.innerHTML = '';
  users.forEach((f) => {
    const c = document.createElement('span');
    c.className = 'chip user';
    c.innerHTML = `<b>${escapeHtml(f.name.replace(/^user-/, ''))}</b>`;
    el.fontChips.appendChild(c);
  });
  const note = document.createElement('span');
  note.className = 'chip';
  note.textContent = `${BUNDLED_FONTS.length} built-in · ${SYSTEM_FONTS.length} system`;
  el.fontChips.appendChild(note);
}

async function handleFontUpload(files) {
  let added = 0;
  for (const file of files) {
    const family = 'user-' + file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/gi, '_');
    try {
      const buf = await file.arrayBuffer();
      const face = new FontFace(family, buf);
      await face.load();
      document.fonts.add(face);
      state.fonts.push({ name: family, source: 'user' });
      added++;
    } catch (e) {
      setStatus(`Could not load "${file.name}"`, 'err');
    }
  }
  rebuildFontOrder();
  renderFontChips();
  if (added) setStatus(`Added ${added} font(s) to the rotation.`, 'ok');
  drawPreviewFrame(0);
}

/* Force the bundled @font-face families to actually load before we measure/draw. */
async function ensureFontsReady() {
  const jobs = BUNDLED_FONTS.map((f) =>
    document.fonts.load(`40px "${f}"`).catch(() => {}));
  try { await Promise.all(jobs); await document.fonts.ready; } catch (_) {}
}

/* ============================================================================
   DIMENSIONS
   ========================================================================== */
function dims() {
  const [a, b] = RATIOS[state.ratio];
  const q = state.quality;                    // 720 | 1080 | 2160
  const long = q === 720 ? 1280 : q === 1080 ? 1920 : 3840;
  let w, h;
  if (a === b) { w = h = q; }
  else if (a > b) { w = long; h = Math.round(long * b / a); }
  else { h = long; w = Math.round(long * a / b); }
  w -= w % 2; h -= h % 2;
  return [w, h];
}

function applyRatio() {
  const [w, h] = dims();
  canvas.width = w; canvas.height = h;
  el.dimNote.textContent = `${w} × ${h}`;
  el.stageWrap.classList.toggle('checker', state.bg === 'transparent');
}

/* ============================================================================
   RENDERING
   ========================================================================== */
function rng(seed) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function currentWord() { let w = el.word.value || 'MATCH'; return el.upper.checked ? w.toUpperCase() : w; }
function fontFor(i) {
  if (!state.fontOrder.length) return 'sans-serif';
  const idx = state.fontOrder[i % state.fontOrder.length];
  return `"${state.fonts[idx].name}"`;
}

/* ---------- newspaper copy (used to build a believable article) ---------- */
const CATEGORIES = ['NATION','CULTURE','BUSINESS','SCIENCE','OPINION','WORLD','FEATURES','LIFESTYLE','TECHNOLOGY','ARTS','REPORT','ANALYSIS'];
const HEADLINES = [
  'Understanding the Complete Guide',
  'The Story Nobody Saw Coming',
  'How Everything Quietly Changed',
  'Experts Weigh In Once Again',
  'What It Means For The Future',
  'Inside The Movement Today',
  'The Rise Of A New Era Begins',
  'A Closer Look At The Numbers',
  'Voices From The Front Lines',
  'The Question On Everyone’s Mind',
];
/* {W} is where the highlighted word is dropped, inline in a real sentence */
const FOCUS_TEMPLATES = [
  'a decision made with {W} leads to the future',
  'new study links {W} to nearly everything',
  'the art of a real {W} looks like this',
  'how {W} is quietly changing the game',
  'a closer look at {W} and its impact',
  'experts say {W} will define the decade',
  'the untold rise of {W} in modern culture',
  'why {W} matters more now than ever before',
  'inside the world of {W} today',
  'everything you know about {W} is shifting',
];
const SUBHEADS = [
  'A closer look at the story behind the headline',
  'Reporting from the field — continued on page 4',
  'Our correspondents explain what happens next',
  'The full account, in their own words',
  'What the latest findings really tell us',
];

/* offscreen buffers for the depth-of-field composite */
let pageCanvas = null, pageCtx = null, focusCanvas = null, focusCtx = null;
function ensureOffscreen(W, H) {
  if (!pageCanvas) { pageCanvas = document.createElement('canvas'); focusCanvas = document.createElement('canvas'); }
  if (pageCanvas.width !== W || pageCanvas.height !== H) {
    pageCanvas.width = W; pageCanvas.height = H; focusCanvas.width = W; focusCanvas.height = H;
  }
  pageCtx = pageCanvas.getContext('2d'); focusCtx = focusCanvas.getContext('2d');
}

function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function genSentence(rand, n) {
  const w = []; for (let i = 0; i < n; i++) w.push(FILLER[Math.floor(rand() * FILLER.length)]);
  return capitalize(w.join(' ')) + '.';
}
function genBody(rand, sentences) {
  const s = []; for (let i = 0; i < sentences; i++) s.push(genSentence(rand, 5 + Math.floor(rand() * 9)));
  return s.join(' ');
}

/* wrapped headline; returns the y after the last baseline */
function drawWrapped(c, text, x, y, maxW, fontPx, family, color, lineGap) {
  c.font = `${fontPx}px ${family}`; c.fillStyle = color; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  const words = text.split(' '); let line = ''; const lh = fontPx * (lineGap || 1.05);
  for (const wd of words) {
    const t = line ? line + ' ' + wd : wd;
    if (c.measureText(t).width > maxW && line) { c.fillText(line, x, y); y += lh; line = wd; }
    else line = t;
  }
  if (line) { c.fillText(line, x, y); y += lh; }
  return y;
}

/* justified body text filling a column down to maxY; returns final y */
function drawBody(c, text, x, y, maxW, maxY, fontPx, family, color) {
  c.font = `${fontPx}px ${family}`; c.fillStyle = color; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  const lh = fontPx * 1.5; const spaceW = c.measureText(' ').width;
  const words = text.split(' '); let line = [];
  const wordW = (w) => c.measureText(w).width;
  const flush = (justify) => {
    if (!line.length) return;
    const wordsW = line.reduce((s, w) => s + wordW(w), 0);
    let gap = spaceW;
    if (justify && line.length > 1) {
      gap = (maxW - wordsW) / (line.length - 1);
      if (gap < spaceW * 0.6) gap = spaceW; if (gap > spaceW * 3.2) gap = spaceW * 3.2;
    }
    let cx = x;
    for (const w of line) { c.fillText(w, cx, y); cx += wordW(w) + gap; }
    y += lh; line = [];
  };
  for (const wd of words) {
    if (y > maxY) break;
    const test = line.concat(wd);
    const w = test.reduce((s, x) => s + wordW(x), 0) + spaceW * (test.length - 1);
    if (w > maxW && line.length) { flush(true); line = [wd]; }
    else line.push(wd);
  }
  if (y <= maxY) flush(false);
  return y;
}

/* focus line: a sentence with the word highlighted inline. The HIGHLIGHTED
   phrase is anchored so its center sits exactly at (cx, cy) every frame — the
   word stays locked in the middle while the surrounding words change. */
function drawFocusLine(c, tmpl, phrase, cx, cy, family, fontPx, ink, hlColor) {
  c.font = `${fontPx}px ${family}`; c.textBaseline = 'middle'; c.textAlign = 'left';
  const parts = tmpl.split('{W}'); const before = parts[0], after = parts[1] || '';
  const bW = c.measureText(before).width, pW = c.measureText(phrase).width;
  const px = cx - pW / 2;               // phrase left edge -> phrase centered on cx
  c.fillStyle = ink; c.fillText(before, px - bW, cy);   // before ends where phrase starts
  const padX = fontPx * 0.09, padY = fontPx * 0.06;
  c.fillStyle = hlColor;
  c.fillRect(px - padX, cy - fontPx * 0.52 - padY, pW + padX * 2, fontPx * 1.04 + padY * 2);
  c.fillStyle = ink; c.fillText(phrase, px, cy);
  c.fillText(after, px + pW, cy);       // after starts where phrase ends
  return { cx, cy };
}

/* build a centered line of random words that fills ~the column width */
function buildLine(c, rand, maxW, fontPx, font) {
  c.font = `${fontPx}px ${font}`;
  const words = [];
  while (words.length < 16) {
    const wd = FILLER[Math.floor(rand() * FILLER.length)];
    const test = (words.length ? words.join(' ') + ' ' : '') + wd;
    if (c.measureText(test).width > maxW * 0.96 && words.length) break;
    words.push(wd);
  }
  return capitalize(words.join(' '));
}

/* THE textmatchcut LOOK: uniform lines of newspaper text, one font per frame,
   the highlighted phrase locked to the exact center, radial depth-of-field. */
function drawNewspaper(i, rand, word, font, paper, ink) {
  const W = canvas.width, H = canvas.height, base = Math.min(W, H);
  ensureOffscreen(W, H);
  const p = pageCtx;
  p.setTransform(1, 0, 0, 1, 0, 0); p.globalCompositeOperation = 'source-over';
  p.clearRect(0, 0, W, H);
  p.fillStyle = paper; p.fillRect(0, 0, W, H);
  const tone = p.createLinearGradient(0, 0, 0, H);
  tone.addColorStop(0, 'rgba(90,80,60,0.05)'); tone.addColorStop(1, 'rgba(70,60,45,0.08)');
  p.fillStyle = tone; p.fillRect(0, 0, W, H);

  const fontPx = base * 0.05;                 // FONT_SIZE_RATIO 0.05, like the reference
  const lineH = fontPx * 1.5;                 // VERTICAL_SPREAD_FACTOR 1.5
  const cyC = H / 2;                          // highlighted line is the exact middle
  const maxW = W * 0.92;

  // lines above and below the centre, all same size, all centered
  const up = Math.ceil((cyC + lineH) / lineH), down = Math.ceil((H - cyC + lineH) / lineH);
  p.textBaseline = 'middle';
  for (let k = -up; k <= down; k++) {
    if (k === 0) continue;                    // centre line drawn separately below
    const y = cyC + k * lineH;
    if (y < -lineH || y > H + lineH) continue;
    p.textAlign = 'center';
    p.font = `${fontPx}px ${font}`;
    p.fillStyle = hexToRgba(ink, 0.9);
    p.fillText(buildLine(p, rand, maxW, fontPx, font), W / 2, y);
  }

  // ---- the centre line: random words, {W} highlighted and centered ----
  p.font = `${fontPx}px ${font}`;
  const pW = p.measureText(word).width;
  const halfSpace = (W - pW) / 2;
  const beforeWords = [], afterWords = [];
  while (beforeWords.length < 8) {
    const wd = FILLER[Math.floor(rand() * FILLER.length)];
    const t = wd + ' ' + beforeWords.join(' ');
    if (p.measureText(t).width > halfSpace * 0.9 && beforeWords.length) break;
    beforeWords.unshift(wd);
  }
  while (afterWords.length < 8) {
    const wd = FILLER[Math.floor(rand() * FILLER.length)];
    const t = afterWords.join(' ') + ' ' + wd;
    if (p.measureText(t).width > halfSpace * 0.9 && afterWords.length) break;
    afterWords.push(wd);
  }
  const tmpl = capitalize(beforeWords.join(' ')) + ' {W} ' + afterWords.join(' ');
  const box = drawFocusLine(p, tmpl, word, W / 2, cyC, font, fontPx, ink, el.highlight.value);

  // ---- radial depth-of-field with adjustable radius ----
  const strength = el.blurRange ? +el.blurRange.value : 35;   // 0..100
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);

  if (strength <= 1) {
    ctx.drawImage(pageCanvas, 0, 0);          // no blur
  } else {
    const blurAmt = Math.max(2, base * (strength / 100) * 0.02);
    ctx.save(); ctx.filter = `blur(${blurAmt}px)`; ctx.drawImage(pageCanvas, 0, 0); ctx.restore();
    // sharp region centered on the word; shrinks as blur strength rises
    const sharpR = base * (0.52 - (strength / 100) * 0.30);
    const fadeR = sharpR + base * 0.18;
    const f = focusCtx;
    f.setTransform(1, 0, 0, 1, 0, 0); f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, W, H); f.drawImage(pageCanvas, 0, 0);
    f.globalCompositeOperation = 'destination-in';
    f.save();
    f.translate(box.cx, box.cy); f.scale(1, 0.7);
    const g = f.createRadialGradient(0, 0, sharpR * 0.5, 0, 0, fadeR);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(Math.min(0.98, sharpR / fadeR), 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = g; f.fillRect(-W * 1.5, -H * 1.5, W * 3, H * 3);
    f.restore();
    f.globalCompositeOperation = 'source-over';
    ctx.drawImage(focusCanvas, 0, 0);
  }

  if (el.grain.checked) drawGrain(W, H, i);
  const vig = ctx.createRadialGradient(W/2, H/2, base * 0.38, W/2, H/2, base * 0.78);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
}

/* SIMPLE mode: centered highlighted word for clean / dark / green / transparent
   backgrounds (title-card & compositing use). */
function drawSimple(i, rand, word, font, bg, paper, ink) {
  const W = canvas.width, H = canvas.height, base = Math.min(W, H);
  const flashOn = el.flash.checked && (i % 4 === 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  if (bg !== 'transparent') { ctx.fillStyle = flashOn ? ink : paper; ctx.fillRect(0, 0, W, H); if (flashOn) ink = paper; }
  const paperish = (bg === 'clean' || bg === 'dark');

  const jx = el.jitter.checked ? (rand() - 0.5) * W * 0.05 : 0;
  const jy = el.jitter.checked ? (rand() - 0.5) * H * 0.03 : 0;
  const rot = el.jitter.checked ? (rand() - 0.5) * 0.05 : 0;

  let size = base * 0.2; ctx.font = `${size}px ${font}`;
  let tw = ctx.measureText(word).width; const maxW = W * 0.82;
  if (tw > maxW) size *= maxW / tw; else if (tw < maxW * 0.45 && tw > 0) size *= (maxW * 0.6) / tw;
  ctx.font = `${size}px ${font}`; tw = ctx.measureText(word).width; const th = size;

  ctx.save(); ctx.translate(W/2 + jx, H/2 + jy); ctx.rotate(rot);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const padX = size * 0.14, padY = size * 0.12;
  const bx = -tw/2 - padX, by = -th/2 - padY, bw = tw + padX*2, bh = th + padY*2;
  const hl = state.hlStyle;
  if (hl === 'box') { ctx.fillStyle = el.highlight.value; roundRect(ctx, bx, by, bw, bh, size*0.06); ctx.fill(); ctx.fillStyle = ink; ctx.fillText(word, 0, 0); }
  else if (hl === 'underline') { ctx.fillStyle = ink; ctx.fillText(word, 0, 0); ctx.fillStyle = el.highlight.value; ctx.fillRect(-tw/2, th*0.42, tw, size*0.1); }
  else if (hl === 'invert') { ctx.fillStyle = ink; roundRect(ctx, bx, by, bw, bh, size*0.04); ctx.fill(); ctx.fillStyle = el.highlight.value; ctx.fillText(word, 0, 0); }
  else { ctx.fillStyle = ink; ctx.fillText(word, 0, 0); }
  ctx.restore();

  if (el.grain.checked && paperish && !flashOn) drawGrain(W, H, i);
  if (paperish && !flashOn) {
    const vig = ctx.createRadialGradient(W/2, H/2, base*0.35, W/2, H/2, base*0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, bg === 'dark' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.16)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  }
}

function drawFrame(frameIndex) {
  const rand = rng(frameIndex * 2654435761 + 12345);
  const word = currentWord(), font = fontFor(frameIndex);
  const bg = state.bg, paper = el.paper.value, ink = el.ink.value;
  if (bg === 'newspaper') drawNewspaper(frameIndex, rand, word, font, paper, ink);
  else drawSimple(frameIndex, rand, word, font, bg, paper, ink);
}

let grainCanvas = null;
function drawGrain(W, H, seed) {
  if (!grainCanvas) { grainCanvas = document.createElement('canvas'); grainCanvas.width = 128; grainCanvas.height = 128; }
  const gc = grainCanvas.getContext('2d');
  const img = gc.createImageData(128, 128);
  const r = rng(seed + 7);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + Math.floor(r() * 135);
    img.data[i] = img.data[i+1] = img.data[i+2] = v; img.data[i+3] = 14;
  }
  gc.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(grainCanvas, 'repeat');
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawPreviewFrame(i) { ensureFontsReady().then(() => drawFrame(i)); }

/* ============================================================================
   AUDIO
   ========================================================================== */
let audioCtx = null, customBuffer = null, recordDest = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function masterGain() { return el.vol.value / 100; }
function connectOut(node) { node.connect(getAudio().destination); if (recordDest) node.connect(recordDest); }

function playTypewriter(t) {
  const ac = getAudio();
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9 * masterGain(), t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * 0.08), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * (1 - i/d.length);
  const src = ac.createBufferSource(); src.buffer = buf;
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
  const osc = ac.createOscillator(); osc.type = 'square'; osc.frequency.value = 140;
  const og = ac.createGain();
  og.gain.setValueAtTime(0.5 * masterGain(), t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(bp); bp.connect(g); connectOut(g);
  osc.connect(og); connectOut(og);
  src.start(t); osc.start(t); osc.stop(t + 0.06);
}
function playTick(t) {
  const ac = getAudio();
  const osc = ac.createOscillator(); osc.type = 'triangle';
  osc.frequency.setValueAtTime(2600, t); osc.frequency.exponentialRampToValueAtTime(900, t + 0.03);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.6 * masterGain(), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.connect(g); connectOut(g); osc.start(t); osc.stop(t + 0.06);
}
function playCamera(t) {
  // shutter: quick noise "chk-chk"
  const ac = getAudio();
  [0, 0.045].forEach((off) => {
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate*0.04), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * (1 - i/d.length);
    const src = ac.createBufferSource(); src.buffer = buf;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2000;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.7 * masterGain(), t + off);
    g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.04);
    src.connect(hp); hp.connect(g); connectOut(g); src.start(t + off);
  });
}
let riserOsc = null;
function startRiser(duration) {
  const ac = getAudio(); const t = ac.currentTime;
  riserOsc = ac.createOscillator(); riserOsc.type = 'sawtooth';
  riserOsc.frequency.setValueAtTime(80, t);
  riserOsc.frequency.exponentialRampToValueAtTime(1200, t + duration);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(6000, t + duration);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35 * masterGain(), t + duration * 0.9);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  riserOsc.connect(lp); lp.connect(g); connectOut(g);
  riserOsc.start(t); riserOsc.stop(t + duration + 0.05);
}
function stopRiser() { try { riserOsc && riserOsc.stop(); } catch(_){} riserOsc = null; }
function playCustomOnce(t) {
  if (!customBuffer) return;
  const ac = getAudio(); const src = ac.createBufferSource(); src.buffer = customBuffer;
  const g = ac.createGain(); g.gain.value = masterGain(); src.connect(g); connectOut(g); src.start(t);
}
function playCustomBlip(t) {
  if (!customBuffer) return;
  const ac = getAudio(); const src = ac.createBufferSource(); src.buffer = customBuffer;
  const g = ac.createGain();
  g.gain.setValueAtTime(masterGain(), t); g.gain.setValueAtTime(masterGain(), t + 0.09);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  src.connect(g); connectOut(g); src.start(t, 0, 0.15);
}
function fireFrameSound(t) {
  const kind = el.soundSelect.value;
  if (kind === 'none' || kind === 'riser') return;
  if (kind === 'custom' && !el.perFrame.checked) return;
  if (kind === 'typewriter') playTypewriter(t);
  else if (kind === 'tick') playTick(t);
  else if (kind === 'camera') playCamera(t);
  else if (kind === 'custom') playCustomBlip(t);
}
async function loadCustomAudio(file) {
  const ac = getAudio(); const buf = await file.arrayBuffer();
  customBuffer = await ac.decodeAudioData(buf);
  setStatus(`Loaded audio "${file.name}".`, 'ok');
}

/* ============================================================================
   PLAYBACK
   ========================================================================== */
let rafId = null, playStart = 0;
function totalFrames() { return Math.max(1, Math.round(+el.fps.value * +el.dur.value)); }
function stopPlayback() { state.playing = false; cancelAnimationFrame(rafId); stopRiser(); el.playBtn.textContent = '▶ Preview'; }

async function playPreview() {
  if (state.playing) { stopPlayback(); return; }
  await ensureFontsReady(); getAudio();
  const fps = +el.fps.value, hold = +el.hold.value, frameMs = 1000/fps, total = totalFrames();
  const kind = el.soundSelect.value;
  if (kind === 'riser') startRiser(+el.dur.value);
  else if (kind === 'custom' && !el.perFrame.checked) playCustomOnce(getAudio().currentTime + 0.02);

  state.playing = true; el.playBtn.textContent = '■ Stop';
  playStart = performance.now(); let lastFF = -1;
  const loop = (now) => {
    if (!state.playing) return;
    const frame = Math.floor((now - playStart) / frameMs);
    if (frame >= total) { drawFrame(Math.floor((total-1)/hold)); stopPlayback(); return; }
    const ff = Math.floor(frame / hold);
    if (ff !== lastFF) {
      drawFrame(ff);
      if (el.perFrame.checked) fireFrameSound(getAudio().currentTime + 0.005);
      lastFF = ff;
    }
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

/* ============================================================================
   VIDEO EXPORT
   ========================================================================== */
function pickMime() {
  const opts = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  for (const o of opts) if (window.MediaRecorder && MediaRecorder.isTypeSupported(o)) return o;
  return '';
}

async function exportVideo() {
  if (state.recording) return;
  if (!window.MediaRecorder) { setStatus('MediaRecorder unsupported in this browser.', 'err'); return; }
  if (state.bg === 'transparent') setStatus('Note: .webm can\'t hold transparency — use PNG frames or Green screen for alpha. Recording on black…', '');
  stopPlayback(); await ensureFontsReady();

  const fps = +el.fps.value, hold = +el.hold.value, total = totalFrames(), kind = el.soundSelect.value;
  const ac = getAudio();
  const videoStream = canvas.captureStream(fps);
  const tracks = [...videoStream.getVideoTracks()];
  if (kind !== 'none') { recordDest = ac.createMediaStreamDestination(); tracks.push(...recordDest.stream.getAudioTracks()); }

  const mixed = new MediaStream(tracks);
  const mime = pickMime();
  const rec = new MediaRecorder(mixed, mime ? { mimeType: mime, videoBitsPerSecond: 12_000_000 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((res) => {
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      downloadBlob(blob, `matchcut-${slug(el.word.value)}-${state.ratio.replace(':','x')}.webm`);
      res();
    };
  });

  state.recording = true; el.recBadge.classList.remove('hidden');
  setExporting(true); setStatus('Recording…', '');
  rec.start();

  const startAudio = ac.currentTime + 0.08;
  if (kind === 'riser') startRiser(+el.dur.value);
  else if (kind === 'custom' && !el.perFrame.checked) playCustomOnce(startAudio);

  const frameMs = 1000/fps, fontFrames = Math.ceil(total/hold);
  if (el.perFrame.checked && ['typewriter','tick','camera','custom'].includes(kind)) {
    for (let ff = 0; ff < fontFrames; ff++) fireFrameSound(startAudio + (ff*hold*frameMs)/1000);
  }

  let lastFF = -1; const t0 = performance.now();
  await new Promise((res) => {
    const loop = (now) => {
      const frame = Math.floor((now - t0)/frameMs);
      if (frame >= total) { drawFrame(fontFrames-1); res(); return; }
      const ff = Math.floor(frame/hold);
      if (ff !== lastFF) { drawFrame(ff); lastFF = ff; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await new Promise((r) => setTimeout(r, 240));
  rec.stop(); stopRiser(); await done;

  recordDest = null; state.recording = false; el.recBadge.classList.add('hidden');
  setExporting(false); setStatus('Exported .webm ✓ (check your downloads)', 'ok');
}

/* ============================================================================
   PNG FRAMES EXPORT  (real .zip, STORE method — no libraries)
   ========================================================================== */
async function exportFrames() {
  stopPlayback(); await ensureFontsReady();
  const hold = +el.hold.value, total = totalFrames();
  const fontFrames = Math.min(240, Math.ceil(total/hold));
  setExporting(true); setStatus(`Rendering ${fontFrames} frames…`, '');

  const files = [];
  for (let i = 0; i < fontFrames; i++) {
    drawFrame(i);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const data = new Uint8Array(await blob.arrayBuffer());
    files.push({ name: `frame-${String(i).padStart(3,'0')}.png`, data });
    if (i % 10 === 0) { setStatus(`Rendering frame ${i+1}/${fontFrames}…`, ''); await new Promise(r=>setTimeout(r)); }
  }
  const zip = makeZip(files);
  downloadBlob(new Blob([zip], { type: 'application/zip' }), `matchcut-${slug(el.word.value)}-frames.zip`);
  setExporting(false);
  setStatus(`Exported ${fontFrames} PNG frames as .zip ✓${state.bg==='transparent'?' (with transparency)':''}`, 'ok');
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function makeZip(files) {
  const enc = new TextEncoder();
  const locals = [], centrals = []; let offset = 0;
  const u16 = (n) => [n & 255, (n>>8)&255];
  const u32 = (n) => [n&255, (n>>8)&255, (n>>16)&255, (n>>24)&255];
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const local = [].concat([0x50,0x4b,0x03,0x04], u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
    const localBuf = new Uint8Array(local.length + name.length + data.length);
    localBuf.set(local, 0); localBuf.set(name, local.length); localBuf.set(data, local.length + name.length);
    locals.push(localBuf);
    const central = [].concat([0x50,0x4b,0x01,0x02], u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset));
    const centralBuf = new Uint8Array(central.length + name.length);
    centralBuf.set(central, 0); centralBuf.set(name, central.length);
    centrals.push(centralBuf);
    offset += localBuf.length;
  }
  const centralSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = new Uint8Array([].concat([0x50,0x4b,0x05,0x06], u16(0), u16(0),
    u16(files.length), u16(files.length), u32(centralSize), u32(offset), u16(0)));
  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total); let p = 0;
  for (const b of locals) { out.set(b, p); p += b.length; }
  for (const b of centrals) { out.set(b, p); p += b.length; }
  out.set(end, p);
  return out;
}

/* ============================================================================
   HELPERS
   ========================================================================== */
function shuffle(a) { for (let i = a.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; } }
function roundRect(c,x,y,w,h,r) { r=Math.min(r,w/2,h/2); c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
function escapeHtml(s) { return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function hexToRgba(hex, a) { const h = hex.replace('#',''); const n = parseInt(h.slice(0,6), 16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }
function slug(s) { return (s||'word').replace(/[^a-z0-9]/gi,'_').slice(0,40); }
function setStatus(msg, cls) { el.status.textContent = msg; el.status.className = 'status' + (cls ? ' '+cls : ''); }
function setExporting(on) { [el.exportBtn, el.framesBtn, el.frameBtn, el.playBtn].forEach(b => b.disabled = on); }
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ============================================================================
   WIRING
   ========================================================================== */
function bind() {
  el.fps.oninput = () => el.fpsVal.textContent = el.fps.value;
  el.hold.oninput = () => el.holdVal.textContent = el.hold.value;
  el.dur.oninput = () => el.durVal.textContent = (+el.dur.value).toFixed(1) + 's';
  el.vol.oninput = () => el.volVal.textContent = el.vol.value;
  el.blurRange.oninput = () => { el.blurVal.textContent = el.blurRange.value; drawPreviewFrame(0); };

  ['input','change'].forEach(ev =>
    [el.word, el.paper, el.ink, el.highlight, el.filler, el.grain, el.jitter, el.flash, el.upper]
      .forEach(c => c.addEventListener(ev, () => drawPreviewFrame(0))));

  segmented('ratioGroup', (b) => { state.ratio = b.dataset.ratio; applyRatio(); drawPreviewFrame(0); });
  segmented('qualityGroup', (b) => { state.quality = +b.dataset.q; applyRatio(); drawPreviewFrame(0); });
  segmented('hlStyleGroup', (b) => { state.hlStyle = b.dataset.hl; drawPreviewFrame(0); });
  segmented('bgGroup', (b) => {
    state.bg = b.dataset.bg;
    const d = BG_DEFAULTS[state.bg];
    if (d.paper !== '#00000000') el.paper.value = d.paper;
    el.ink.value = d.ink; el.bgNote.textContent = d.note;
    el.filler.parentElement.style.opacity = state.bg === 'newspaper' ? '1' : '0.45';
    applyRatio(); drawPreviewFrame(0);
  });

  // duration presets
  document.getElementById('durPresets').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    el.dur.value = b.dataset.dur; el.dur.dispatchEvent(new Event('input'));
  });

  el.shuffle.addEventListener('change', () => { rebuildFontOrder(); drawPreviewFrame(0); });
  el.fontFiles.addEventListener('change', (e) => { if (e.target.files.length) handleFontUpload([...e.target.files]); });

  el.soundSelect.addEventListener('change', () => {
    const custom = el.soundSelect.value === 'custom';
    el.soundFile.classList.toggle('hidden', !custom);
    el.soundHint.textContent = custom
      ? 'Uploaded audio triggers per frame, or plays once if "Every frame" is off.'
      : el.soundSelect.value === 'riser' ? 'Plays once across the whole clip.'
      : 'A sound fires on each font change.';
  });
  el.soundFile.addEventListener('change', (e) => { if (e.target.files[0]) loadCustomAudio(e.target.files[0]); });

  el.playBtn.addEventListener('click', () => playPreview());
  el.exportBtn.addEventListener('click', () => exportVideo().catch(err => {
    console.error(err); setStatus('Export failed: ' + err.message, 'err');
    state.recording = false; el.recBadge.classList.add('hidden'); setExporting(false);
  }));
  el.framesBtn.addEventListener('click', () => exportFrames().catch(err => {
    console.error(err); setStatus('Frame export failed: ' + err.message, 'err'); setExporting(false);
  }));
  el.frameBtn.addEventListener('click', () => {
    canvas.toBlob((b) => downloadBlob(b, `matchcut-${slug(el.word.value)}-frame.png`), 'image/png');
  });

  document.addEventListener('pointerdown', () => { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); }, { once: true });
}

function segmented(id, cb) {
  const group = document.getElementById(id);
  group.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    [...group.children].forEach(x => x.classList.remove('active'));
    b.classList.add('active'); cb(b);
  });
}

/* ---------- boot ---------- */
(async function init() {
  bind(); initFonts(); applyRatio();
  await ensureFontsReady(); drawFrame(0);
  setStatus('Ready. Upload fonts, then Preview or Export.', '');
})();
