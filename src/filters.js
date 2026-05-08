/**
 * Pixel filters applied to blob bounding-box regions WITHIN a full-frame
 * ImageData buffer. Caller does ONE getImageData on the full canvas, calls
 * applyFilterToSubregion() for each blob (sharing the buffer), then ONE
 * putImageData back. Avoids per-blob CPU↔GPU round-trips on the display
 * canvas (was 12-30 round-trips per frame, now 1).
 */

// Flat thermal LUT: 256 × 3 RGB bytes, packed for branch-free indexing.
// Avoids per-pixel array allocation that the old [r,g,b]-tuple LUT triggered.
export const THERMAL_LUT = new Uint8Array(256 * 3);
(() => {
  const stops = [
    [0,   [0,   0,   0]],
    [50,  [0,   102, 0]],
    [100, [0,   0,   255]],
    [150, [204, 0,   204]],
    [200, [255, 0,   102]],
    [255, [255, 255, 255]],
  ];
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  for (let v = 0; v < 256; v++) {
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (v >= stops[s][0] && v <= stops[s + 1][0]) { lo = stops[s]; hi = stops[s + 1]; break; }
    }
    const t = lo[0] === hi[0] ? 0 : (v - lo[0]) / (hi[0] - lo[0]);
    THERMAL_LUT[v * 3]     = lerp(lo[1][0], hi[1][0], t);
    THERMAL_LUT[v * 3 + 1] = lerp(lo[1][1], hi[1][1], t);
    THERMAL_LUT[v * 3 + 2] = lerp(lo[1][2], hi[1][2], t);
  }
})();

/**
 * Apply filter in-place to a sub-region of a full-frame ImageData buffer.
 * @param {Uint8ClampedArray} data    full canvas pixel buffer (length = fullW × fullH × 4)
 * @param {number}            fullW   full canvas width in pixels (stride = fullW × 4)
 * @param {number}            x, y    top-left of sub-region in pixels (must be ≥ 0)
 * @param {number}            w, h    sub-region size in pixels
 * @param {string}            filter  'inv' | 'thermal' (others are no-ops)
 */
export function applyFilterToSubregion(data, fullW, x, y, w, h, filter) {
  if (filter === 'none' || (filter !== 'inv' && filter !== 'thermal')) return;
  const xEnd = x + w;
  const yEnd = y + h;
  const stride = fullW * 4;
  if (filter === 'inv') {
    for (let yy = y; yy < yEnd; yy++) {
      let off = yy * stride + x * 4;
      const rowEnd = yy * stride + xEnd * 4;
      while (off < rowEnd) {
        data[off]     = 255 - data[off];
        data[off + 1] = 255 - data[off + 1];
        data[off + 2] = 255 - data[off + 2];
        off += 4;
      }
    }
  } else {
    for (let yy = y; yy < yEnd; yy++) {
      let off = yy * stride + x * 4;
      const rowEnd = yy * stride + xEnd * 4;
      while (off < rowEnd) {
        const r = data[off], g = data[off + 1], b = data[off + 2];
        const gray = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
        const lo = gray * 3;
        data[off]     = THERMAL_LUT[lo];
        data[off + 1] = THERMAL_LUT[lo + 1];
        data[off + 2] = THERMAL_LUT[lo + 2];
        off += 4;
      }
    }
  }
}
