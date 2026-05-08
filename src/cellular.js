/**
 * Cellular Life — ported from TouchDesigner GLSL.
 * Conway-style CA seeded by video luminance, ping-pong FBOs.
 */

import { ensureContext, uploadVideoFrame, compositeToCanvas2D, getGL } from './glContext.js';

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 vUV;
void main() {
  vUV = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// uParams: x=Density, y=Stability, z=EvolutionSpeed, w=SourceInflux
const UPDATE_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D u_video;
uniform sampler2D u_prev;
uniform vec4 uParams;
out vec4 fragColor;

void main() {
  vec2 uv = vUV;
  vec2 texel = 1.0 / vec2(textureSize(u_video, 0));
  float source = texture(u_video, uv).r;
  float prev   = texture(u_prev, uv).r;

  float aliveT = mix(0.4, 0.15, uParams.x);

  float nCount = 0.0;
  float nSum   = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      if (dx == 0 && dy == 0) continue;
      vec2 np = uv + vec2(float(dx), float(dy)) * texel * 2.5;
      float nv = texture(u_prev, np).r;
      if (nv > aliveT) nCount += 1.0;
      nSum += nv;
    }
  }
  float nAvg   = nSum / 8.0;
  bool isAlive = prev > aliveT;

  float surviveMin = mix(1.5, 2.0, uParams.y);
  float surviveMax = mix(4.5, 3.5, uParams.y);
  float birthMin   = mix(2.5, 3.0, uParams.y);
  float birthMax   = mix(3.5, 3.0, uParams.y);

  float caResult;
  if (isAlive) {
    if (nCount >= surviveMin && nCount <= surviveMax) {
      caResult = mix(prev, max(prev, nAvg), 0.3);
    } else {
      caResult = prev * mix(0.4, 0.7, uParams.y);
    }
  } else {
    if (nCount >= birthMin && nCount <= birthMax) {
      caResult = max(nAvg, aliveT + 0.2);
    } else {
      caResult = prev * 0.85;
    }
  }

  float sparkChance        = smoothstep(0.6, 0.9, source);
  float sourceContribution = sparkChance * uParams.w;
  float withSource         = mix(caResult, max(caResult, source), sourceContribution * 0.4);

  float speed   = mix(0.2, 0.95, uParams.z);
  float evolved = mix(prev, withSource, speed);

  if (prev < 0.005 && source > aliveT) {
    evolved = max(evolved, source * 0.5);
  }

  evolved = clamp(evolved, 0.0, 1.0);
  fragColor = vec4(evolved, evolved, evolved, 1.0);
}`;

const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D u_ca;
out vec4 fragColor;

void main() {
  float v = texture(u_ca, vUV).r;
  if (v < 0.05) { fragColor = vec4(0.0); return; }
  // Tint: cyan-green glow
  vec3 col = v * vec3(0.3, 1.0, 0.6);
  fragColor = vec4(col, v);
}`;

// ---- WebGL helpers ----

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('[Cellular] shader:', gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

function createProgram(gl, vSrc, fSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fSrc);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.bindAttribLocation(p, 0, 'a_pos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('[Cellular] link:', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

function createFBO(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb };
}

// ---- Module state ----

// Effect-specific state only. GL context, canvas, video texture, and
// fullscreen-quad VAO live in glContext.js.
let M = null;

function initPrograms() {
  const gl = getGL();
  if (!gl) return null;
  const updateProg  = createProgram(gl, VERT, UPDATE_FRAG);
  const displayProg = createProgram(gl, VERT, DISPLAY_FRAG);
  if (!updateProg || !displayProg) return null;
  return {
    updateProg, displayProg,
    uUpdate: {
      video:  gl.getUniformLocation(updateProg, 'u_video'),
      prev:   gl.getUniformLocation(updateProg, 'u_prev'),
      params: gl.getUniformLocation(updateProg, 'uParams'),
    },
    uDisplay: {
      ca: gl.getUniformLocation(displayProg, 'u_ca'),
    },
  };
}

function disposeFBOs() {
  if (!M || !M.fb0) return;
  const gl = getGL();
  if (!gl) return;
  for (const { fb, tex } of [M.fb0, M.fb1]) {
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
  }
  M.fb0 = M.fb1 = null;
}

function ensureFBOs(w, h) {
  if (M && M.fb0 && M.w === w && M.h === h) return;
  disposeFBOs();
  const gl = getGL();
  M.fb0 = createFBO(gl, w, h);
  M.fb1 = createFBO(gl, w, h);
  M.w = w;
  M.h = h;
  M.pingPong = 0;
}

export function resetCA() {
  if (!M || !M.fb0) return;
  const gl = getGL();
  if (!gl) return;
  for (const { fb } of [M.fb0, M.fb1]) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  M.pingPong = 0;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLVideoElement}         video
 * @param {number} cw, ch
 * @param {object} params  { density, stability, evolutionSpeed, sourceInflux } all 0-1
 */
export function applyCA(ctx, video, cw, ch, params = {}) {
  const density        = params.density        ?? 0.5;
  const stability      = params.stability      ?? 0.5;
  const evolutionSpeed = params.evolutionSpeed ?? 0.5;
  const sourceInflux   = params.sourceInflux   ?? 0.5;

  const S = ensureContext(cw, ch);
  if (!S) return;
  if (!M) {
    M = initPrograms();
    if (!M) return;
    M.w = -1; M.h = -1; M.pingPong = 0; M.fb0 = M.fb1 = null;
  }
  ensureFBOs(cw, ch);

  const { gl, vao, videoTex } = S;
  const { updateProg, displayProg, uUpdate, uDisplay, fb0, fb1 } = M;

  const fbRead  = M.pingPong === 0 ? fb0 : fb1;
  const fbWrite = M.pingPong === 0 ? fb1 : fb0;
  M.pingPong ^= 1;

  gl.viewport(0, 0, cw, ch);
  gl.bindVertexArray(vao);
  uploadVideoFrame(video);

  // Pass 1: update CA state
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbWrite.fb);
  gl.useProgram(updateProg);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, videoTex);   gl.uniform1i(uUpdate.video, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fbRead.tex); gl.uniform1i(uUpdate.prev,  1);
  gl.uniform4f(uUpdate.params, density, stability, evolutionSpeed, sourceInflux);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Pass 2: colorize + display
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(displayProg);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fbWrite.tex); gl.uniform1i(uDisplay.ca, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  compositeToCanvas2D(ctx, cw, ch, 'screen');
}
