/**
 * LumiSynth: luminance gradient trails with temporal velocity feedback.
 * Approximates the TD LumiSynth component — Sobel spatial gradient + frame-diff
 * velocity, colorized by gradient angle, accumulated in a persistent trail buffer.
 *
 * Operates on the half-res offscreen imageData (already computed for blob detection)
 * and scales the trail output up to display canvas resolution.
 */

let trailCanvas  = null;
let trailCtx     = null;
let gradCanvas   = null;
let gradCtx      = null;
let gradImgData  = null; // reused ImageData
let prevLuma     = null;

export function resetLumiSynth() {
  prevLuma = null;
  if (trailCtx) trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
}

/**
 * @param {CanvasRenderingContext2D} ctx   display canvas context
 * @param {ImageData}  offImageData        half-res offscreen imageData
 * @param {number}     ow, oh              offscreen dimensions
 * @param {number}     cw, ch              display canvas dimensions
 * @param {number}     decayRate           0-1, how much trail persists (default 0.95)
 * @param {number}     velGain             temporal velocity amplifier (default 5)
 * @param {number}     blackLevel          luminance threshold below which = no trail
 */
export function applyLumiSynth(ctx, offImageData, ow, oh, cw, ch, decayRate = 0.95, velGain = 5, blackLevel = 0) {
  // Init persistent canvases
  if (!trailCanvas) {
    trailCanvas = document.createElement('canvas');
    trailCtx    = trailCanvas.getContext('2d');
    gradCanvas  = document.createElement('canvas');
    gradCtx     = gradCanvas.getContext('2d');
  }

  // Resize if canvas dimensions changed
  if (trailCanvas.width !== ow || trailCanvas.height !== oh) {
    trailCanvas.width  = ow;  trailCanvas.height = oh;
    gradCanvas.width   = ow;  gradCanvas.height  = oh;
    gradImgData = new ImageData(ow, oh);
    prevLuma = null;
  }
  if (!gradImgData) gradImgData = new ImageData(ow, oh);

  const { data } = offImageData;
  const total = ow * oh;

  // Extract current luminance (0-1)
  const curLuma = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    curLuma[i] = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255;
  }

  // Decay trail: draw semi-transparent black over it
  trailCtx.globalCompositeOperation = 'source-over';
  trailCtx.fillStyle = `rgba(0,0,0,${(1 - decayRate).toFixed(4)})`;
  trailCtx.fillRect(0, 0, ow, oh);

  if (prevLuma && prevLuma.length === total) {
    const gd = gradImgData.data;

    for (let i = 0; i < total * 4; i++) gd[i] = 0; // clear

    for (let y = 1; y < oh - 1; y++) {
      for (let x = 1; x < ow - 1; x++) {
        const idx = y * ow + x;
        const lum = curLuma[idx];

        if (lum < blackLevel) continue;

        // Temporal velocity: how much this pixel changed since last frame
        const vel = Math.min(1, Math.abs(lum - prevLuma[idx]) * velGain);

        // Sobel spatial gradient
        const gx =
          -curLuma[(y - 1) * ow + (x - 1)] + curLuma[(y - 1) * ow + (x + 1)]
          - 2 * curLuma[y * ow + (x - 1)] + 2 * curLuma[y * ow + (x + 1)]
          - curLuma[(y + 1) * ow + (x - 1)] + curLuma[(y + 1) * ow + (x + 1)];
        const gy =
          -curLuma[(y - 1) * ow + (x - 1)] - 2 * curLuma[(y - 1) * ow + x] - curLuma[(y - 1) * ow + (x + 1)]
          + curLuma[(y + 1) * ow + (x - 1)] + 2 * curLuma[(y + 1) * ow + x] + curLuma[(y + 1) * ow + (x + 1)];

        const mag = Math.min(1, Math.sqrt(gx * gx + gy * gy) * 3);
        const brightness = Math.min(1, mag * 0.6 + vel * 0.9);

        if (brightness < 0.02) continue;

        // Gradient angle → hue
        const angle = Math.atan2(gy, gx);       // -π to π
        const hue   = angle / (Math.PI * 2) + 0.5; // 0-1

        const [r, g, b] = hsv2rgb(hue, 0.85, brightness);
        const p = idx * 4;
        gd[p]     = r * 255;
        gd[p + 1] = g * 255;
        gd[p + 2] = b * 255;
        gd[p + 3] = brightness * 210;
      }
    }

    gradCtx.putImageData(gradImgData, 0, 0);

    // Accumulate gradient onto trail with screen blend
    trailCtx.globalCompositeOperation = 'screen';
    trailCtx.globalAlpha = 0.45;
    trailCtx.drawImage(gradCanvas, 0, 0);
    trailCtx.globalAlpha = 1;
    trailCtx.globalCompositeOperation = 'source-over';
  }

  prevLuma = curLuma;

  // Draw trail onto display canvas (scale half-res → full-res) with screen blend
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(trailCanvas, 0, 0, cw, ch);
  ctx.globalCompositeOperation = 'source-over';
}

function hsv2rgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    case 5: return [v, p, q];
    default: return [0, 0, 0];
  }
}
