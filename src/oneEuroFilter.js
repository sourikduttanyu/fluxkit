/**
 * One Euro Filter — adaptive low-pass for noisy positional input.
 *
 * Reference: Casiez, Roussel, Vogel. "1€ Filter: A Simple Speed-based Low-pass
 * Filter for Noisy Input in Interactive Systems." CHI 2012.
 *   https://gery.casiez.net/1euro/
 *
 * Why this over EMA: EMA has a single fixed alpha. Pick low alpha → blob is
 * smooth when stationary but sluggish when moving (visible lag tail). Pick
 * high alpha → snappy when moving but jitters when stationary. One Euro
 * sidesteps the trade-off by *adapting* the cutoff to the signal's own
 * speed: low cutoff (heavy smoothing) when the signal is barely moving,
 * cutoff opens as speed increases. Net effect — stationary jitter goes to
 * zero, moving lag stays minimal.
 *
 * Two tunable params per filter:
 *   minCutoff (Hz)  baseline cutoff at zero speed; lower = smoother stationary
 *   beta            cutoff slope vs. speed; higher = less lag when moving
 *
 * dCutoff (Hz) is a fixed internal param for the derivative low-pass; 1.0 is
 * the canonical value from the paper and works for cursor-scale motion.
 *
 * dt is computed in real seconds from monotonic timestamps, so this filter
 * is framerate-independent — pass `performance.now()` and it'll behave the
 * same at 60fps or 144fps or with frame drops.
 */

/** Standard exponential alpha derived from a cutoff frequency + dt.
 *  α = 1 / (1 + τ/dt)  where τ = 1 / (2π · cutoff). */
function alphaFromCutoff(cutoffHz, dtSec) {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSec);
}

/** Low-pass step: pulls `prev` toward `current` by alpha. */
function lowpass(current, prev, alpha) {
  return alpha * current + (1 - alpha) * prev;
}

/** Single-axis One Euro filter. Holds running smoothed value + smoothed
 *  derivative + last timestamp. Call .filter(value, tNow) per sample. */
export class OneEuro1D {
  constructor(minCutoff = 1.0, beta = 0.01, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta      = beta;
    this.dCutoff   = dCutoff;
    this._x   = null;   // last smoothed value
    this._dx  = 0;      // last smoothed derivative
    this._tMs = null;   // last sample timestamp (ms, monotonic)
  }

  /** @param {number} x raw sample @param {number} tMs monotonic timestamp in ms */
  filter(x, tMs) {
    if (this._x === null || this._tMs === null) {
      this._x = x; this._tMs = tMs; this._dx = 0;
      return x;
    }
    // dt clamped to avoid divide-by-zero / pathological huge alphas on
    // back-to-back calls within the same frame. 1ms floor = 1000Hz cap,
    // well above any realistic input rate.
    const dt = Math.max(0.001, (tMs - this._tMs) / 1000);
    this._tMs = tMs;

    const dxRaw  = (x - this._x) / dt;
    const aD     = alphaFromCutoff(this.dCutoff, dt);
    const dxHat  = lowpass(dxRaw, this._dx, aD);
    this._dx     = dxHat;

    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const aX     = alphaFromCutoff(cutoff, dt);
    this._x      = lowpass(x, this._x, aX);
    return this._x;
  }

  /** Live param tuning — knob changes mid-stream re-take effect on the
   *  very next sample without resetting filter history. */
  setParams(minCutoff, beta) {
    this.minCutoff = minCutoff;
    this.beta      = beta;
  }
}

/** Convenience: 4 independent OneEuro1D filters for a blob's x, y, w, h.
 *  Width/height share the same params as x/y for now — size jitter and
 *  position jitter are both grid-quantization artifacts, no reason to
 *  treat them differently at this layer. */
export class BlobOneEuroFilter {
  constructor(minCutoff = 1.0, beta = 0.01) {
    this.fx = new OneEuro1D(minCutoff, beta);
    this.fy = new OneEuro1D(minCutoff, beta);
    this.fw = new OneEuro1D(minCutoff, beta);
    this.fh = new OneEuro1D(minCutoff, beta);
  }

  /** Returns a smoothed shallow copy with x, y, w, h, cx, cy filtered.
   *  All other fields (id, score, area, index) pass through untouched. */
  filterBlob(b, tMs) {
    const cx = this.fx.filter(b.cx, tMs);
    const cy = this.fy.filter(b.cy, tMs);
    const w  = this.fw.filter(b.w,  tMs);
    const h  = this.fh.filter(b.h,  tMs);
    return { ...b, cx, cy, w, h, x: cx - w / 2, y: cy - h / 2 };
  }

  setParams(minCutoff, beta) {
    this.fx.setParams(minCutoff, beta);
    this.fy.setParams(minCutoff, beta);
    this.fw.setParams(minCutoff, beta);
    this.fh.setParams(minCutoff, beta);
  }
}
