import './style.css';
import { detectBlobs, resetFrameHistory } from './blobDetector.js';
import { applyFilterToRegion } from './filters.js';
import { drawOverlays } from './overlays.js';
import { trackBlobs, resetTracker } from './kalman.js';
import { applyVoronoi, resetVoronoi } from './voronoi.js';
import { applyCA, resetCA } from './cellular.js';
import { applyASCII } from './ascii.js';
import { applyGLFilter } from './glFilters.js';
import { applyWave, resetWave } from './wave.js';

// ---- Defaults (single source of truth) ----
const DEFAULTS = Object.freeze({
  speed: 1,
  shape: 'rect',
  regionStyle: 'basic',
  filter: 'none',
  voronoiThreshold: 0.5, voronoiJumpDist: 0.5, voronoiFalloff: 0.5, voronoiEdgeLines: 0.0,
  caDensity: 0.5, caStability: 0.5, caEvolutionSpeed: 0.5, caSourceInflux: 0.5,
  asciiCellSize: 0.3, asciiContrast: 0.3, asciiBlackThresh: 0.2, asciiGlyphStrength: 0.9,
  shatterCells: 0.3, shatterCrack: 0.2, shatterFill: 0.5, shatterRandom: 0.8,
  erodeMode: 0,      erodeRadius: 0.3,  erodeStrength: 0.7, erodeEdge: 0.0,
  oxideCorr: 0.5,    oxideMetal: 0.0,   oxideRough: 0.3,    oxideSheen: 0.3,
  synthWarm: 0.5,    synthSep: 0.3,     synthRes: 0.4,      synthDyn: 0.7,
  biolumGlow: 0.7,   biolumColor: 0.0,  biolumPulse: 0.2,   biolumDepth: 0.7,
  thermoCont: 0.4,   thermoHot: 0.0,    thermoCold: 0.1,    thermoWhite: 0.5,
  falsePalette: 0.25, falseBand: 0,     falseBandCnt: 0.5,  falseBright: 0.5,
  waveSource: 0.5,   waveDamp: 0.3,     waveSpeed: 0.5,     waveContr: 0.5,
  connectionRate: 0.25,
  threshold: 30,
  maxBlobs: 12,
  detectMode: 'motion',
  updateInterval: 1,
  strokeWidth: 1,
  blobSize: 64,
  fontSize: 11,
  overlayColor: '#ffffff',
});

const STORAGE_KEY = 'fluxkit-state-v1';

const state = { ...DEFAULTS, hasSource: false };

let frameCount  = 0;
let cachedBlobs = [];
let rafHandle   = 0;

// ---- DOM refs ----
const video       = document.getElementById('video');
const canvas      = document.getElementById('main-canvas');
const ctx         = canvas.getContext('2d', { willReadFrequently: true });
const placeholder = document.getElementById('placeholder');
const fileInput   = document.getElementById('file-input');
const canvasArea  = document.getElementById('canvas-area');
const fileStatus  = document.getElementById('file-status');
const toastRegion = document.getElementById('toast-region');
const btnSnapshot = document.getElementById('btn-snapshot');
const btnReset    = document.getElementById('btn-reset');

// ---- Offscreen canvas for half-res blob detection ----
const offscreen = document.createElement('canvas');
const offCtx    = offscreen.getContext('2d', { willReadFrequently: true });
const DETECT_SCALE = 0.5;

// ---- Toast (accessible inline notifications, replaces alert()) ----
function showToast(message, kind = 'info', timeoutMs = 4000) {
  const node = document.createElement('div');
  node.className = `toast toast-${kind}`;
  node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  node.textContent = message;
  toastRegion.appendChild(node);
  setTimeout(() => node.remove(), timeoutMs);
}

// ---- Configs driving slider + toggle wiring ----
// Each slider: [inputId, stateKey, parser]
const SLIDER_CONFIG = [
  ['voronoi-threshold',   'voronoiThreshold',   parseFloat],
  ['voronoi-jump-dist',   'voronoiJumpDist',    parseFloat],
  ['voronoi-falloff',     'voronoiFalloff',     parseFloat],
  ['voronoi-edge-lines',  'voronoiEdgeLines',   parseFloat],
  ['ca-density',          'caDensity',          parseFloat],
  ['ca-stability',        'caStability',        parseFloat],
  ['ca-evolution-speed',  'caEvolutionSpeed',   parseFloat],
  ['ca-source-influx',    'caSourceInflux',     parseFloat],
  ['ascii-cell-size',     'asciiCellSize',      parseFloat],
  ['ascii-contrast',      'asciiContrast',      parseFloat],
  ['ascii-black-thresh',  'asciiBlackThresh',   parseFloat],
  ['ascii-glyph-strength','asciiGlyphStrength', parseFloat],
  ['shatter-cells',       'shatterCells',       parseFloat],
  ['shatter-crack',       'shatterCrack',       parseFloat],
  ['shatter-fill',        'shatterFill',        parseFloat],
  ['shatter-random',      'shatterRandom',      parseFloat],
  ['erode-radius',        'erodeRadius',        parseFloat],
  ['erode-strength',      'erodeStrength',      parseFloat],
  ['erode-edge',          'erodeEdge',          parseFloat],
  ['oxide-corr',          'oxideCorr',          parseFloat],
  ['oxide-metal',         'oxideMetal',         parseFloat],
  ['oxide-rough',         'oxideRough',         parseFloat],
  ['oxide-sheen',         'oxideSheen',         parseFloat],
  ['synth-warm',          'synthWarm',          parseFloat],
  ['synth-sep',           'synthSep',           parseFloat],
  ['synth-res',           'synthRes',           parseFloat],
  ['synth-dyn',           'synthDyn',           parseFloat],
  ['biolum-glow',         'biolumGlow',         parseFloat],
  ['biolum-color',        'biolumColor',        parseFloat],
  ['biolum-pulse',        'biolumPulse',        parseFloat],
  ['biolum-depth',        'biolumDepth',        parseFloat],
  ['thermo-cont',         'thermoCont',         parseFloat],
  ['thermo-hot',          'thermoHot',          parseFloat],
  ['thermo-cold',         'thermoCold',         parseFloat],
  ['thermo-white',        'thermoWhite',        parseFloat],
  ['false-palette',       'falsePalette',       parseFloat],
  ['false-bandcnt',       'falseBandCnt',       parseFloat],
  ['false-bright',        'falseBright',        parseFloat],
  ['wave-source',         'waveSource',         parseFloat],
  ['wave-damp',           'waveDamp',           parseFloat],
  ['wave-speed',          'waveSpeed',          parseFloat],
  ['wave-contr',          'waveContr',          parseFloat],
  ['connection-rate',     'connectionRate',     parseFloat],
  ['sensitivity',         'threshold',          parseFloat],
  ['max-blobs',           'maxBlobs',           parseInt],
  ['update-interval',     'updateInterval',     parseInt],
  ['stroke-width',        'strokeWidth',        parseFloat],
  ['font-size',           'fontSize',           parseInt],
];

const GL_SECTIONS    = ['voronoi','cellular','ascii','shatter','erode','wave','oxide','synth','biolum','thermo','falsecolor'];
const FULL_FRAME_SET = new Set(GL_SECTIONS);
const GL_RESETS      = { voronoi: resetVoronoi, cellular: resetCA, wave: resetWave };

// Each toggle group: [groupId, stateKey, parser, onChangeFn?]
const TOGGLE_CONFIG = [
  ['speed-group',       'speed',       parseFloat, (v) => { video.playbackRate = v; }],
  ['shape-group',       'shape',       String,     null],
  ['style-group',       'regionStyle', String,     null],
  ['filter-group',      'filter',      String,     onFilterChange],
  ['detect-mode-group', 'detectMode',  String,     () => { resetFrameHistory(); }],
  ['blob-size-group',   'blobSize',    parseInt,   null],
  ['erode-mode-group',  'erodeMode',   parseInt,   null],
  ['false-band-group',  'falseBand',   parseInt,   null],
];

function onFilterChange(v) {
  for (const name of GL_SECTIONS) {
    const el = document.getElementById(`${name}-controls`);
    if (el) el.classList.toggle('hidden', v !== name);
  }
  for (const [name, fn] of Object.entries(GL_RESETS)) {
    if (v !== name) fn();
  }
  // Bring the newly-revealed panel into view so the user doesn't have to hunt for it.
  const active = document.getElementById(`${v}-controls`);
  if (active && !active.classList.contains('hidden')) {
    active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ---- Wiring ----
function wireSlider(inputId, stateKey, parser) {
  const slider = document.getElementById(inputId);
  const valEl  = document.getElementById(`${inputId}-val`);
  if (!slider) return;
  slider.addEventListener('input', () => {
    state[stateKey] = parser(slider.value);
    if (valEl) valEl.textContent = slider.value;
    schedulePersist();
  });
}

function wireToggleGroup(groupId, stateKey, parser, onChange) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    setToggleGroupValue(groupId, btn.dataset.value);
    state[stateKey] = parser(btn.dataset.value);
    if (onChange) onChange(state[stateKey]);
    schedulePersist();
  });
  group.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const buttons = [...group.querySelectorAll('.toggle-btn')];
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    const next = e.key === 'ArrowRight' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].click();
    e.preventDefault();
  });
}

function setToggleGroupValue(groupId, value) {
  const group = document.getElementById(groupId);
  if (!group) return;
  const buttons = group.querySelectorAll('.toggle-btn');
  const isRadio = group.getAttribute('role') === 'radiogroup';
  buttons.forEach(b => {
    const match = b.dataset.value === String(value);
    b.classList.toggle('active', match);
    if (isRadio) b.setAttribute('aria-checked', match ? 'true' : 'false');
    else         b.setAttribute('aria-pressed', match ? 'true' : 'false');
  });
}

SLIDER_CONFIG.forEach(([id, key, parser]) => wireSlider(id, key, parser));
TOGGLE_CONFIG.forEach(([id, key, parser, onChange]) => wireToggleGroup(id, key, parser, onChange));

const colorPicker = document.getElementById('overlay-color');
const colorLabel  = document.getElementById('overlay-color-val');
colorPicker.addEventListener('input', () => {
  state.overlayColor = colorPicker.value;
  colorLabel.textContent = colorPicker.value;
  schedulePersist();
});

// ---- Apply state to UI (used after restore + reset) ----
function applyStateToUI() {
  for (const [id, key] of SLIDER_CONFIG) {
    const slider = document.getElementById(id);
    const valEl  = document.getElementById(`${id}-val`);
    if (!slider) continue;
    slider.value = String(state[key]);
    if (valEl) valEl.textContent = slider.value;
  }
  for (const [groupId, key, , onChange] of TOGGLE_CONFIG) {
    setToggleGroupValue(groupId, state[key]);
    if (onChange) onChange(state[key]);
  }
  colorPicker.value = state.overlayColor;
  colorLabel.textContent = state.overlayColor;
  video.playbackRate = state.speed;
}

// ---- Persistence (debounced localStorage) ----
let persistTimer = 0;
function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      const { hasSource, ...persistable } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
    } catch { /* quota or disabled — silently ignore */ }
  }, 200);
}

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    for (const k of Object.keys(DEFAULTS)) {
      if (k in parsed) state[k] = parsed[k];
    }
  } catch { /* corrupt — ignore */ }
}

// ---- Reset ----
btnReset.addEventListener('click', () => {
  for (const k of Object.keys(DEFAULTS)) state[k] = DEFAULTS[k];
  applyStateToUI();
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  showToast('Reset to defaults', 'ok', 2500);
});

// ---- Snapshot (canvas → PNG download) ----
btnSnapshot.addEventListener('click', () => {
  if (!state.hasSource) {
    showToast('Load a video or open the camera first', 'error');
    return;
  }
  canvas.toBlob((blob) => {
    if (!blob) { showToast('Snapshot failed', 'error'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `fluxkit-${ts}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Frame saved', 'ok', 2000);
  }, 'image/png');
});

// ---- File upload ----
document.getElementById('btn-upload').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  loadVideoSource(URL.createObjectURL(file), file.name);
});

// ---- Camera ----
document.getElementById('btn-camera').addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
    }
    video.removeAttribute('src');
    video.srcObject = stream;
    await video.play();
    resetAllState();
    setHasSource(true, 'Camera');
    showToast('Camera active', 'ok', 2000);
  } catch (err) {
    showToast(`Camera unavailable: ${err.message || err.name}`, 'error', 6000);
  }
});

// ---- Load video ----
function loadVideoSource(url, label) {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
  video.src = url;
  video.loop = true;
  video.play().catch(() => {});
  resetAllState();
  setHasSource(true, label || 'Video');
}

function resetAllState() {
  resetFrameHistory();
  resetTracker();
  resetVoronoi();
  resetCA();
  resetWave();
  cachedBlobs = [];
  frameCount  = 0;
}

function setHasSource(val, label) {
  state.hasSource = val;
  placeholder.style.display = val ? 'none' : 'flex';
  btnSnapshot.disabled = !val;
  if (val) {
    const dims = (video.videoWidth && video.videoHeight)
      ? ` · ${video.videoWidth}×${video.videoHeight}`
      : '';
    fileStatus.textContent = (label || 'Source loaded') + dims;
    if (val && rafHandle === 0) {
      rafHandle = requestAnimationFrame(renderFrame);
    }
  } else {
    fileStatus.textContent = 'No source loaded';
  }
}

video.addEventListener('loadedmetadata', () => {
  resizeCanvas();
  if (state.hasSource && video.videoWidth && video.videoHeight) {
    const current = fileStatus.textContent.split(' · ')[0];
    fileStatus.textContent = `${current} · ${video.videoWidth}×${video.videoHeight}`;
  }
});

// ---- Canvas sizing ----
function resizeCanvas() {
  const aw = canvasArea.clientWidth;
  const ah = canvasArea.clientHeight;

  if (!state.hasSource || video.videoWidth === 0) {
    canvas.width = aw;
    canvas.height = ah;
    return;
  }

  const vRatio = video.videoWidth / video.videoHeight;
  const aRatio = aw / ah;
  let cw, ch;
  if (aRatio > vRatio) {
    ch = ah; cw = Math.round(ah * vRatio);
  } else {
    cw = aw; ch = Math.round(aw / vRatio);
  }

  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width  = cw;
    canvas.height = ch;
  }
}

window.addEventListener('resize', resizeCanvas);

// ---- Main render loop ----
// rAF only runs while a source is active (gated in setHasSource / renderFrame).
function renderFrame() {
  if (!state.hasSource) {
    rafHandle = 0;
    return;
  }
  rafHandle = requestAnimationFrame(renderFrame);
  resizeCanvas();

  if (video.readyState < 2 || video.videoWidth === 0) return;

  const cw = canvas.width;
  const ch = canvas.height;

  ctx.drawImage(video, 0, 0, cw, ch);

  const ow = Math.max(1, Math.round(cw * DETECT_SCALE));
  const oh = Math.max(1, Math.round(ch * DETECT_SCALE));
  if (offscreen.width !== ow || offscreen.height !== oh) {
    offscreen.width  = ow;
    offscreen.height = oh;
  }
  offCtx.drawImage(video, 0, 0, ow, oh);
  const offImageData = offCtx.getImageData(0, 0, ow, oh);

  frameCount++;
  if (frameCount % state.updateInterval === 0) {
    const rawBlobs  = detectBlobs(offImageData, state.threshold, state.maxBlobs, state.detectMode);
    const sx = cw / ow;
    const sy = ch / oh;
    const scaledRaw = rawBlobs.map(b => ({
      ...b,
      x:  b.x  * sx,
      y:  b.y  * sy,
      w:  b.w  * sx,
      h:  b.h  * sy,
      cx: b.cx * sx,
      cy: b.cy * sy,
    }));
    cachedBlobs = trackBlobs(scaledRaw, cw, state.maxBlobs);
  }
  const blobs = cachedBlobs;

  const f = state.filter;
  if (f === 'voronoi') {
    applyVoronoi(ctx, video, cw, ch, {
      threshold: state.voronoiThreshold, jumpDist: state.voronoiJumpDist,
      falloff:   state.voronoiFalloff,   edgeLines: state.voronoiEdgeLines,
    });
  } else if (f === 'cellular') {
    applyCA(ctx, video, cw, ch, {
      density: state.caDensity, stability: state.caStability,
      evolutionSpeed: state.caEvolutionSpeed, sourceInflux: state.caSourceInflux,
    });
  } else if (f === 'ascii') {
    applyASCII(ctx, video, cw, ch, {
      cellSize: state.asciiCellSize, contrast: state.asciiContrast,
      blackThreshold: state.asciiBlackThresh, glyphStrength: state.asciiGlyphStrength,
    });
  } else if (f === 'wave') {
    applyWave(ctx, video, cw, ch, {
      sourceStrength: state.waveSource, damping: state.waveDamp,
      speed: state.waveSpeed, contrast: state.waveContr,
    });
  } else if (f === 'shatter') {
    applyGLFilter('shatter', ctx, video, cw, ch, [state.shatterCells, state.shatterCrack, state.shatterFill, state.shatterRandom]);
  } else if (f === 'erode') {
    applyGLFilter('erode',   ctx, video, cw, ch, [state.erodeMode, state.erodeRadius, state.erodeStrength, state.erodeEdge]);
  } else if (f === 'oxide') {
    applyGLFilter('oxide',   ctx, video, cw, ch, [state.oxideCorr, state.oxideMetal, state.oxideRough, state.oxideSheen]);
  } else if (f === 'synth') {
    applyGLFilter('synth',   ctx, video, cw, ch, [state.synthWarm, state.synthSep, state.synthRes, state.synthDyn]);
  } else if (f === 'biolum') {
    applyGLFilter('biolum',  ctx, video, cw, ch, [state.biolumGlow, state.biolumColor, state.biolumPulse, state.biolumDepth]);
  } else if (f === 'thermo') {
    applyGLFilter('thermo',  ctx, video, cw, ch, [state.thermoCont, state.thermoHot, state.thermoCold, state.thermoWhite]);
  } else if (f === 'falsecolor') {
    applyGLFilter('falsecolor', ctx, video, cw, ch, [state.falsePalette, state.falseBand, state.falseBandCnt, state.falseBright]);
  }

  // Per-blob CPU filters: getImageData/putImageData per blob is a known pipeline
  // stall (CPU<->GPU round-trip per region). Acceptable for the current
  // architecture because it only runs for non-GL filters; if blob counts grow
  // large, batch into a single full-frame getImageData read.
  if (state.filter !== 'none' && !FULL_FRAME_SET.has(state.filter)) {
    for (const blob of blobs) {
      const bx = Math.max(0, Math.floor(blob.x));
      const by = Math.max(0, Math.floor(blob.y));
      const bw = Math.min(cw - bx, Math.ceil(blob.w));
      const bh = Math.min(ch - by, Math.ceil(blob.h));
      if (bw <= 0 || bh <= 0) continue;

      const region = ctx.getImageData(bx, by, bw, bh);
      applyFilterToRegion(region.data, state.filter);
      ctx.putImageData(region, bx, by);
    }
  }

  drawOverlays(ctx, blobs, state.regionStyle, state.shape, state.connectionRate, state.strokeWidth, state.blobSize, state.fontSize, state.overlayColor);
}

// ---- Init ----
loadPersistedState();
applyStateToUI();
canvas.width  = canvasArea.clientWidth;
canvas.height = canvasArea.clientHeight;
btnSnapshot.disabled = !state.hasSource;
