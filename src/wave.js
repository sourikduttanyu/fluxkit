/**
 * Wave Propagation — ported from TouchDesigner GLSL.
 * 2D wave equation seeded from bright video pixels, ping-pong FBOs.
 * FBO encodes: R=visualization, G=u_curr*0.5+0.5, B=u_prev*0.5+0.5
 */

import { ensureContext, uploadVideoFrame, compositeToCanvas2D, getGL } from './glContext.js';

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 vUV;
void main() {
  vUV = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

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

  vec3 prev = texture(u_prev, uv).rgb;
  bool uninit = abs(prev.g - prev.r) < 0.02 && abs(prev.b - prev.r) < 0.02;
  float u_curr     = uninit ? 0.0 : (prev.g - 0.5) * 2.0;
  float u_prev_val = uninit ? 0.0 : (prev.b - 0.5) * 2.0;

  vec3 pL = texture(u_prev, uv - vec2(texel.x, 0.0)).rgb;
  vec3 pR = texture(u_prev, uv + vec2(texel.x, 0.0)).rgb;
  vec3 pD = texture(u_prev, uv - vec2(0.0, texel.y)).rgb;
  vec3 pU = texture(u_prev, uv + vec2(0.0, texel.y)).rgb;

  float uL = (abs(pL.g-pL.r)<0.02&&abs(pL.b-pL.r)<0.02) ? 0.0 : (pL.g-0.5)*2.0;
  float uR = (abs(pR.g-pR.r)<0.02&&abs(pR.b-pR.r)<0.02) ? 0.0 : (pR.g-0.5)*2.0;
  float uD = (abs(pD.g-pD.r)<0.02&&abs(pD.b-pD.r)<0.02) ? 0.0 : (pD.g-0.5)*2.0;
  float uU = (abs(pU.g-pU.r)<0.02&&abs(pU.b-pU.r)<0.02) ? 0.0 : (pU.g-0.5)*2.0;

  float laplacian = uL + uR + uD + uU - 4.0 * u_curr;
  float c = mix(0.1, 0.4, uParams.z);
  float damping = 1.0 - uParams.y * 0.05;
  float u_new = (2.0 * u_curr - u_prev_val + c * c * laplacian) * damping;

  float sL = texture(u_video, uv - vec2(texel.x, 0.0)).r;
  float sR = texture(u_video, uv + vec2(texel.x, 0.0)).r;
  float sD = texture(u_video, uv - vec2(0.0, texel.y)).r;
  float sU = texture(u_video, uv + vec2(0.0, texel.y)).r;
  if (source > 0.6 && source >= sL && source >= sR && source >= sD && source >= sU) {
    u_new += (source - 0.6) * uParams.x * 0.15;
  }

  u_new = clamp(u_new, -1.0, 1.0);
  u_new *= mix(1.0, 0.85, u_new * u_new);

  float localSrc = (sL + sR + sD + sU + source) * 0.2;
  if (localSrc < 0.25) {
    u_new *= 0.7;
    if (abs(u_new) < 0.1) u_new = 0.0;
  } else if (localSrc < 0.4) {
    u_new *= 0.92;
  }

  float vis = smoothstep(0.2, 0.5, abs(u_new));
  vis = pow(vis, mix(2.0, 0.7, uParams.w));
  vis = clamp(vis, 0.0, 1.0);

  fragColor = vec4(vis, u_new * 0.5 + 0.5, u_curr * 0.5 + 0.5, 1.0);
}`;

const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D u_wave;
out vec4 fragColor;

void main() {
  float vis = texture(u_wave, vUV).r;
  if (vis < 0.02) { fragColor = vec4(0.0); return; }
  vec3 col = mix(vec3(0.2, 0.5, 1.0), vec3(1.0, 1.0, 1.0), vis);
  fragColor = vec4(col * vis, vis);
}`;

// ---- WebGL helpers ----

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('[Wave] shader:', gl.getShaderInfoLog(s));
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
    console.error('[Wave] link:', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

function createFBO(gl, w, h) {
  const ext = gl.getExtension('EXT_color_buffer_float');
  const internalFmt = ext ? gl.RGBA16F : gl.RGBA;
  const type        = ext ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, w, h, 0, gl.RGBA, type, null);
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
      wave: gl.getUniformLocation(displayProg, 'u_wave'),
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

export function resetWave() {
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
 * @param {object} params  { sourceStrength, damping, speed, contrast } all 0-1
 */
export function applyWave(ctx, video, cw, ch, params = {}) {
  const sourceStrength = params.sourceStrength ?? 0.5;
  const damping        = params.damping        ?? 0.3;
  const speed          = params.speed          ?? 0.5;
  const contrast       = params.contrast       ?? 0.5;

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

  // Pass 1: update wave state
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbWrite.fb);
  gl.useProgram(updateProg);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, videoTex);   gl.uniform1i(uUpdate.video, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fbRead.tex); gl.uniform1i(uUpdate.prev,  1);
  gl.uniform4f(uUpdate.params, sourceStrength, damping, speed, contrast);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Pass 2: colorize wave vis, composite over video
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(displayProg);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fbWrite.tex); gl.uniform1i(uDisplay.wave, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  compositeToCanvas2D(ctx, cw, ch, 'screen');
}
