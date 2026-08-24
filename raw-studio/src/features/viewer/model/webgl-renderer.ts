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
uniform sampler2D u_curveLut;
uniform vec3 u_gradeShadows, u_gradeMidtones, u_gradeHighlights, u_gradeGlobal;
uniform float u_gradeBlending, u_gradeBalance, u_gradeActive;
uniform float u_hslHue[8], u_hslSat[8], u_hslLum[8];
uniform float u_clarity, u_texture, u_dehaze, u_sharpenAmount, u_sharpenRadius;
uniform float u_deblurAmount, u_deblurActive;
uniform float u_noiseReduction, u_colorNoiseReduction;
uniform float u_distortion, u_vignetting, u_chromaticAberration, u_fisheye;
uniform float u_grainAmount, u_grainFrequency, u_grainActive;
uniform float u_pcvAmount, u_pcvMidpoint, u_pcvRoundness, u_pcvFeather, u_pcvActive;
uniform float u_showClipping;
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
// --- post-crop vignette (mirrors postcrop-vignette.ts), in cropped uv space ---
float postCropVignette(vec2 uv) {
  float amt = clamp(u_pcvAmount, -100.0, 100.0) / 100.0;
  if (amt == 0.0) return 1.0;
  float cx = uv.x - 0.5;
  float cy = uv.y - 0.5;
  float circular = min(1.0, length(vec2(cx, cy)) / 0.70710678);
  float rect = min(1.0, max(abs(cx), abs(cy)) / 0.5);
  float round = clamp(u_pcvRoundness, -100.0, 100.0) / 100.0;
  float r = mix(rect, circular, (round + 1.0) * 0.5);
  float mid = clamp(u_pcvMidpoint, 0.0, 100.0) / 100.0;
  float feather = max(0.001, clamp(u_pcvFeather, 0.0, 100.0) / 100.0);
  float t = smoothstep(mid, min(1.0, mid + feather), r);
  return 1.0 - amt * t;
}

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

// Free-form tone curves via a 256x1 LUT: per-channel R/G/B (.r/.g/.b) applied
// first, then the master rgb curve (.a). Identity LUT => no-op.
vec3 applyCurves(vec3 c) {
  vec3 s = clamp(c, 0.0, 1.0);
  float r1 = texture(u_curveLut, vec2(s.r, 0.5)).r;
  float g1 = texture(u_curveLut, vec2(s.g, 0.5)).g;
  float b1 = texture(u_curveLut, vec2(s.b, 0.5)).b;
  float r2 = texture(u_curveLut, vec2(r1, 0.5)).a;
  float g2 = texture(u_curveLut, vec2(g1, 0.5)).a;
  float b2 = texture(u_curveLut, vec2(b1, 0.5)).a;
  return vec3(r2, g2, b2);
}

// --- color grading (mirrors color-grading.ts) ---
vec3 gradeTint(float hue) {
  float h = mod(hue, 360.0);
  float x = 1.0 - abs(mod(h / 60.0, 2.0) - 1.0);
  if (h < 60.0) return vec3(1.0, x, 0.0);
  if (h < 120.0) return vec3(x, 1.0, 0.0);
  if (h < 180.0) return vec3(0.0, 1.0, x);
  if (h < 240.0) return vec3(0.0, x, 1.0);
  if (h < 300.0) return vec3(x, 0.0, 1.0);
  return vec3(1.0, 0.0, x);
}

// wheel = vec3(hue, saturation -100..100, luminance -100..100)
vec3 gradeWheel(vec3 c, vec3 wheel, float weight) {
  if (weight <= 0.0 || (wheel.y == 0.0 && wheel.z == 0.0)) return c;
  vec3 tint = gradeTint(wheel.x);
  float sat = (clamp(wheel.y, -100.0, 100.0) / 100.0) * weight;
  float lum = (clamp(wheel.z, -100.0, 100.0) / 100.0) * weight * 0.5;
  vec3 mixed = c + (tint - c) * max(0.0, sat) * 0.5;
  return clamp(mixed + lum, 0.0, 1.0);
}

vec3 applyGrading(vec3 c) {
  if (u_gradeActive < 0.5) return c;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float mid = 0.5 + clamp(u_gradeBalance, -100.0, 100.0) / 500.0;
  float sh = 1.0 - smoothstep(0.0, mid, luma);
  float hi = smoothstep(mid, 1.0, luma);
  float md = max(0.0, 1.0 - sh - hi);
  float sum = sh + md + hi;
  if (sum <= 0.0) { sh = 0.0; md = 1.0; hi = 0.0; }
  else { sh /= sum; md /= sum; hi /= sum; }
  float blend = clamp(u_gradeBlending, 0.0, 100.0) / 100.0;
  vec3 out0 = gradeWheel(c, u_gradeShadows, sh * blend);
  out0 = gradeWheel(out0, u_gradeMidtones, md * blend);
  out0 = gradeWheel(out0, u_gradeHighlights, hi * blend);
  return gradeWheel(out0, u_gradeGlobal, 1.0);
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

  s = applyCurves(s);
  s = applyHslBands(s);
  s = applyGrading(s);
  return s;
}

void main() {
  float aspect = u_texel.y / max(u_texel.x, 1e-6);
  vec2 duv = distortUv(v_uv, u_distortion, aspect, u_fisheye);

  vec3 s = basePipeline(duv);
  float texA = texture(u_tex, duv).a;

  // ===== Detail pipeline v2: denoise FIRST (bilateral, edge-preserving), then
  // sharpen the cleaned result with a noise-aware unsharp. This ordering is the
  // fix for "sharpen makes noise worse": we never sharpen raw grain. Mirrors
  // detail-v2.ts. =====
  float denoiseT = clamp(u_noiseReduction / 100.0, 0.0, 1.0);
  float colorDenoiseT = clamp(u_colorNoiseReduction / 100.0, 0.0, 1.0);
  // denoise range sigma (mirrors denoiseSigma): 0 disables, else 0.03..0.25
  float dnSigma = denoiseT <= 0.0 ? 0.0 : 0.03 + denoiseT * 0.22;

  if (dnSigma > 0.0 || colorDenoiseT > 0.0) {
    // 8-neighbor bilateral over a moderate radius. Spatial weight is 1.0 for
    // 4-neighbors and ~0.7 for diagonals; range weight uses luma difference so
    // color speckle doesn't break luminance edges.
    vec2 dt = u_texel * 2.0;
    vec3 n0 = basePipeline(duv + vec2(dt.x, 0.0));
    vec3 n1 = basePipeline(duv - vec2(dt.x, 0.0));
    vec3 n2 = basePipeline(duv + vec2(0.0, dt.y));
    vec3 n3 = basePipeline(duv - vec2(0.0, dt.y));
    vec3 n4 = basePipeline(duv + dt);
    vec3 n5 = basePipeline(duv - dt);
    vec3 n6 = basePipeline(duv + vec2(dt.x, -dt.y));
    vec3 n7 = basePipeline(duv + vec2(-dt.x, dt.y));
    float lc = dot(s, LUMA);
    // sigma is on luma; guard against 0.
    float sig = max(dnSigma, 0.0001);
    // accumulate bilateral for luma smoothing
    vec3 accum = s;
    float wsum = 1.0;
    #define BILAT(nv, sp) { float dl = (dot((nv),LUMA)-lc)/sig; float w = (sp) * exp(-0.5 * dl * dl); accum += (nv) * w; wsum += w; }
    BILAT(n0, 1.0) BILAT(n1, 1.0) BILAT(n2, 1.0) BILAT(n3, 1.0)
    BILAT(n4, 0.7) BILAT(n5, 0.7) BILAT(n6, 0.7) BILAT(n7, 0.7)
    #undef BILAT
    vec3 denoised = accum / wsum;

    // Luminance denoise: keep chroma of s, take luma from the bilateral result.
    float lumD = dot(denoised, LUMA);
    vec3 lumaDenoised = s + (lumD - lc); // shift luma only
    s = (dnSigma > 0.0) ? lumaDenoised : s;

    // Chroma denoise: pull chroma toward a plain wide average (chroma noise is
    // low-frequency speckle; a mean is fine and stronger near edges is OK).
    if (colorDenoiseT > 0.0) {
      vec3 mean = (n0+n1+n2+n3+n4+n5+n6+n7) * 0.125;
      float lumS = dot(s, LUMA);
      float lumM = dot(mean, LUMA);
      vec3 chroma = mix(s - vec3(lumS), mean - vec3(lumM), colorDenoiseT);
      s = vec3(lumS) + chroma;
    }
  }

  // Local average for sharpen/clarity/texture, from the (now denoised) pipeline.
  vec2 texel = u_texel * max(u_sharpenRadius, 0.5);
  vec3 blur = (
    basePipeline(duv + vec2(texel.x, 0.0)) +
    basePipeline(duv - vec2(texel.x, 0.0)) +
    basePipeline(duv + vec2(0.0, texel.y)) +
    basePipeline(duv - vec2(0.0, texel.y))
  ) * 0.25;
  // Noise-aware sharpen (mirrors noiseAwareSharpen): boost only detail above the
  // noise floor, so residual grain isn't amplified. Per-channel.
  if (u_sharpenAmount > 0.0) {
    float amt = clamp(u_sharpenAmount, 0.0, 300.0) / 100.0;
    float floorN = 0.015;
    vec3 detail = s - blur;
    vec3 mag = abs(detail) + 1e-6;
    vec3 gated = detail * max(vec3(0.0), 1.0 - floorN / mag);
    s = clamp(s + gated * amt, 0.0, 1.0);
  }

  // Focus recovery / deblur: wider-radius, halo-suppressed unsharp per channel
  // (mirrors deblur.ts). Applied after denoise+sharpen on the cleaned signal.
  if (u_deblurActive > 0.5) {
    vec2 wtexel = u_texel * 2.5;
    vec3 wblur = (
      basePipeline(duv + vec2(wtexel.x, 0.0)) +
      basePipeline(duv - vec2(wtexel.x, 0.0)) +
      basePipeline(duv + vec2(0.0, wtexel.y)) +
      basePipeline(duv - vec2(0.0, wtexel.y)) +
      basePipeline(duv + wtexel) +
      basePipeline(duv - wtexel)
    ) / 6.0;
    float amt = clamp(u_deblurAmount, 0.0, 100.0) / 100.0;
    float thresh = 0.02;
    vec3 detail = s - wblur;
    vec3 mag = abs(detail);
    vec3 sgn = sign(detail);
    vec3 soft = detail - sgn * thresh;
    vec3 boost = soft * amt * 2.0;
    vec3 limit = mag * 1.5;
    vec3 limited = clamp(boost, -limit, limit);
    vec3 mask = step(vec3(thresh), mag);
    s = clamp(s + limited * mask, 0.0, 1.0);
  }
  // Clarity/texture: local-contrast on the cleaned signal. Taper clarity only
  // near the true extremes to avoid halos.
  float lumC = dot(s, LUMA);
  float distFromExtreme = min(lumC, 1.0 - lumC);
  float midWeight = smoothstep(0.0, 0.12, distFromExtreme);
  s += (s - blur) * (u_clarity / 100.0) * 0.6 * midWeight;
  s += (s - blur) * (u_texture / 100.0) * 0.8;

  // Dehaze, bidirectional (mirrors dehaze.ts): positive clears haze, negative
  // adds a veil. Contrast is floored at 0 and the black-lift is clamped so the
  // transform never inverts.
  float dehazeT = clamp(u_dehaze, -300.0, 300.0) / 100.0;
  float dehazeC = max(0.0, 1.0 + dehazeT * 0.5);
  float dehazeB = max(dehazeT * 0.1, -dehazeC);
  s = (s - 0.5) * dehazeC + 0.5 - dehazeB * (1.0 - s);

  s = clamp(s, 0.0, 1.0) * vignetteFactor(duv, u_vignetting);

  s = pow(max(s, 0.0), vec3(1.0 / u_gamma));
  if (u_pcvActive > 0.5) {
    s *= postCropVignette(v_uv);
  }
  if (u_grainActive > 0.5) {
    // Value-noise grain: hash a quantized UV cell, luminance-weighted so
    // midtones get the most grain (like real film).
    vec2 cell = floor(v_uv * u_grainFrequency);
    float n = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    float luma = dot(s, vec3(0.299, 0.587, 0.114));
    float weight = 1.0 - abs(luma - 0.5) * 1.4; // peak at mid-grey
    s += n * u_grainAmount * max(0.0, weight);
  }
  if (u_showClipping > 0.5) {
    vec3 c = clamp(s, 0.0, 1.0);
    float mx = max(max(c.r, c.g), c.b);
    float mn = min(min(c.r, c.g), c.b);
    if (mx >= 0.996) s = vec3(1.0, 0.0, 0.0);      // highlight clip
    else if (mn <= 0.004) s = vec3(0.0, 0.4, 1.0); // shadow clip
  }
  outColor = vec4(clamp(s, 0.0, 1.0), texA);
}`;

/**
 * Present shader: draw a finished offscreen texture (already fully adjusted and
 * mask-composited, in cropped-image space) to the screen. The vertex positions
 * carry the view transform (zoom/pan/rotate) computed on the CPU, exactly like
 * the main pass; here the fragment stage is a plain sampler.
 */
const PRESENT_VERTEX_SRC = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const PRESENT_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 outColor;
void main() {
  outColor = texture(u_tex, v_uv);
}`;

/**
 * Composite shader: blend a mask layer (src) over the accumulator (dst) by the
 * mask's coverage. `out = mix(dst, src, maskAlpha)`. The mask texture is stored
 * top-row-first (v=0 at image top) while the framebuffers put image-top at t=1,
 * so the mask is sampled with a flipped t to line up.
 */
const COMPOSITE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_dst;
uniform sampler2D u_src;
uniform sampler2D u_mask;
uniform float u_strength;
out vec4 outColor;
void main() {
  vec4 dst = texture(u_dst, v_uv);
  vec4 src = texture(u_src, v_uv);
  float a = texture(u_mask, vec2(v_uv.x, 1.0 - v_uv.y)).r * u_strength;
  outColor = mix(dst, src, clamp(a, 0.0, 1.0));
}`;

/**
 * Warp-present shader: like the plain present pass, but the sample position is
 * offset by a displacement read from a small field texture (liquify). The field
 * encodes (du, dv) in R,G over [-maxDisp, maxDisp]; it is stored row 0 = image
 * top (sampled with a flipped t like masks), and dv is image-space (down
 * positive) while the accumulator's t is up positive, so v is offset by -dv.
 */
const WARP_PRESENT_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform sampler2D u_warp;
uniform float u_maxDisp;
out vec4 outColor;
void main() {
  vec2 w = texture(u_warp, vec2(v_uv.x, 1.0 - v_uv.y)).rg;
  vec2 d = (w * 2.0 - 1.0) * u_maxDisp;
  vec2 src = vec2(v_uv.x + d.x, v_uv.y - d.y);
  outColor = texture(u_tex, clamp(src, 0.0, 1.0));
}`;

/** A rasterized liquify displacement field (8-bit RGBA, row 0 = image top). */
export interface WarpField {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  /** Must match the CPU encoder's WARP_MAX_DISP. */
  readonly maxDisp: number;
}

/** One mask layer to composite: the adjustments to apply inside it, plus its
 *  rasterized coverage (8-bit, row 0 = image top). */
export interface MaskLayer {
  readonly uniforms: AdjustmentUniforms;
  readonly advanced: AdvancedUniforms;
  readonly alpha: Uint8ClampedArray;
  readonly alphaWidth: number;
  readonly alphaHeight: number;
  /** Overall strength 0..1 (e.g. a disabled-but-previewed mask). Default 1. */
  readonly strength?: number;
}

/** Longest edge of the offscreen working buffers used for mask compositing.
 *  Keeps memory/fill bounded on huge RAW files; masks are smooth so the mild
 *  downscale is visually harmless and the final present still samples this. */
const MAX_MASK_WORK = 2048;

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
  'u_curveLut',
  'u_gradeShadows',
  'u_gradeMidtones',
  'u_gradeHighlights',
  'u_gradeGlobal',
  'u_gradeBlending',
  'u_gradeBalance',
  'u_gradeActive',
  'u_grainAmount',
  'u_grainFrequency',
  'u_grainActive',
  'u_pcvAmount',
  'u_pcvMidpoint',
  'u_pcvRoundness',
  'u_pcvFeather',
  'u_pcvActive',
  'u_showClipping',
  'u_clarity',
  'u_texture',
  'u_dehaze',
  'u_sharpenAmount',
  'u_sharpenRadius',
  'u_deblurAmount',
  'u_deblurActive',
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
  private readonly curveLutTex: WebGLTexture;
  private readonly uniforms: Record<string, WebGLUniformLocation | null> = {};
  private readonly texLoc: WebGLUniformLocation | null;
  private texelLoc: WebGLUniformLocation | null = null;
  private imageSize: Size = { width: 0, height: 0 };
  private readonly vertexData = new Float32Array(16);

  // Lazily-created GL objects for masked (multi-pass) rendering. Null until the
  // first masked render, so the common no-mask path allocates nothing extra.
  private presentProgram: WebGLProgram | null = null;
  private presentVao: WebGLVertexArrayObject | null = null;
  private presentTexLoc: WebGLUniformLocation | null = null;
  private compositeProgram: WebGLProgram | null = null;
  private compositeVao: WebGLVertexArrayObject | null = null;
  private compositeLocs: {
    dst: WebGLUniformLocation | null;
    src: WebGLUniformLocation | null;
    mask: WebGLUniformLocation | null;
    strength: WebGLUniformLocation | null;
  } | null = null;
  private maskTexture: WebGLTexture | null = null;
  private warpProgram: WebGLProgram | null = null;
  private warpVao: WebGLVertexArrayObject | null = null;
  private warpTexture: WebGLTexture | null = null;
  private warpLocs: {
    tex: WebGLUniformLocation | null;
    warp: WebGLUniformLocation | null;
    maxDisp: WebGLUniformLocation | null;
  } | null = null;
  private fboSize: Size = { width: 0, height: 0 };
  private fboA: { fb: WebGLFramebuffer; tex: WebGLTexture } | null = null;
  private fboB: { fb: WebGLFramebuffer; tex: WebGLTexture } | null = null;
  private fboTemp: { fb: WebGLFramebuffer; tex: WebGLTexture } | null = null;

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

    // 256×1 RGBA tone-curve LUT, sampled with LINEAR for smooth interpolation.
    const curveLutTex = gl.createTexture();
    if (!curveLutTex) throw new Error('Failed to allocate curve LUT texture');
    this.curveLutTex = curveLutTex;
    gl.bindTexture(gl.TEXTURE_2D, curveLutTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
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

  private showClipping = false;

  /** Toggle the on-image clipping overlay ("blinkies"). */
  setClipping(on: boolean): void {
    this.showClipping = on;
  }

  private setUniforms(a: AdjustmentUniforms, adv: AdvancedUniforms): void {
    const gl = this.gl;

    // Upload + bind the tone-curve LUT on texture unit 7 (0/1/2 are used by the
    // image and mask/composite passes). Sampled by applyCurves() in the shader.
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, this.curveLutTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, adv.curveLut);
    gl.uniform1i(this.uniforms.u_curveLut ?? null, 7);
    gl.activeTexture(gl.TEXTURE0);

    const w3 = (v: readonly number[]): [number, number, number] => [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];
    gl.uniform3fv(this.uniforms.u_gradeShadows ?? null, w3(adv.gradeShadows));
    gl.uniform3fv(this.uniforms.u_gradeMidtones ?? null, w3(adv.gradeMidtones));
    gl.uniform3fv(this.uniforms.u_gradeHighlights ?? null, w3(adv.gradeHighlights));
    gl.uniform3fv(this.uniforms.u_gradeGlobal ?? null, w3(adv.gradeGlobal));
    gl.uniform1f(this.uniforms.u_gradeBlending ?? null, adv.gradeBlending);
    gl.uniform1f(this.uniforms.u_gradeBalance ?? null, adv.gradeBalance);
    gl.uniform1f(this.uniforms.u_gradeActive ?? null, adv.gradeActive ? 1 : 0);
    gl.uniform1f(this.uniforms.u_grainAmount ?? null, adv.grainAmount);
    gl.uniform1f(this.uniforms.u_grainFrequency ?? null, adv.grainFrequency);
    gl.uniform1f(this.uniforms.u_grainActive ?? null, adv.grainActive ? 1 : 0);
    gl.uniform1f(this.uniforms.u_pcvAmount ?? null, adv.pcvAmount);
    gl.uniform1f(this.uniforms.u_pcvMidpoint ?? null, adv.pcvMidpoint);
    gl.uniform1f(this.uniforms.u_pcvRoundness ?? null, adv.pcvRoundness);
    gl.uniform1f(this.uniforms.u_pcvFeather ?? null, adv.pcvFeather);
    gl.uniform1f(this.uniforms.u_pcvActive ?? null, adv.pcvActive ? 1 : 0);
    gl.uniform1f(this.uniforms.u_showClipping ?? null, this.showClipping ? 1 : 0);

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
    gl.uniform1f(this.uniforms.u_deblurAmount ?? null, adv.deblurAmount);
    gl.uniform1f(this.uniforms.u_deblurActive ?? null, adv.deblurActive ? 1 : 0);
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
    split?: {
      divider: number;
      beforeUniforms: AdjustmentUniforms;
      beforeAdvanced: AdvancedUniforms;
    },
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

    // Compare split: re-draw the left region with the "before" (neutral)
    // uniforms. Same quad, so the two halves line up exactly.
    if (split) {
      const wpx = gl.drawingBufferWidth;
      const hpx = gl.drawingBufferHeight;
      const dx = Math.max(0, Math.min(wpx, Math.round(split.divider * wpx)));
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, 0, dx, hpx);
      this.setUniforms(split.beforeUniforms, split.beforeAdvanced);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.uniform1i(this.texLoc ?? null, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.SCISSOR_TEST);
    }
    gl.bindVertexArray(null);
  }

  /** Compile the extra programs used for masking, once, on first use. */
  private ensureMaskPrograms(): void {
    if (this.presentProgram && this.compositeProgram) return;
    const gl = this.gl;

    const pvs = compileShader(gl, gl.VERTEX_SHADER, PRESENT_VERTEX_SRC);
    const pfs = compileShader(gl, gl.FRAGMENT_SHADER, PRESENT_FRAGMENT_SRC);
    this.presentProgram = linkProgram(gl, pvs, pfs);
    gl.deleteShader(pvs);
    gl.deleteShader(pfs);
    this.presentTexLoc = gl.getUniformLocation(this.presentProgram, 'u_tex');
    this.presentVao = this.makeQuadVao(this.presentProgram);

    const cvs = compileShader(gl, gl.VERTEX_SHADER, PRESENT_VERTEX_SRC);
    const cfs = compileShader(gl, gl.FRAGMENT_SHADER, COMPOSITE_FRAGMENT_SRC);
    this.compositeProgram = linkProgram(gl, cvs, cfs);
    gl.deleteShader(cvs);
    gl.deleteShader(cfs);
    this.compositeLocs = {
      dst: gl.getUniformLocation(this.compositeProgram, 'u_dst'),
      src: gl.getUniformLocation(this.compositeProgram, 'u_src'),
      mask: gl.getUniformLocation(this.compositeProgram, 'u_mask'),
      strength: gl.getUniformLocation(this.compositeProgram, 'u_strength'),
    };
    this.compositeVao = this.makeQuadVao(this.compositeProgram);

    const maskTex = gl.createTexture();
    if (!maskTex) throw new Error('Failed to allocate mask texture');
    this.maskTexture = maskTex;
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Compile the warp-present program and its field texture, once. */
  private ensureWarpProgram(): void {
    if (this.warpProgram) return;
    const gl = this.gl;
    const vs = compileShader(gl, gl.VERTEX_SHADER, PRESENT_VERTEX_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, WARP_PRESENT_FRAGMENT_SRC);
    this.warpProgram = linkProgram(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.warpLocs = {
      tex: gl.getUniformLocation(this.warpProgram, 'u_tex'),
      warp: gl.getUniformLocation(this.warpProgram, 'u_warp'),
      maxDisp: gl.getUniformLocation(this.warpProgram, 'u_maxDisp'),
    };
    this.warpVao = this.makeQuadVao(this.warpProgram);
    const tex = gl.createTexture();
    if (!tex) throw new Error('Failed to allocate warp texture');
    this.warpTexture = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** A VAO wired to `this.buffer` (interleaved pos+uv) for the given program. */
  private makeQuadVao(program: WebGLProgram): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to allocate VAO');
    const posLoc = gl.getAttribLocation(program, 'a_pos');
    const uvLoc = gl.getAttribLocation(program, 'a_uv');
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
    return vao;
  }

  private makeFbo(w: number, h: number): { fb: WebGLFramebuffer; tex: WebGLTexture } {
    const gl = this.gl;
    const tex = gl.createTexture();
    const fb = gl.createFramebuffer();
    if (!tex || !fb) throw new Error('Failed to allocate framebuffer');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex };
  }

  private ensureFbos(w: number, h: number): void {
    if (this.fboA && this.fboSize.width === w && this.fboSize.height === h) return;
    this.disposeFbos();
    this.fboA = this.makeFbo(w, h);
    this.fboB = this.makeFbo(w, h);
    this.fboTemp = this.makeFbo(w, h);
    this.fboSize = { width: w, height: h };
  }

  private disposeFbos(): void {
    const gl = this.gl;
    for (const fbo of [this.fboA, this.fboB, this.fboTemp]) {
      if (fbo) {
        gl.deleteFramebuffer(fbo.fb);
        gl.deleteTexture(fbo.tex);
      }
    }
    this.fboA = this.fboB = this.fboTemp = null;
    this.fboSize = { width: 0, height: 0 };
  }

  /** Write a full-target quad (clip -1..1) with the given source UV sub-rect. */
  private writeFboQuad(crop: CropRect): void {
    const u0 = crop.x;
    const u1 = crop.x + crop.width;
    const v0 = crop.y;
    const v1 = crop.y + crop.height;
    // clip x, clip y, u, v — TRIANGLE_STRIP order. clip y=+1 (fbo top, t=1)
    // samples image top (v0), so fbo row t=1 == image top.
    this.vertexData.set([
      -1, -1, u0, v1,
      1, -1, u1, v1,
      -1, 1, u0, v0,
      1, 1, u1, v0,
    ]);
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData);
  }

  /** Write a full-target quad with plain 0..1 UVs (for composite/present when
   *  sampling an already-cropped fbo texture). */
  private writeFullQuad(): void {
    this.vertexData.set([
      -1, -1, 0, 0,
      1, -1, 1, 0,
      -1, 1, 0, 1,
      1, 1, 1, 1,
    ]);
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData);
  }

  /** Render the adjustment pipeline for one uniform set into a framebuffer. */
  private drawAdjustToFbo(
    target: { fb: WebGLFramebuffer },
    w: number,
    h: number,
    a: AdjustmentUniforms,
    adv: AdvancedUniforms,
    crop: CropRect,
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.program);
    this.setUniforms(a, adv);
    this.writeFboQuad(crop);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.texLoc ?? null, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  /**
   * Masked render. Falls back to the plain single pass when there are no
   * layers. Otherwise: render the global result to an accumulator, then for
   * each mask render its adjusted variant and blend it in by coverage, and
   * finally present the accumulator to screen with the view transform.
   *
   * Unverified in this environment: the multi-pass GL path needs a real WebGL2
   * context to confirm visually. The single-pass path (no masks) is unchanged.
   */
  renderWithMasks(
    view: ViewTransform,
    cssSize: Size,
    dpr: number,
    base: { uniforms: AdjustmentUniforms; advanced: AdvancedUniforms },
    crop: CropRect,
    layers: readonly MaskLayer[],
    warp: WarpField | null = null,
    maxWork: number = MAX_MASK_WORK,
  ): void {
    if (layers.length === 0 && !warp) {
      this.render(view, cssSize, dpr, base.uniforms, base.advanced, crop);
      return;
    }
    const gl = this.gl;
    if (this.imageSize.width === 0) return;
    this.ensureMaskPrograms();
    if (warp) this.ensureWarpProgram();

    // Working buffer size: the cropped image, capped to maxWork (viewer uses a
    // modest cap for perf; export passes the full target for crisp output).
    const croppedW = Math.max(1, Math.round(this.imageSize.width * crop.width));
    const croppedH = Math.max(1, Math.round(this.imageSize.height * crop.height));
    const scale = Math.min(1, maxWork / Math.max(croppedW, croppedH));
    const w = Math.max(1, Math.round(croppedW * scale));
    const h = Math.max(1, Math.round(croppedH * scale));
    this.ensureFbos(w, h);

    const A = this.fboA;
    const B = this.fboB;
    const temp = this.fboTemp;
    const comp = this.compositeProgram;
    const locs = this.compositeLocs;
    const maskTex = this.maskTexture;
    if (!A || !B || !temp || !comp || !locs || !maskTex || !this.compositeVao) return;

    gl.disable(gl.BLEND);

    // Pass 0: global adjustments → accumulator A.
    this.drawAdjustToFbo(A, w, h, base.uniforms, base.advanced, crop);

    // Ping-pong accumulator: `src`/`dst` alternate as we fold in each layer.
    let acc = A;
    let other = B;
    for (const layer of layers) {
      // Layer color → temp.
      this.drawAdjustToFbo(temp, w, h, layer.uniforms, layer.advanced, crop);

      // Upload this layer's coverage. Single-channel rows may not be a
      // multiple of 4 bytes, so relax the unpack alignment to avoid row skew.
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R8,
        layer.alphaWidth,
        layer.alphaHeight,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        layer.alpha,
      );

      // Composite temp over acc, into other.
      gl.bindFramebuffer(gl.FRAMEBUFFER, other.fb);
      gl.viewport(0, 0, w, h);
      gl.useProgram(comp);
      this.writeFullQuad();
      gl.bindVertexArray(this.compositeVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, acc.tex);
      gl.uniform1i(locs.dst, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, temp.tex);
      gl.uniform1i(locs.src, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.uniform1i(locs.mask, 2);
      gl.uniform1f(locs.strength, layer.strength ?? 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);

      const swap = acc;
      acc = other;
      other = swap;
    }

    // Present `acc` to screen with the view transform (warped if requested).
    if (warp) {
      this.presentWarpedToScreen(acc.tex, view, cssSize, dpr, croppedW, croppedH, warp);
    } else {
      this.presentToScreen(acc.tex, view, cssSize, dpr, croppedW, croppedH);
    }
  }

  /** Draw a finished offscreen texture to the default framebuffer, positioned
   *  by the view transform (mirrors the corner math in `render`). */
  private presentToScreen(
    tex: WebGLTexture,
    view: ViewTransform,
    cssSize: Size,
    dpr: number,
    croppedW: number,
    croppedH: number,
  ): void {
    const gl = this.gl;
    const program = this.presentProgram;
    const vao = this.presentVao;
    if (!program || !vao) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.resize(Math.round(cssSize.width * dpr), Math.round(cssSize.height * dpr));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const halfW = (croppedW * view.scale) / 2;
    const halfH = (croppedH * view.scale) / 2;
    const rad = (view.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cx = cssSize.width / 2 + view.offset.x;
    const cy = cssSize.height / 2 + view.offset.y;

    // UV v=1 = image top (fbo t=1), so screen-top corners use v=1.
    const corners: readonly (readonly [number, number, number, number])[] = [
      [-halfW, -halfH, 0, 1],
      [halfW, -halfH, 1, 1],
      [-halfW, halfH, 0, 0],
      [halfW, halfH, 1, 0],
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

    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.presentTexLoc ?? null, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  /** Like presentToScreen, but offsets sampling by a liquify displacement field. */
  private presentWarpedToScreen(
    tex: WebGLTexture,
    view: ViewTransform,
    cssSize: Size,
    dpr: number,
    croppedW: number,
    croppedH: number,
    warp: WarpField,
  ): void {
    const gl = this.gl;
    const program = this.warpProgram;
    const vao = this.warpVao;
    const locs = this.warpLocs;
    const warpTex = this.warpTexture;
    if (!program || !vao || !locs || !warpTex) {
      this.presentToScreen(tex, view, cssSize, dpr, croppedW, croppedH);
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.resize(Math.round(cssSize.width * dpr), Math.round(cssSize.height * dpr));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const halfW = (croppedW * view.scale) / 2;
    const halfH = (croppedH * view.scale) / 2;
    const rad = (view.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cx = cssSize.width / 2 + view.offset.x;
    const cy = cssSize.height / 2 + view.offset.y;
    const corners: readonly (readonly [number, number, number, number])[] = [
      [-halfW, -halfH, 0, 1],
      [halfW, -halfH, 1, 1],
      [-halfW, halfH, 0, 0],
      [halfW, halfH, 1, 0],
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

    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(locs.tex, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, warpTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      warp.width,
      warp.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      warp.data,
    );
    gl.uniform1i(locs.warp, 1);
    gl.uniform1f(locs.maxDisp, warp.maxDisp);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.texture);
    gl.deleteProgram(this.program);
    this.disposeFbos();
    if (this.maskTexture) gl.deleteTexture(this.maskTexture);
    if (this.warpTexture) gl.deleteTexture(this.warpTexture);
    if (this.presentVao) gl.deleteVertexArray(this.presentVao);
    if (this.compositeVao) gl.deleteVertexArray(this.compositeVao);
    if (this.warpVao) gl.deleteVertexArray(this.warpVao);
    if (this.presentProgram) gl.deleteProgram(this.presentProgram);
    if (this.compositeProgram) gl.deleteProgram(this.compositeProgram);
    if (this.warpProgram) gl.deleteProgram(this.warpProgram);
  }
}
