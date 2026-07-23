/* ============================================================================
   Match Cut Studio — text match-cut video generator
   100% client-side: canvas rendering + Web Audio + MediaRecorder.
   Nothing leaves the browser.
   ========================================================================== */

'use strict';

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const ctx = canvas.getContext('2d');

const el = {
  word: $('wordInput'),
  fps: $('fpsInput'), fpsVal: $('fpsVal'),
  hold: $('holdInput'), holdVal: $('holdVal'),
  dur: $('durInput'), durVal: $('durVal'),
  paper: $('paperColor'), highlight: $('highlightColor'),
  filler: $('fillerToggle'), grain: $('grainToggle'),
  jitter: $('jitterToggle'), upper: $('uppercaseToggle'),
  fontFiles: $('fontFiles'), fontChips: $('fontChips'), fontCount: $('fontCount'),
  shuffle: $('shuffleFonts'),
  soundSelect: $('soundSelect'), soundFile: $('soundFile'),
  vol: $('volInput'), volVal: $('volVal'),
  perFrame: $('perFrameSound'), soundHint: $('soundHint'),
  playBtn: $('playBtn'), exportBtn: $('exportBtn'), frameBtn: $('frameBtn'),
  status: $('status'), recBadge: $('recBadge'),
};

/* ---------- State ---------- */
const state = {
  ratio: '9:16',
  hlStyle: 'box',
  fonts: [],          // {name, source:'builtin'|'user'}
  fontOrder: [],      // shuffled indices
  playing: false,
  recording: false,
};

/* ---------- Built-in fonts (widely available system faces + Google links) --- */
const BUILTIN_FONTS = [
  // Google fonts requested in index.html <link> (load if online)
  'Anton', 'Archivo Black', 'Bebas Neue', 'Bodoni Moda', 'Cinzel', 'Courier Prime',
  'DM Serif Display', 'Fraunces', 'Libre Baskerville', 'Lobster', 'Merriweather',
  'Oswald', 'Pacifico', 'Playfair Display', 'Roboto Slab', 'Rye', 'Special Elite',
  'Staatliches', 'Ultra', 'Yeseva One',
  // System fallbacks that exist on most machines (guaranteed offline variety)
  'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Arial Black',
  'Verdana', 'Trebuchet MS', 'Palatino Linotype', 'Garamond', 'Book Antiqua',
  'Comic Sans MS', 'Brush Script MT', 'Franklin Gothic Medium', 'Consolas',
  'Rockwell', 'Baskerville', 'Didot', 'Copperplate', 'Futura', 'Menlo',
];

/* ---------- Filler word pool (newspaper look) ---------- */
const FILLER = ('the of and to in a is that for it as was with he his on be at by i this had not are but from or have '
+ 'an they which one you were her all she there would their we him been has when who will more no if out so said what up '
+ 'its about into than them can only other new some could time these two may then do first any my now such like our over '
+ 'man me even most made after also did many before must through back years where much your way well down should because '
+ 'each just those people mr how too little state good very make world still own see men work long get here between both '
+ 'life being under never day same another know while last might great old year off come since against go came right used '
+ 'take three states himself few house use during without again place american around however home small found thought '
+ 'went say part once general high upon school every don does got united left number course war until always away something '
+ 'fact though water less public put think almost hand enough far took head yet government system set told nothing night '
+ 'end why called didnt eyes find going look asked later knew').split(' ');

/* ============================================================================
   FONT MANAGEMENT
   ========================================================================== */
function initFonts() {
  BUILTIN_FONTS.forEach((name) => state.fonts.push({ name, source: 'builtin' }));
  rebuildFontOrder();
  renderFontChips();
}

function rebuildFontOrder() {
  state.fontOrder = state.fonts.map((_, i) => i);
  if (el.shuffle.checked) shuffle(state.fontOrder);
}

function renderFontChips() {
  const userFonts = state.fonts.filter((f) => f.source === 'user');
  el.fontCount.textContent = `${state.fonts.length} fonts loaded`;
  el.fontChips.innerHTML = '';
  if (userFonts.length) {
    userFonts.forEach((f) => {
      const c = document.createElement('span');
      c.className = 'chip user';
      c.innerHTML = `<b>${escapeHtml(f.name)}</b>`;
      el.fontChips.appendChild(c);
    });
  }
  const note = document.createElement('span');
  note.className = 'chip';
  note.textContent = `+ ${state.fonts.filter(f => f.source==='builtin').length} built-in`;
  el.fontChips.appendChild(note);
}

async function handleFontUpload(files) {
  for (const file of files) {
    const family = 'user-' + file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/gi, '_');
    try {
      const buf = await file.arrayBuffer();
      const face = new FontFace(family, buf);
      await face.load();
      document.fonts.add(face);
      state.fonts.push({ name: family, source: 'user' });
    } catch (e) {
      setStatus(`Could not load font "${file.name}"`, 'err');
    }
  }
  rebuildFontOrder();
  renderFontChips();
  setStatus(`Added ${files.length} font(s).`, 'ok');
  drawPreviewFrame(0);
}

/* Wait until (best effort) fonts are ready so canvas measures them correctly */
async function ensureFontsReady() {
  try { await document.fonts.ready; } catch (_) {}
}

/* ============================================================================
   RENDERING
   ========================================================================== */
function dims() {
  switch (state.ratio) {
    case '16:9': return [1280, 720];
    case '1:1':  return [900, 900];
    case '4:5':  return [864, 1080];
    default:     return [720, 1280]; // 9:16
  }
}

function applyRatio() {
  const [w, h] = dims();
  canvas.width = w;
  canvas.height = h;
}

/* Deterministic pseudo-random so a given frame index looks stable while
   scrubbing but each frame differs. */
function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function currentWord() {
  let w = el.word.value || 'MATCH';
  if (el.upper.checked) w = w.toUpperCase();
  return w;
}

function fontFor(frameIndex) {
  if (!state.fontOrder.length) return 'sans-serif';
  const idx = state.fontOrder[frameIndex % state.fontOrder.length];
  return `"${state.fonts[idx].name}"`;
}

function drawFrame(frameIndex) {
  const [W, H] = [canvas.width, canvas.height];
  const rand = rng(frameIndex * 2654435761 + 12345);
  const word = currentWord();
  const font = fontFor(frameIndex);

  // paper background
  ctx.fillStyle = el.paper.value;
  ctx.fillRect(0, 0, W, H);

  // subtle paper tone gradient
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, 'rgba(0,0,0,0.02)');
  g.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const inkColor = '#1a1a1a';
  const baseSize = Math.min(W, H);

  // --- background filler text (newspaper columns) ---
  if (el.filler.checked) {
    const lineH = baseSize * 0.045;
    const fillerFont = font; // same mismatched font as the hero word for cohesion
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    let y = lineH;
    let li = 0;
    while (y < H + lineH) {
      const fs = lineH * (0.62 + rand() * 0.12);
      ctx.font = `${fs}px ${fillerFont}`;
      ctx.fillStyle = `rgba(26,26,26,${0.28 + rand() * 0.22})`;
      let x = W * 0.06 * (rand() * 0.6);
      let line = '';
      while (x < W * 0.94) {
        const wd = FILLER[Math.floor(rand() * FILLER.length)];
        const piece = (li % 6 === 3 && line.split(' ').length === 3) ? word : wd;
        const m = ctx.measureText(piece + ' ').width;
        if (x + m > W * 0.96) break;
        ctx.fillText(piece, x, y);
        x += m;
        line += piece + ' ';
      }
      y += lineH * (0.95 + rand() * 0.2);
      li++;
    }
    // fade filler toward the center so the hero word reads clearly
    const vg = ctx.createRadialGradient(W/2, H/2, baseSize*0.05, W/2, H/2, baseSize*0.5);
    vg.addColorStop(0, hexToRgba(el.paper.value, 0.92));
    vg.addColorStop(0.55, hexToRgba(el.paper.value, 0.55));
    vg.addColorStop(1, hexToRgba(el.paper.value, 0));
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  // --- hero word ---
  const jitterX = el.jitter.checked ? (rand() - 0.5) * W * 0.05 : 0;
  const jitterY = el.jitter.checked ? (rand() - 0.5) * H * 0.03 : 0;
  const rot = el.jitter.checked ? (rand() - 0.5) * 0.05 : 0;
  const cx = W / 2 + jitterX;
  const cy = H / 2 + jitterY;

  // fit font size to width
  let size = baseSize * 0.22;
  ctx.font = `${size}px ${font}`;
  let tw = ctx.measureText(word).width;
  const maxW = W * 0.82;
  if (tw > maxW) { size *= maxW / tw; ctx.font = `${size}px ${font}`; tw = ctx.measureText(word).width; }
  if (tw < maxW * 0.45) { size *= (maxW * 0.6) / tw; ctx.font = `${size}px ${font}`; tw = ctx.measureText(word).width; }

  const th = size;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const padX = size * 0.14, padY = size * 0.12;
  const boxX = -tw / 2 - padX, boxY = -th / 2 - padY;
  const boxW = tw + padX * 2, boxH = th + padY * 2;

  if (state.hlStyle === 'box') {
    ctx.fillStyle = el.highlight.value;
    roundRect(ctx, boxX, boxY, boxW, boxH, size * 0.06);
    ctx.fill();
    ctx.fillStyle = inkColor;
    ctx.fillText(word, 0, 0);
  } else if (state.hlStyle === 'underline') {
    ctx.fillStyle = inkColor;
    ctx.fillText(word, 0, 0);
    ctx.fillStyle = el.highlight.value;
    ctx.fillRect(-tw / 2, th * 0.42, tw, size * 0.1);
  } else if (state.hlStyle === 'invert') {
    ctx.fillStyle = inkColor;
    roundRect(ctx, boxX, boxY, boxW, boxH, size * 0.04);
    ctx.fill();
    ctx.fillStyle = el.highlight.value;
    ctx.fillText(word, 0, 0);
  } else {
    ctx.fillStyle = inkColor;
    ctx.fillText(word, 0, 0);
  }
  ctx.restore();

  // --- grain ---
  if (el.grain.checked) drawGrain(W, H, frameIndex);

  // vignette
  const vig = ctx.createRadialGradient(W/2, H/2, baseSize*0.35, W/2, H/2, baseSize*0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

let grainCanvas = null;
function drawGrain(W, H, seed) {
  // reuse a small noise tile scaled up — cheap and looks like film grain
  if (!grainCanvas) {
    grainCanvas = document.createElement('canvas');
    grainCanvas.width = 128; grainCanvas.height = 128;
  }
  const gc = grainCanvas.getContext('2d');
  const img = gc.createImageData(128, 128);
  const r = rng(seed + 7);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + Math.floor(r() * 135);
    img.data[i] = img.data[i+1] = img.data[i+2] = v;
    img.data[i+3] = 14; // low alpha
  }
  gc.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  const pat = ctx.createPattern(grainCanvas, 'repeat');
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawPreviewFrame(i) {
  ensureFontsReady().then(() => drawFrame(i));
}

/* ============================================================================
   AUDIO ENGINE
   ========================================================================== */
let audioCtx = null;
let customBuffer = null;
let recordDest = null; // MediaStreamAudioDestinationNode used while recording

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function masterGain() { return el.vol.value / 100; }

/* route a node to speakers and (if recording) the capture destination */
function connectOut(node) {
  node.connect(getAudio().destination);
  if (recordDest) node.connect(recordDest);
}

function playTypewriter(t) {
  const ac = getAudio();
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9 * masterGain(), t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  // noise burst
  const buf = ac.createBuffer(1, ac.sampleRate * 0.08, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ac.createBufferSource(); src.buffer = buf;
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
  // low thunk
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
  osc.frequency.setValueAtTime(2600, t);
  osc.frequency.exponentialRampToValueAtTime(900, t + 0.03);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.6 * masterGain(), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.connect(g); connectOut(g);
  osc.start(t); osc.stop(t + 0.06);
}

let riserOsc = null, riserGain = null;
function startRiser(duration) {
  const ac = getAudio();
  const t = ac.currentTime;
  riserOsc = ac.createOscillator(); riserOsc.type = 'sawtooth';
  riserOsc.frequency.setValueAtTime(80, t);
  riserOsc.frequency.exponentialRampToValueAtTime(1200, t + duration);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(300, t);
  lp.frequency.exponentialRampToValueAtTime(6000, t + duration);
  riserGain = ac.createGain();
  riserGain.gain.setValueAtTime(0.0001, t);
  riserGain.gain.exponentialRampToValueAtTime(0.35 * masterGain(), t + duration * 0.9);
  riserGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  riserOsc.connect(lp); lp.connect(riserGain); connectOut(riserGain);
  riserOsc.start(t); riserOsc.stop(t + duration + 0.05);
}
function stopRiser() { try { riserOsc && riserOsc.stop(); } catch(_){} riserOsc = null; }

function playCustomOnce(t) {
  if (!customBuffer) return;
  const ac = getAudio();
  const src = ac.createBufferSource(); src.buffer = customBuffer;
  const g = ac.createGain(); g.gain.value = masterGain();
  src.connect(g); connectOut(g);
  src.start(t);
}

function playCustomBlip(t) {
  if (!customBuffer) return;
  const ac = getAudio();
  const src = ac.createBufferSource(); src.buffer = customBuffer;
  const g = ac.createGain();
  g.gain.setValueAtTime(masterGain(), t);
  g.gain.setValueAtTime(masterGain(), t + 0.09);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  src.connect(g); connectOut(g);
  src.start(t, 0, 0.15);
}

/* Fire the per-frame sound for a given kind at audio-time t */
function fireFrameSound(t) {
  const kind = el.soundSelect.value;
  if (kind === 'none' || kind === 'riser') return;
  if (!el.perFrame.checked && kind === 'custom') return;
  switch (kind) {
    case 'typewriter': playTypewriter(t); break;
    case 'tick': playTick(t); break;
    case 'custom': playCustomBlip(t); break;
  }
}

async function loadCustomAudio(file) {
  const ac = getAudio();
  const buf = await file.arrayBuffer();
  customBuffer = await ac.decodeAudioData(buf);
  setStatus(`Loaded audio "${file.name}".`, 'ok');
}

/* ============================================================================
   PLAYBACK (preview)
   ========================================================================== */
let rafId = null;
let playStart = 0;

function totalFrames() {
  const fps = +el.fps.value;
  return Math.max(1, Math.round(fps * +el.dur.value));
}

function stopPlayback() {
  state.playing = false;
  cancelAnimationFrame(rafId);
  stopRiser();
  el.playBtn.textContent = '▶ Preview';
}

async function playPreview() {
  if (state.playing) { stopPlayback(); return; }
  await ensureFontsReady();
  getAudio();
  const fps = +el.fps.value;
  const hold = +el.hold.value;
  const frameMs = 1000 / fps;
  const total = totalFrames();

  const kind = el.soundSelect.value;
  if (kind === 'riser') startRiser(+el.dur.value);
  else if (kind === 'custom' && !el.perFrame.checked) playCustomOnce(getAudio().currentTime + 0.02);

  state.playing = true;
  el.playBtn.textContent = '■ Stop';
  playStart = performance.now();
  let lastFontFrame = -1;

  const loop = (now) => {
    if (!state.playing) return;
    const elapsed = now - playStart;
    const frame = Math.floor(elapsed / frameMs);
    if (frame >= total) { drawFrame(Math.floor((total - 1) / hold)); stopPlayback(); return; }
    const fontFrame = Math.floor(frame / hold);
    if (fontFrame !== lastFontFrame) {
      drawFrame(fontFrame);
      if (el.perFrame.checked) fireFrameSound(getAudio().currentTime + 0.005);
      lastFontFrame = fontFrame;
    }
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

/* ============================================================================
   VIDEO EXPORT (MediaRecorder)
   ========================================================================== */
function pickMime() {
  const opts = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const o of opts) if (window.MediaRecorder && MediaRecorder.isTypeSupported(o)) return o;
  return '';
}

async function exportVideo() {
  if (state.recording) return;
  if (!window.MediaRecorder) { setStatus('MediaRecorder not supported in this browser.', 'err'); return; }
  stopPlayback();
  await ensureFontsReady();

  const fps = +el.fps.value;
  const hold = +el.hold.value;
  const total = totalFrames();
  const kind = el.soundSelect.value;

  const ac = getAudio();
  const videoStream = canvas.captureStream(fps);
  const tracks = [...videoStream.getVideoTracks()];

  // audio: route synth/custom into a capture destination
  if (kind !== 'none') {
    recordDest = ac.createMediaStreamDestination();
    tracks.push(...recordDest.stream.getAudioTracks());
  }

  const mixed = new MediaStream(tracks);
  const mime = pickMime();
  const rec = new MediaRecorder(mixed, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  const done = new Promise((resolve) => {
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `matchcut-${(el.word.value||'word').replace(/[^a-z0-9]/gi,'_')}-${state.ratio.replace(':','x')}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      resolve();
    };
  });

  state.recording = true;
  el.recBadge.classList.remove('hidden');
  el.exportBtn.disabled = true;
  el.playBtn.disabled = true;
  setStatus('Recording…', '');

  rec.start();

  // schedule audio relative to context clock so it lines up with frames
  const startAudio = ac.currentTime + 0.08;
  if (kind === 'riser') startRiser(+el.dur.value);
  else if (kind === 'custom' && !el.perFrame.checked) playCustomOnce(startAudio);

  const frameMs = 1000 / fps;
  const t0 = performance.now();
  const fontFrames = Math.ceil(total / hold);

  // pre-schedule per-frame sounds on the audio clock for tight sync
  if (el.perFrame.checked && (kind === 'typewriter' || kind === 'tick' || kind === 'custom')) {
    for (let ff = 0; ff < fontFrames; ff++) {
      fireFrameSound(startAudio + (ff * hold * frameMs) / 1000);
    }
  }

  let lastFontFrame = -1;
  await new Promise((resolve) => {
    const loop = (now) => {
      const elapsed = now - t0;
      const frame = Math.floor(elapsed / frameMs);
      if (frame >= total) { drawFrame(fontFrames - 1); resolve(); return; }
      const fontFrame = Math.floor(frame / hold);
      if (fontFrame !== lastFontFrame) { drawFrame(fontFrame); lastFontFrame = fontFrame; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });

  // small tail so the last frame/sound is captured
  await new Promise((r) => setTimeout(r, 220));
  rec.stop();
  stopRiser();
  await done;

  recordDest = null;
  state.recording = false;
  el.recBadge.classList.add('hidden');
  el.exportBtn.disabled = false;
  el.playBtn.disabled = false;
  setStatus('Exported .webm ✓  (check your downloads)', 'ok');
}

/* ============================================================================
   HELPERS
   ========================================================================== */
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
function escapeHtml(s) { return s.replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function hexToRgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }
function setStatus(msg, cls) { el.status.textContent = msg; el.status.className = 'status' + (cls ? ' ' + cls : ''); }

/* ============================================================================
   WIRING
   ========================================================================== */
function bind() {
  // sliders with live labels
  el.fps.oninput = () => { el.fpsVal.textContent = el.fps.value; };
  el.hold.oninput = () => { el.holdVal.textContent = el.hold.value; };
  el.dur.oninput = () => { el.durVal.textContent = (+el.dur.value).toFixed(1); };
  el.vol.oninput = () => { el.volVal.textContent = el.vol.value; };

  // redraw-on-change controls
  ['input','change'].forEach(ev => {
    [el.word, el.paper, el.highlight, el.filler, el.grain, el.jitter, el.upper]
      .forEach(c => c.addEventListener(ev, () => drawPreviewFrame(0)));
  });

  // ratio segmented
  $('ratioGroup').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    [...e.currentTarget.children].forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    state.ratio = b.dataset.ratio;
    applyRatio(); drawPreviewFrame(0);
  });

  // highlight style segmented
  $('hlStyleGroup').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    [...e.currentTarget.children].forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    state.hlStyle = b.dataset.hl;
    drawPreviewFrame(0);
  });

  el.shuffle.addEventListener('change', () => { rebuildFontOrder(); drawPreviewFrame(0); });
  el.fontFiles.addEventListener('change', (e) => { if (e.target.files.length) handleFontUpload([...e.target.files]); });

  // sound select
  el.soundSelect.addEventListener('change', () => {
    const custom = el.soundSelect.value === 'custom';
    el.soundFile.classList.toggle('hidden', !custom);
    el.soundHint.textContent = custom
      ? 'Uploaded audio will trigger per frame (short blips) or, if "every frame" is off, play once from the start.'
      : 'A sound fires on each font change. Riser plays once across the whole clip.';
  });
  el.soundFile.addEventListener('change', (e) => { if (e.target.files[0]) loadCustomAudio(e.target.files[0]); });

  el.playBtn.addEventListener('click', () => playPreview());
  el.exportBtn.addEventListener('click', () => exportVideo().catch(err => {
    console.error(err); setStatus('Export failed: ' + err.message, 'err');
    state.recording = false; el.recBadge.classList.add('hidden');
    el.exportBtn.disabled = false; el.playBtn.disabled = false;
  }));
  el.frameBtn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `matchcut-frame.png`;
    a.click();
  });

  // resume audio on first interaction (autoplay policies)
  document.addEventListener('pointerdown', () => { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); }, { once: true });
}

/* ---------- boot ---------- */
(async function init() {
  bind();
  initFonts();
  applyRatio();
  await ensureFontsReady();
  drawFrame(0);
  setStatus('Ready. Upload your fonts, then Preview or Export.', '');
})();
