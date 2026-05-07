import './style.css';
import { detectBlobs, resetFrameHistory } from './blobDetector.js';
import { applyFilterToRegion } from './filters.js';
import { drawOverlays } from './overlays.js';

// ---- State ----
const state = {
  speed: 1,
  shape: 'rect',
  regionStyle: 'basic',
  filter: 'none',
  connectionRate: 0.25,
  threshold: 15,
  maxBlobs: 12,
  updateInterval: 1,
  strokeWidth: 1,
  blobSize: 64,
  fontSize: 11,
  overlayColor: '#ffffff',
  hasSource: false,
};

let frameCount   = 0;
let cachedBlobs  = [];

// ---- DOM refs ----
const video       = document.getElementById('video');
const canvas      = document.getElementById('main-canvas');
const ctx         = canvas.getContext('2d', { willReadFrequently: true });
const placeholder = document.getElementById('placeholder');
const fileInput   = document.getElementById('file-input');
const canvasArea  = document.getElementById('canvas-area');

// ---- Offscreen canvas for half-res blob detection ----
const offscreen = document.createElement('canvas');
const offCtx    = offscreen.getContext('2d', { willReadFrequently: true });
const DETECT_SCALE = 0.5; // run detection at 50% resolution

// ---- Toggle group wiring ----
function wireToggleGroup(groupId, stateKey, onChange) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state[stateKey] = btn.dataset.value;
    if (onChange) onChange(state[stateKey]);
  });
}

function wireSlider(sliderId, valId, stateKey, transform) {
  const slider = document.getElementById(sliderId);
  const valEl  = document.getElementById(valId);
  if (!slider) return;
  slider.addEventListener('input', () => {
    state[stateKey] = transform ? transform(slider.value) : parseFloat(slider.value);
    valEl.textContent = slider.value;
  });
}

wireToggleGroup('speed-group',  'speed',       (v) => { video.playbackRate = parseFloat(v); });
wireToggleGroup('shape-group',  'shape',        null);
wireToggleGroup('style-group',  'regionStyle',  null);
wireToggleGroup('filter-group', 'filter',       null);

wireSlider('connection-rate',  'connection-rate-val',  'connectionRate',  parseFloat);
wireSlider('sensitivity',      'sensitivity-val',      'threshold',       parseFloat);
wireSlider('max-blobs',        'max-blobs-val',        'maxBlobs',        parseInt);
wireSlider('update-interval',  'update-interval-val',  'updateInterval',  parseInt);
wireSlider('stroke-width',     'stroke-width-val',     'strokeWidth',     parseFloat);
wireToggleGroup('blob-size-group', 'blobSize', (v) => { state.blobSize = parseInt(v); });
wireSlider('font-size', 'font-size-val', 'fontSize', parseInt);

const colorPicker = document.getElementById('overlay-color');
const colorLabel  = document.getElementById('overlay-color-val');
colorPicker.addEventListener('input', () => {
  state.overlayColor = colorPicker.value;
  colorLabel.textContent = colorPicker.value;
});

// ---- File upload ----
document.getElementById('btn-upload').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  loadVideoSource(URL.createObjectURL(file));
});

// ---- Camera ----
document.getElementById('btn-camera').addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = stream;
    video.play();
    resetFrameHistory();
    cachedBlobs = [];
    frameCount  = 0;
    setHasSource(true);
  } catch (err) {
    alert('Could not access camera: ' + err.message);
  }
});

// ---- Load video ----
function loadVideoSource(url) {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
  video.src = url;
  video.loop = true;
  video.play().catch(() => {});
  resetFrameHistory();
  cachedBlobs = [];
  frameCount  = 0;
  setHasSource(true);
}

function setHasSource(val) {
  state.hasSource = val;
  placeholder.style.display = val ? 'none' : 'flex';
}

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
video.addEventListener('loadedmetadata', resizeCanvas);

// ---- Main render loop ----
function renderFrame() {
  requestAnimationFrame(renderFrame);
  resizeCanvas();

  if (!state.hasSource) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  if (video.readyState < 2 || video.videoWidth === 0) return;

  const cw = canvas.width;
  const ch = canvas.height;

  // Draw video to display canvas (full res)
  ctx.drawImage(video, 0, 0, cw, ch);

  // --- Blob detection on half-res offscreen ---
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
    const rawBlobs = detectBlobs(offImageData, state.threshold, state.maxBlobs);
    const sx = cw / ow;
    const sy = ch / oh;
    cachedBlobs = rawBlobs.map(b => ({
      ...b,
      x:  b.x  * sx,
      y:  b.y  * sy,
      w:  b.w  * sx,
      h:  b.h  * sy,
      cx: b.cx * sx,
      cy: b.cy * sy,
    }));
  }
  const blobs = cachedBlobs;

  // --- Per-blob sub-region filter (reads only blob pixels, not full frame) ---
  if (state.filter !== 'none') {
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

  // Draw overlays on top of everything
  drawOverlays(ctx, blobs, state.regionStyle, state.shape, state.connectionRate, state.strokeWidth, state.blobSize, state.fontSize, state.overlayColor);
}

canvas.width  = canvasArea.clientWidth;
canvas.height = canvasArea.clientHeight;

requestAnimationFrame(renderFrame);
