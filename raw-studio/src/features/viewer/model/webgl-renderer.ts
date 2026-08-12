import type { AdjustmentUniforms } from '@/features/adjustments/model/adjustment-math';
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
out vec4 outColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 srgb2lin(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 lin2srgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec4 tex = texture(u_tex, v_uv);
  vec3 lin = srgb2lin(tex.rgb);

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

  s = pow(max(s, 0.0), vec3(1.0 / u_gamma));
  outColor = vec4(clamp(s, 0.0, 1.0), tex.a);
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
] as const;

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
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
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

  private setUniforms(a: AdjustmentUniforms): void {
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
  }

  render(view: ViewTransform, cssSize: Size, dpr: number, adjustments: AdjustmentUniforms): void {
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

    gl.useProgram(this.program);
    this.setUniforms(adjustments);
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
