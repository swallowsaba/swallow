import type { AdjustmentUniforms } from '@/features/adjustments/model/adjustment-math';
import type { AdvancedUniforms } from '@/features/adjustments/model/advanced-math';
import { NEUTRAL_ADVANCED } from '@/features/adjustments/model/advanced-math';
import type { Point, Size } from './viewport';

/**
 * WebGL2 renderer that draws the image as a textured quad and applies the
 * Basic adjustment pipeline in the fragment shader.
 *
 * The fragment shader below is a line-for-line mirror of `processColor` in
 * `@/features/adjustments/model/adjustment-math`. Keep the two in sync — the CPU
 * version is what the unit tests validate.
 */

const VERTEX_SRC = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_exposure, u_contrast, u_highlights, u_shadows, u_whites, u_blacks;
uniform float u_brightness, u_gamma, u_temp, u_tint, u_saturation, u_vibrance;
uniform float u_toneShadows, u_toneMid, u_toneHighlights;
uniform float u_hslHue[8], u_hslSat[8], u_hslLum[8];
uniform float u_clarity, u_texture, u_dehaze, u_sharpenAmount, u_sharpenRadius;
uniform float u_noiseReduction, u_colorNoiseReduction;
uniform float u_distortion, u_vignetting, u_chromaticAberration;
uniform vec2 u_texel;
out vec4 outColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float HUES[8] = float[8](0.0, 30.0, 60.0, 120.0, 180.0, 240.0, 280.0, 320.0);

vec3 srgb2lin(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 lin2srgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// --- lens: barrel/pincushion UV remap, mirrors distortUv() ---
vec2 distortUv(vec2 uv, float amount, float aspect) {
  float k = amount / 300.0;
  float cx = uv.x - 0.5;
  float cy = (uv.y - 0.5) / aspect;
  float r2 = cx * cx + cy * cy;
  float f = 1.0 + k * r2;
  return vec2(0.5 + cx * f, 0.5 + cy * f * aspect);
}

// --- lens: radial vignette, mirrors vignetteFactor() ---
float vignetteFactor(vec2 uv, float amount) {
  float cx = uv.x - 0.5;
  float cy = uv.y - 0.5;
  float dist = min(1.0, sqrt(cx * cx + cy * cy) / 0.70710678);
  float strength = amount / 100.0;
  float falloff = dist * dist;
  return max(0.0, 1.0 - strength * falloff * 0.8);
}

// --- tone curve: 3-point piecewise-quadratic, mirrors evalToneCurve() ---
vec3 toneCurve3(vec3 x, float sh, float mid, float hi) {
  vec3 y0 = clamp(vec3(0.0 + sh / 200.0), 0.0, 1.0);
  vec3 y1 = clamp(vec3(0.5 + mid / 200.0), 0.0, 1.0);
  vec3 y2 = clamp(vec3(1.0 + hi / 200.0), 0.0, 1.0);
  vec3 tA = clamp(x / 0.5, 0.0, 1.0);
  vec3 loBranch = clamp(y0 + (y1 - y0) * tA * (2.0 - tA), 0.0, 1.0);
  vec3 tB = clamp((x - 0.5) / 0.5, 0.0, 1.0);
  vec3 hiBranch = clamp(y1 + (y2 - y1) * tB, 0.0, 1.0);
  return mix(loBranch, hiBranch, step(0.5, x));
}

// --- HSL: rgb<->hsl + 8-band shift, mirrors rgbToHsl/hslToRgb/applyHslBands ---
vec3 rgb2hsl(vec3 c) {
  float mx = max(max(c.r, c.g), c.b);
  float mn = min(min(c.r, c.g), c.b);
  float l = (mx + mn) * 0.5;
  float d = mx - mn;
  if (d < 1e-6) return vec3(0.0, 0.0, l);
  float s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
  float h;
  if (mx == c.r) h = mod((c.g - c.b) / d, 6.0);
  else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
  else h = (c.r - c.g) / d + 4.0;
  h *= 60.0;
  if (h < 0.0) h += 360.0;
  return vec3(h, s, l);
}
float hueChannel(float p, float q, float t0) {
  float t = t0;
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}
vec3 hsl2rgb(float h, float s, float l) {
  if (s < 1e-6) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  float hn = mod(h, 360.0) / 360.0;
  return vec3(
    hueChannel(p, q, hn + 1.0 / 3.0),
    hueChannel(p, q, hn),
    hueChannel(p, q, hn - 1.0 / 3.0)
  );
}
float hueDist(float a, float b) {
  float d = mod(abs(a - b), 360.0);
  return d > 180.0 ? 360.0 - d : d;
}
vec3 applyHslBands(vec3 c) {
  vec3 hsl = rgb2hsl(c);
  if (hsl.y < 1e-4) return c;
  float hueShift = 0.0, satAdd = 0.0, lumAdd = 0.0;
  for (int i = 0; i < 8; i++) {
    float dist = hueDist(hsl.x, HUES[i]);
    float weight = max(0.0, 1.0 - dist / 60.0);
    if (weight <= 0.0) continue;
    hueShift += u_hslHue[i] * 0.3 * weight;
    satAdd += (u_hslSat[i] / 100.0) * weight;
    lumAdd += (u_hslLum[i] / 100.0) * 0.25 * weight;
  }
  return hsl2rgb(hsl.x + hueShift, clamp(hsl.y * (1.0 + satAdd), 0.0, 1.0), clamp(hsl.z + lumAdd, 0.0, 1.0));
}

void main() {
  float aspect = u_texel.y / max(u_texel.x, 1e-6);
  vec2 duv = distortUv(v_uv, u_distortion, aspect);

  vec3 texRgb;
  if (abs(u_chromaticAberration) > 0.01) {
    vec2 caOff = (duv - 0.5) * (u_chromaticAberration / 1000.0);
    texRgb = vec3(
      texture(u_tex, duv + caOff).r,
      texture(u_tex, duv).g,
      texture(u_tex, duv - caOff).b
    );
  } else {
    texRgb = texture(u_tex, duv).rgb;
  }
  float texA = texture(u_tex, duv).a;

  vec3 lin = srgb2lin(texRgb);

  float rMul = max(0.0, 1.0 + 0.4 * u_temp + 0.1 * u_tint);
  float gMul = max(0.0, 1.0 - 0.3 * u_tint);
  float bMul = max(0.0, 1.0 - 0.4 * u_temp + 0.1 * u_tint);
  lin *= vec3(rMul, gMul, bMul);
  lin *= exp2(u_exposure);

  vec3 s = lin2srgb(lin);
  s += 0.5 * u_blacks * (1.0 - s) * (1.0 - s);
  s += 0.5 * u_whites * s * s;
  s += 0.3 * u_shadows * smoothstep(0.5, 0.0, s);
  s += 0.3 * u_highlights * smoothstep(0.5, 1.0, s);
  s += vec3(0.5 * u_brightness);
  s = (s - 0.5) * (1.0 + u_contrast) + 0.5;
  s = clamp(s, 0.0, 1.0);

  float lum = dot(s, LUMA);
  s = vec3(lum) + (s - vec3(lum)) * (1.0 + u_saturation);

  lum = dot(s, LUMA);
  float mx = max(max(s.r, s.g), s.b);
  float mn = min(min(s.r, s.g), s.b);
  float sat = (mx - mn) / (mx + 1e-4);
  float vibF = 1.0 + u_vibrance * (1.0 - sat);
  s = vec3(lum) + (s - vec3(lum)) * vibF;
  s = clamp(s, 0.0, 1.0);

  // Tone tab (3-point curve) and Color tab (8-band HSL).
  s = toneCurve3(s, u_toneShadows, u_toneMid, u_toneHighlights);
  s = applyHslBands(s);

  // Detail tab: cheap 4-neighbor box blur used as the "local average" for
  // clarity, sharpening, and noise reduction (an approximation — a real
  // bilateral/gaussian pass would need a separate blur target).
  vec2 texel = u_texel * max(u_sharpenRadius, 0.5);
  vec3 blur = (
    texture(u_tex, duv + vec2(texel.x, 0.0)).rgb +
    texture(u_tex, duv - vec2(texel.x, 0.0)).rgb +
    texture(u_tex, duv + vec2(0.0, texel.y)).rgb +
    texture(u_tex, duv - vec2(0.0, texel.y)).rgb
  ) * 0.25;

  s += (s - blur) * (u_sharpenAmount / 100.0) * 1.5;
  float midWeight = max(0.0, 1.0 - abs(dot(s, LUMA) - 0.5) * 2.0);
  s += (s - blur) * (u_clarity / 100.0) * 0.6 * midWeight;
  s += (s - blur) * (u_texture / 100.0) * 0.3;

  float denoiseT = clamp(u_noiseReduction / 100.0, 0.0, 1.0);
  s = mix(s, blur, denoiseT);
  float lumS = dot(s, LUMA);
  float lumB = dot(blur, LUMA);
  vec3 chroma = mix(s - vec3(lumS), blur - vec3(lumB), clamp(u_colorNoiseReduction / 100.0, 0.0, 1.0));
  s = vec3(lumS) + chroma;

  float dehazeT = max(u_dehaze, 0.0) / 100.0;
  s = (s - 0.5) * (1.0 + dehazeT * 0.5) + 0.5 - dehazeT * 0.1 * (1.0 - s);

  s = clamp(s, 0.0, 1.0) * vignetteFactor(duv, u_vignetting);

  s = pow(max(s, 0.0), vec3(1.0 / u_gamma));
  outColor = vec4(clamp(s, 0.0, 1.0), texA);
}`;

export interface ViewTransform {
  readonly scale: number;
  readonly offset: Point;
  readonly rotationDeg: number;
}

const UNIFORM_NAMES = [
  'u_exposure',
  'u_contrast',
  'u_highlights',
  'u_shadows',
  'u_whites',
  'u_blacks',
  'u_brightness',
  'u_gamma',
  'u_temp',
  'u_tint',
  'u_saturation',
  'u_vibrance',
  'u_toneShadows',
  'u_toneMid',
  'u_toneHighlights',
  'u_clarity',
  'u_texture',
  'u_dehaze',
  'u_sharpenAmount',
  'u_sharpenRadius',
  'u_noiseReduction',
  'u_colorNoiseReduction',
  'u_distortion',
  'u_vignetting',
  'u_chromaticAberration',
] as const;

/** Uniforms that aren't plain floats (arrays / vec2) — set separately from
 *  the generic scalar loop above. */
const ARRAY_UNIFORM_NAMES = ['u_hslHue', 'u_hslSat', 'u_hslLum'] as const;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown error';
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown error';
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }
  return program;
}

export class WebGLImageRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  private readonly texture: WebGLTexture;
  private readonly uniforms: Record<string, WebGLUniformLocation | null> = {};
  private readonly texLoc: WebGLUniformLocation | null;
  private texelLoc: WebGLUniformLocation | null = null;
  private imageSize: Size = { width: 0, height: 0 };
  private readonly vertexData = new Float32Array(16);

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 is not supported in this browser.');
    this.gl = gl;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    this.program = linkProgram(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    if (!vao || !buffer || !texture) throw new Error('Failed to allocate GL objects');
    this.vao = vao;
    this.buffer = buffer;
    this.texture = texture;

    for (const name of UNIFORM_NAMES) {
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    }
    for (const name of ARRAY_UNIFORM_NAMES) {
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    }
    this.texelLoc = gl.getUniformLocation(this.program, 'u_texel');
    this.texLoc = gl.getUniformLocation(this.program, 'u_tex');

    const posLoc = gl.getAttribLocation(this.program, 'a_pos');
    const uvLoc = gl.getAttribLocation(this.program, 'a_uv');

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  setImage(bitmap: ImageBitmap): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    // Do NOT rely on UNPACK_FLIP_Y_WEBGL here: its interaction with
    // ImageBitmap sources is inconsistent across browsers and was the cause
    // of images rendering upside down. Upload the bitmap as-is (row 0 = top,
    // same order the source data already has) and account for orientation
    // entirely in the UV coordinates below, which we fully control.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    this.imageSize = { width: bitmap.width, height: bitmap.height };
  }

  resize(pixelWidth: number, pixelHeight: number): void {
    const canvas = this.gl.canvas as HTMLCanvasElement | OffscreenCanvas;
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    this.gl.viewport(0, 0, pixelWidth, pixelHeight);
  }

  private setUniforms(a: AdjustmentUniforms, adv: AdvancedUniforms): void {
    const gl = this.gl;
    gl.uniform1f(this.uniforms.u_exposure ?? null, a.exposure);
    gl.uniform1f(this.uniforms.u_contrast ?? null, a.contrast);
    gl.uniform1f(this.uniforms.u_highlights ?? null, a.highlights);
    gl.uniform1f(this.uniforms.u_shadows ?? null, a.shadows);
    gl.uniform1f(this.uniforms.u_whites ?? null, a.whites);
    gl.uniform1f(this.uniforms.u_blacks ?? null, a.blacks);
    gl.uniform1f(this.uniforms.u_brightness ?? null, a.brightness);
    gl.uniform1f(this.uniforms.u_gamma ?? null, a.gamma);
    gl.uniform1f(this.uniforms.u_temp ?? null, a.temp);
    gl.uniform1f(this.uniforms.u_tint ?? null, a.tint);
    gl.uniform1f(this.uniforms.u_saturation ?? null, a.saturation);
    gl.uniform1f(this.uniforms.u_vibrance ?? null, a.vibrance);

    gl.uniform1f(this.uniforms.u_toneShadows ?? null, adv.toneShadows);
    gl.uniform1f(this.uniforms.u_toneMid ?? null, adv.toneMid);
    gl.uniform1f(this.uniforms.u_toneHighlights ?? null, adv.toneHighlights);
    gl.uniform1f(this.uniforms.u_clarity ?? null, adv.clarity);
    gl.uniform1f(this.uniforms.u_texture ?? null, adv.texture);
    gl.uniform1f(this.uniforms.u_dehaze ?? null, adv.dehaze);
    gl.uniform1f(this.uniforms.u_sharpenAmount ?? null, adv.sharpenAmount);
    gl.uniform1f(this.uniforms.u_sharpenRadius ?? null, adv.sharpenRadius);
    gl.uniform1f(this.uniforms.u_noiseReduction ?? null, adv.noiseReduction);
    gl.uniform1f(this.uniforms.u_colorNoiseReduction ?? null, adv.colorNoiseReduction);
    gl.uniform1f(this.uniforms.u_distortion ?? null, adv.distortion);
    gl.uniform1f(this.uniforms.u_vignetting ?? null, adv.vignetting);
    gl.uniform1f(this.uniforms.u_chromaticAberration ?? null, adv.chromaticAberration);

    gl.uniform1fv(this.uniforms.u_hslHue ?? null, adv.hslHue);
    gl.uniform1fv(this.uniforms.u_hslSat ?? null, adv.hslSat);
    gl.uniform1fv(this.uniforms.u_hslLum ?? null, adv.hslLum);

    const w = this.imageSize.width || 1;
    const h = this.imageSize.height || 1;
    gl.uniform2f(this.texelLoc, 1 / w, 1 / h);
  }

  render(
    view: ViewTransform,
    cssSize: Size,
    dpr: number,
    adjustments: AdjustmentUniforms,
    advanced: AdvancedUniforms = NEUTRAL_ADVANCED,
  ): void {
    const gl = this.gl;
    this.resize(Math.round(cssSize.width * dpr), Math.round(cssSize.height * dpr));

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.imageSize.width === 0) return;

    const halfW = (this.imageSize.width * view.scale) / 2;
    const halfH = (this.imageSize.height * view.scale) / 2;
    const rad = (view.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cx = cssSize.width / 2 + view.offset.x;
    const cy = cssSize.height / 2 + view.offset.y;

    // UV v=0 samples the texture's first stored row. Since setImage() no
    // longer flips on upload, texture row 0 = source row 0 = the TOP of the
    // image. So the screen-top corners (ly = -halfH) must use v=0, and the
    // screen-bottom corners (ly = +halfH) must use v=1.
    const corners: readonly (readonly [number, number, number, number])[] = [
      [-halfW, -halfH, 0, 0],
      [halfW, -halfH, 1, 0],
      [-halfW, halfH, 0, 1],
      [halfW, halfH, 1, 1],
    ];

    for (let i = 0; i < 4; i++) {
      const corner = corners[i];
      if (!corner) continue;
      const [lx, ly, u, v] = corner;
      const rx = lx * cos - ly * sin;
      const ry = lx * sin + ly * cos;
      const clipX = ((cx + rx) / cssSize.width) * 2 - 1;
      const clipY = 1 - ((cy + ry) / cssSize.height) * 2;
      const base = i * 4;
      this.vertexData[base] = clipX;
      this.vertexData[base + 1] = clipY;
      this.vertexData[base + 2] = u;
      this.vertexData[base + 3] = v;
    }

    gl.useProgram(this.program);
    this.setUniforms(adjustments, advanced);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.texLoc ?? null, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.texture);
    gl.deleteProgram(this.program);
  }
}
