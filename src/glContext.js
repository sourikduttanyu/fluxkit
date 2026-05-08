/**
 * Shared WebGL2 context for all effect modules.
 *
 * Before this, each of voronoi/cellular/wave/ascii/glFilters created its own
 * <canvas>, its own webgl2 context, its own video texture, and its own
 * fullscreen-quad VAO. Five GL contexts sat in VRAM holding redundant copies
 * of the same video frame, each effect uploaded its own texture, and 80% of
 * those resources were dead weight at any given moment because only one
 * filter is active per frame.
 *
 * Now: ONE offscreen GL2 canvas, ONE GL2 context, ONE shared video texture,
 * ONE shared fullscreen-quad VAO. Each effect module still owns its own
 * shader programs, FBOs, and uniform locations (those vary per effect) but
 * shares everything else.
 *
 * Per-frame contract for effect modules:
 *   1. const S = ensureContext(cw, ch);      // idempotent, resizes canvas
 *   2. uploadVideoFrame(video);              // ONE upload per frame
 *   3. ...effect-specific draw passes against S.gl, S.vao, S.videoTex...
 *   4. compositeToCanvas2D(ctx, cw, ch, op); // ONE drawImage to display
 *
 * VAO contract: every effect's vertex shader uses attribute 0 as the
 * clip-space position. Effect programs MUST call
 *   gl.bindAttribLocation(prog, 0, 'a_pos');
 * before linking, which is how the existing modules already wire it.
 */

import { uploadVideoTexture } from './glUtil.js';

let S = null;

export function ensureContext(w, h) {
  if (!S) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, alpha: true });
    if (!gl) {
      console.warn('[glContext] WebGL2 not supported');
      return null;
    }

    // Fullscreen quad shared by every effect. Captured into a VAO so effects
    // just bind it and drawArrays — no per-frame buffer rebinding.
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Shared video texture — the single source-of-truth for the current
    // frame in GPU memory across all effects.
    const videoTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, videoTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    S = { canvas, gl, vao, videoTex, w: 0, h: 0 };
  }
  if (S.w !== w || S.h !== h) {
    S.canvas.width = w;
    S.canvas.height = h;
    S.w = w;
    S.h = h;
  }
  return S;
}

export function uploadVideoFrame(video) {
  if (!S) return false;
  S.gl.bindTexture(S.gl.TEXTURE_2D, S.videoTex);
  return uploadVideoTexture(S.gl, S.videoTex, video);
}

export function compositeToCanvas2D(ctx, cw, ch, op = 'source-over') {
  if (!S) return;
  ctx.save();
  ctx.globalCompositeOperation = op;
  ctx.drawImage(S.canvas, 0, 0, cw, ch);
  ctx.restore();
}

export function getGL()       { return S ? S.gl : null; }
export function getCanvas()   { return S ? S.canvas : null; }
export function getVideoTex() { return S ? S.videoTex : null; }
export function getQuadVAO()  { return S ? S.vao : null; }
