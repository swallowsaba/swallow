import type { AdjustmentUniforms } from '@/features/adjustments/model/adjustment-math';
import type { AdvancedUniforms } from '@/features/adjustments/model/advanced-math';
import { NEUTRAL_ADVANCED } from '@/features/adjustments/model/advanced-math';
import type { CropRect } from '@/types';
import { FULL_CROP } from './crop-math';
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
uniform float u_distortion, u_vignetting, u_chromaticAberration, u_fisheye;
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

// --- lens: barrel/pincushion (or fisheye) UV remap, mirrors distortUv() ---
vec2 distortUv(vec2 uv, float amount, float aspect, float fisheye) {
  float cx = uv.x - 0.5;
  float cy = (uv.y - 0.5) / aspect;
  float r2 = cx * cx + cy * cy;
  float fBarrel = 1.0 + (amount / 300.0) * r2;
  float kFish = amount / 120.0;
  float fFish = 1.0 + kFish * r2 + kFish * kFish * r2 * r2 * 2.0;
  float f = mix(fBarrel, fFish, fisheye);
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

// --- tone curve: 5-point piecewise-linear, mirrors evalToneCurve() ---
// Endpoints (0,0) and (1,1) are fixed (pure black/white never move); the
// shadows/midtones/highlights sliders control interior points at x=0.25,
// 0.5, 0.75. Anchoring shadows/highlights at the absolute 0/1 endpoints
// instead (an earlier bug) left them no room to move in one direction.
vec3 toneCurve3(vec3 x, float sh, float mid, float hi) {
  vec3 yShadow = clamp(vec3(0.25 + sh / 200.0), 0.0, 1.0);
  vec3 yMid = clamp(vec3(0.5 + mid / 200.0), 0.0, 1.0);
  vec3 yHigh = clamp(vec3(0.75 + hi / 200.0), 0.0, 1.0);

  vec3 seg0 = mix(vec3(0.0), yShadow, clamp(x / 0.25, 0.0, 1.0));
  vec3 seg1 = mix(yShadow, yMid, clamp((x - 0.25) / 0.25, 0.0, 1.0));
  vec3 seg2 = mix(yMid, yHigh, clamp((x - 0.5) / 0.25, 0.0, 1.0));
  vec3 seg3 = mix(yHigh, vec3(1.0), clamp((x - 0.75) / 0.25, 0.0, 1.0));

  vec3 out0 = mix(seg0, seg1, step(0.25, x));
  vec3 out1 = mix(out0, seg2, step(0.5, x));
  return clamp(mix(out1, seg3, step(0.75, x)), 0.0, 1.0);
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
    // Bands sit only 30-40deg apart; a wide radius (mirrors advanced-math.ts)
    // made adjacent sliders visibly affect each other's colors.
    float weight = max(0.0, 1.0 - dist / 20.0);
    if (weight <= 0.0) continue;
    hueShift += u_hslHue[i] * 0.3 * weight;
    satAdd += (u_hslSat[i] / 100.0) * weight;
    lumAdd += (u_hslLum[i] / 100.0) * 0.25 * weight;
  }
  return hsl2rgb(hsl.x + hueShift, clamp(hsl.y * (1.0 + satAdd), 0.0, 1.0), clamp(hsl.z + lumAdd, 0.0, 1.0));
}

// Everything from the raw texture sample through Tone/Color (HSL). Used both
// for the center pixel and for the neighbor samples the Detail effects blur
// together — sampling those neighbors from the RAW texture instead (an
// earlier bug) compared an edited pixel against unedited neighbors, so
// Sharpen/Clarity/Denoise measured the size of the user's OTHER edits rather
// than local detail, and pushed colors around unpredictably.
vec3 basePipeline(vec2 uv) {
  vec3 texRgb;
  if (abs(u_chromaticAberration) > 0.01) {
    vec2 caOff = (uv - 0.5) * (u_chromaticAberration / 1000.0);
    texRgb = vec3(
      texture(u_tex, uv + caOff).r,
      texture(u_tex, uv).g,
      texture(u_tex, uv - caOff).b
    );
  } else {
    texRgb = texture(u_tex, uv).rgb;
  }

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

  s = toneCurve3(s, u_toneShadows, u_toneMid, u_toneHighlights);
  s = applyHslBands(s);
  return s;
}

void main() {
  float aspect = u_texel.y / max(u_texel.x, 1e-6);
  vec2 duv = distortUv(v_uv, u_distortion, aspect, u_fisheye);

  vec3 s = basePipeline(duv);
  float texA = texture(u_tex, duv).a;

  // Detail tab: cheap 4-neighbor box blur, computed from the SAME processed
  // pipeline (not the raw texture — see basePipeline's comment) so it's a
  // fair local-detail reference for clarity/sharpening/noise reduction.
  vec2 texel = u_texel * max(u_sharpenRadius, 0.5);
  vec3 blur = (
    basePipeline(duv + vec2(texel.x, 0.0)) +
    basePipeline(duv - vec2(texel.x, 0.0)) +
    basePipeline(duv + vec2(0.0, texel.y)) +
    basePipeline(duv - vec2(0.0, texel.y))
  ) * 0.25;

  s += (s - blur) * (u_sharpenAmount / 100.0) * 1.5;
  // Only taper clarity near the TRUE extremes (within ~12% of pure black or
  // white) to avoid clipping/halos there — a full linear falloff across the
  // whole tonal range (an earlier version) attenuated clarity across most of
  // a typical photo, making it feel like it "didn't work".
  float lumC = dot(s, LUMA);
  float distFromExtreme = min(lumC, 1.0 - lumC);
  float midWeight = smoothstep(0.0, 0.12, distFromExtreme);
  s += (s - blur) * (u_clarity / 100.0) * 0.6 * midWeight;
  s += (s - blur) * (u_texture / 100.0) * 0.45;

  float denoiseT = clamp(u_noiseReduction / 100.0, 0.0, 1.0);
  float colorDenoiseT = clamp(u_colorNoiseReduction / 100.0, 0.0, 1.0);
  if (denoiseT > 0.0 || colorDenoiseT > 0.0) {
    // Noise reduction needs a much wider averaging radius than
    // sharpen/clarity's tight edge-detection radius to meaningfully smooth
    // grain — reusing that 1-texel radius (an earlier version) was too
    // narrow to visibly do anything. This is a separate, wider blur so
    // sharpen/clarity keep their precise, narrow radius.
    vec2 wideTexel = u_texel * 4.0;
    vec3 wideBlur = (
      basePipeline(duv + vec2(wideTexel.x, 0.0)) +
      basePipeline(duv - vec2(wideTexel.x, 0.0)) +
      basePipeline(duv + vec2(0.0, wideTexel.y)) +
      basePipeline(duv - vec2(0.0, wideTexel.y)) +
      basePipeline(duv + wideTexel) +
      basePipeline(duv - wideTexel) +
      basePipeline(duv + vec2(wideTexel.x, -wideTexel.y)) +
      basePipeline(duv + vec2(-wideTexel.x, wideTexel.y))
    ) * 0.125;

    // Edge-aware weighting: a plain mix toward the blur (an earlier version)
    // smooths real edges and detail just as much as actual noise, which is
    // indistinguishable from simply blurring the whole image. Scale the
    // effect down wherever the pixel differs a lot from its neighborhood
    // average — that's much more likely to be a genuine edge than noise —
    // and keep it at full strength in flat, low-detail areas where noise
    // actually shows up.
    float localDiff = length(s - wideBlur);
    float edgeAware = 1.0 - smoothstep(0.02, 0.12, localDiff);
    float lumDenoise = denoiseT * edgeAware;
    // Color noise is diffuse chroma speckling rather than structural detail,
    // so it can stay more effective near edges than luminance smoothing.
    float chromaDenoise = colorDenoiseT * mix(1.0, edgeAware, 0.5);

    s = mix(s, wideBlur, lumDenoise);
    float lumS = dot(s, LUMA);
    float lumB = dot(wideBlur, LUMA);
    vec3 chroma = mix(s - vec3(lumS), wideBlur - vec3(lumB), chromaDenoise);
    s = vec3(lumS) + chroma;
  }

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
  'u_fisheye',
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
    gl.uniform1f(this.uniforms.u_fisheye ?? null, adv.fisheye ? 1 : 0);

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
    crop: CropRect = FULL_CROP,
  ): void {
    const gl = this.gl;
    this.resize(Math.round(cssSize.width * dpr), Math.round(cssSize.height * dpr));

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.imageSize.width === 0) return;

    // The crop rect is normalized (0..1) against the FULL source image. The
    // geometry uses the cropped (effective) pixel size so "scale" continues
    // to mean "cropped image at 1x", matching the viewport fit/fill math.
    const croppedW = this.imageSize.width * crop.width;
    const croppedH = this.imageSize.height * crop.height;
    const halfW = (croppedW * view.scale) / 2;
    const halfH = (croppedH * view.scale) / 2;
    const rad = (view.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cx = cssSize.width / 2 + view.offset.x;
    const cy = cssSize.height / 2 + view.offset.y;

    // UV v=0 samples the texture's first stored row. Since setImage() no
    // longer flips on upload, texture row 0 = source row 0 = the TOP of the
    // image. So the screen-top corners (ly = -halfH) must use v=0, and the
    // screen-bottom corners (ly = +halfH) must use v=1. UVs are remapped from
    // the full [0,1] range to the crop sub-rectangle.
    const u0 = crop.x;
    const u1 = crop.x + crop.width;
    const v0 = crop.y;
    const v1 = crop.y + crop.height;
    const corners: readonly (readonly [number, number, number, number])[] = [
      [-halfW, -halfH, u0, v0],
      [halfW, -halfH, u1, v0],
      [-halfW, halfH, u0, v1],
      [halfW, halfH, u1, v1],
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
