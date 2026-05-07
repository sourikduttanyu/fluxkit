/**
 * Canvas overlay drawing: bounding boxes, labels, handles, connection lines.
 */

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Draw all overlays for one frame.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} blobs
 * @param {'basic'|'label'|'frame'} regionStyle
 * @param {'rect'|'circle'|'rounded'|'diamond'} shape
 * @param {number} connectionRate  0-1
 */
export function drawOverlays(ctx, blobs, regionStyle, shape, connectionRate, strokeWidth, blobSize, fontSize, overlayColor) {
  if (blobs.length === 0 || blobSize === 0) return;
  const scale = blobSize / 64;
  // Scale each blob's drawn box around its center
  const scaledBlobs = blobs.map(b => {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const sw = b.w * scale;
    const sh = b.h * scale;
    return { ...b, x: cx - sw / 2, y: cy - sh / 2, w: sw, h: sh };
  });
  drawConnectionLines(ctx, scaledBlobs, connectionRate, strokeWidth, overlayColor);
  for (const blob of scaledBlobs) {
    drawBlobShape(ctx, blob, regionStyle, shape, strokeWidth, fontSize, overlayColor);
  }
}

// ---- Connection lines ----

function drawConnectionLines(ctx, blobs, connectionRate, strokeWidth, overlayColor) {
  if (connectionRate <= 0 || blobs.length < 2 || strokeWidth <= 0) return;

  // Generate all pairs sorted by distance
  const pairs = [];
  for (let i = 0; i < blobs.length; i++) {
    for (let j = i + 1; j < blobs.length; j++) {
      const ax = blobs[i].x + blobs[i].w / 2;
      const ay = blobs[i].y + blobs[i].h / 2;
      const bx = blobs[j].x + blobs[j].w / 2;
      const by = blobs[j].y + blobs[j].h / 2;
      const dx = ax - bx;
      const dy = ay - by;
      pairs.push({ i, j, dist: Math.sqrt(dx * dx + dy * dy) });
    }
  }
  pairs.sort((a, b) => a.dist - b.dist);

  const drawCount = Math.round(pairs.length * connectionRate);

  ctx.save();
  ctx.strokeStyle = hexToRgba(overlayColor, 0.6);
  ctx.lineWidth = strokeWidth * 0.8;

  for (let p = 0; p < drawCount; p++) {
    const { i, j } = pairs[p];
    ctx.beginPath();
    ctx.moveTo(blobs[i].x + blobs[i].w / 2, blobs[i].y + blobs[i].h / 2);
    ctx.lineTo(blobs[j].x + blobs[j].w / 2, blobs[j].y + blobs[j].h / 2);
    ctx.stroke();
  }

  ctx.restore();
}

// ---- Blob shape drawing ----

function drawBlobShape(ctx, blob, regionStyle, shape, strokeWidth, fontSize, overlayColor) {
  if (strokeWidth <= 0) return;
  const { x, y, w, h, cx, cy, score, index } = blob;

  ctx.save();
  ctx.strokeStyle = hexToRgba(overlayColor, 0.95);
  ctx.lineWidth = strokeWidth;

  // Draw the shape outline
  switch (shape) {
    case 'rect':
      drawRect(ctx, x, y, w, h);
      break;
    case 'circle':
      drawCircle(ctx, cx, cy, w, h);
      break;
    case 'rounded':
      drawRoundedRect(ctx, x, y, w, h, 6);
      break;
    case 'diamond':
      drawDiamond(ctx, cx, cy, w, h);
      break;
    default:
      drawRect(ctx, x, y, w, h);
  }

  if (regionStyle === 'basic') {
    drawBasicDecorations(ctx, blob, fontSize);
  } else if (regionStyle === 'label') {
    drawLabelDecorations(ctx, blob, fontSize);
  } else if (regionStyle === 'frame') {
    drawFrameDecorations(ctx, blob, fontSize);
  }

  ctx.restore();
}

// ---- Shape helpers ----

function drawRect(ctx, x, y, w, h) {
  ctx.strokeRect(x, y, w, h);
}

function drawCircle(ctx, cx, cy, w, h) {
  const rx = w / 2;
  const ry = h / 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.stroke();
}

function drawDiamond(ctx, cx, cy, w, h) {
  const hw = w / 2;
  const hh = h / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
  ctx.stroke();
}

// ---- Decoration helpers ----

function drawBasicDecorations(ctx, { x, y, score }, fontSize) {
  ctx.fillStyle = ctx.strokeStyle;
  ctx.font = `${fontSize}px SF Mono, Fira Code, monospace`;
  ctx.textBaseline = 'bottom';
  ctx.fillText(score.toFixed(4), x + 2, y - 2);
}

function drawLabelDecorations(ctx, { x, y, w, score, index }, fontSize) {
  const label = `Object ${index + 1}`;
  ctx.font = `${fontSize}px SF Mono, Fira Code, monospace`;
  ctx.textBaseline = 'top';
  const metrics = ctx.measureText(label);
  const padX = 4, padY = 2;
  const rectH = fontSize + padY * 2;
  const rectW = metrics.width + padX * 2;

  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillRect(x, y - rectH, rectW, rectH);
  // Invert for label text so it's always readable against the tab
  ctx.fillStyle = '#000000';
  ctx.fillText(label, x + padX, y - rectH + padY);
}

function drawFrameDecorations(ctx, { x, y, w, h, score }, fontSize) {
  // 8 handle squares: 5x5 white filled
  const hs = 5;
  const hHalf = hs / 2;
  const handles = [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
    [x + w / 2, y],
    [x + w / 2, y + h],
    [x, y + h / 2],
    [x + w, y + h / 2],
  ];

  ctx.fillStyle = ctx.strokeStyle;
  for (const [hx, hy] of handles) {
    ctx.fillRect(hx - hHalf, hy - hHalf, hs, hs);
  }

  ctx.font = `${fontSize}px SF Mono, Fira Code, monospace`;
  ctx.textBaseline = 'bottom';
  ctx.fillText(score.toFixed(4), x + 2, y - 2);
}
