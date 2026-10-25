import {
  cubeTexture,
  curveTable,
  gradeKernels,
  gradeOps,
  maxPassOps,
  type GradePass,
} from '../core/realtime-grade';
import type { Crop, MediaAsset } from '../core/types';
import { imageBlendModes, type ImageBlendMode } from '../core/image-compositing';

const vertex = `#version 300 es
in vec2 position;
out vec2 uv;
void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;
const ops = Object.entries(gradeOps)
  .map(([name, value]) => `#define OP_${name.toUpperCase()} ${value}`)
  .join('\n');
const blendModes = Object.fromEntries(
  imageBlendModes.map((mode, index) => [mode, index + 1]),
) as Record<ImageBlendMode, number>;
const kernels = Object.entries(gradeKernels)
  .map(([name, value]) => `#define K_${name.toUpperCase()} ${value}`)
  .join('\n');
// Operations work on gamma-encoded 0–1 values and clip after each filter, like
// FFmpeg's 8-bit chain. Luma/chroma filters use full-range BT.601.
const fragment = `#version 300 es
precision highp float;
precision highp sampler3D;
${ops}
${kernels}
#define MAX_OPS ${maxPassOps}
uniform sampler2D source;
uniform sampler2D curve;
uniform sampler3D lut;
uniform vec2 frame;
uniform vec4 region;
uniform int kernel;
uniform float kernelValue;
uniform int count;
uniform int op[MAX_OPS];
uniform vec4 a[MAX_OPS];
uniform vec4 b[MAX_OPS];
uniform float seed;
// Source sub-rectangle (bottom-left origin) for crops, and the layer below a blended layer.
uniform vec4 window;
uniform sampler2D base;
uniform vec4 baseWindow;
uniform int blend;
uniform float opacity;
in vec2 uv;
out vec4 color;

vec3 toYuv(vec3 c) {
  return vec3(dot(c, vec3(0.299, 0.587, 0.114)),
    dot(c, vec3(-0.168736, -0.331264, 0.5)), dot(c, vec3(0.5, -0.418688, -0.081312)));
}
vec3 toRgb(vec3 y) {
  return vec3(y.x + 1.402 * y.z, y.x - 0.344136 * y.y - 0.714136 * y.z, y.x + 1.772 * y.y);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// Decoded video is limited range; FFmpeg's luma filters see 16–235 values.
float limited(float y) { return (16.0 + 219.0 * y) / 255.0; }
float full(float y) { return (255.0 * y - 16.0) / 219.0; }
vec4 tex(vec2 q) { return texture(source, window.xy + q * window.zw); }
vec3 at(vec2 offset) { return tex(uv + vec2(offset.x, -offset.y) / frame).rgb; }
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031 + seed);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float balance(float v, float l, float s, float m) {
  s *= clamp((0.333 - l) * 4.0 + 0.5, 0.0, 1.0) * 0.7;
  m *= clamp((l - 0.333) * 4.0 + 0.5, 0.0, 1.0) * clamp((1.0 - l - 0.333) * 4.0 + 0.5, 0.0, 1.0) * 0.7;
  return clamp(v + s + m, 0.0, 1.0);
}
vec3 sampled(vec2 pixel) {
  if (kernel == K_BLURX || kernel == K_BLURY) {
    vec2 direction = kernel == K_BLURX ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    float sigma = kernelValue, reach = ceil(3.0 * sigma), steps = min(32.0, reach), stride = reach / steps;
    vec3 sum = vec3(0.0);
    float total = 0.0;
    for (int i = -32; i <= 32; i++) {
      if (abs(float(i)) > steps) continue;
      float x = float(i) * stride, w = exp(-0.5 * x * x / (sigma * sigma));
      sum += at(direction * x) * w;
      total += w;
    }
    return sum / total;
  }
  if (kernel == K_SHARPEN) {
    vec3 center = at(vec2(0.0));
    float mean = 0.0;
    for (int y = -2; y <= 2; y++)
      for (int x = -2; x <= 2; x++) mean += luma(at(vec2(x, y)));
    return clamp(center + kernelValue * (luma(center) - mean / 25.0), 0.0, 1.0);
  }
  if (kernel == K_PIXELATE) {
    vec2 origin = region.xy + floor((pixel - region.xy) / kernelValue) * kernelValue;
    vec2 size = min(vec2(kernelValue), region.xy + region.zw - origin);
    vec3 sum = vec3(0.0);
    for (int y = 0; y < 8; y++)
      for (int x = 0; x < 8; x++) {
        vec2 p = origin + (vec2(x, y) + 0.5) * size / 8.0;
        sum += tex(vec2(p.x, frame.y - p.y) / frame).rgb;
      }
    return sum / 64.0;
  }
  if (kernel == K_SKETCH) {
    float l[9];
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) l[(y + 1) * 3 + x + 1] = luma(at(vec2(x, y)));
    float gx = (l[2] + 2.0 * l[5] + l[8]) - (l[0] + 2.0 * l[3] + l[6]);
    float gy = (l[6] + 2.0 * l[7] + l[8]) - (l[0] + 2.0 * l[1] + l[2]);
    return vec3(smoothstep(0.05, 0.2, (abs(gx) + abs(gy)) * 0.25));
  }
  if (kernel == K_EMBOSS) {
    float weights[9] = float[9](-2.0, -1.0, 0.0, -1.0, 1.0, 1.0, 0.0, 1.0, 2.0);
    vec3 center = at(vec2(0.0));
    float y = 128.0 / 255.0;
    for (int j = -1; j <= 1; j++)
      for (int i = -1; i <= 1; i++) y += weights[(j + 1) * 3 + i + 1] * luma(at(vec2(i, j)));
    vec3 yuv = toYuv(center);
    return toRgb(vec3(clamp(y, 0.0, 1.0), yuv.yz));
  }
  return tex(uv).rgb;
}
// FFmpeg's blend filter: A is the adjusted layer, B the layer below.
vec3 blended(vec3 a, vec3 b) {
  if (blend == ${blendModes.multiply}) return a * b;
  if (blend == ${blendModes.screen}) return 1.0 - (1.0 - a) * (1.0 - b);
  if (blend == ${blendModes.overlay})
    return mix(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), step(0.5, a));
  if (blend == ${blendModes.hardlight})
    return mix(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), step(0.5, b));
  if (blend == ${blendModes.softlight}) return a * a + 2.0 * a * b * (1.0 - a);
  if (blend == ${blendModes.darken}) return min(a, b);
  if (blend == ${blendModes.lighten}) return max(a, b);
  if (blend == ${blendModes.difference}) return abs(a - b);
  return a;
}
void main() {
  vec2 pixel = vec2(uv.x, 1.0 - uv.y) * frame;
  vec3 c = clamp(sampled(pixel), 0.0, 1.0);
  for (int i = 0; i < MAX_OPS; i++) {
    if (i >= count) break;
    c = clamp(c, 0.0, 1.0);
    int kind = op[i];
    vec4 p = a[i], q = b[i];
    if (kind == OP_EXPOSURE) c *= p.x;
    else if (kind == OP_EQ) {
      vec3 yuv = toYuv(c);
      float v = p.y * (limited(yuv.x) - 0.5) + 0.5 + p.x;
      yuv.x = full(v <= 0.0 ? 0.0 : min(1.0, pow(v, 1.0 / p.w)));
      c = toRgb(vec3(yuv.x, yuv.yz * p.z));
    } else if (kind == OP_SHADOWSHIGHLIGHTS)
      c += (p.x * 64.0 * (1.0 - c) * (1.0 - c) + p.y * 64.0 * c * c) / 255.0;
    else if (kind == OP_VIBRANCE) {
      float saturation = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
      // FFmpeg's default vibrance luma coefficients.
      float l = dot(c, vec3(0.072186, 0.715158, 0.212656));
      c = mix(vec3(l), c, 1.0 + p.x * (1.0 + sign(p.x) * saturation));
    } else if (kind == OP_HUE) {
      vec3 yuv = toYuv(c);
      float angle = radians(p.x), s = sin(angle) * p.y, k = cos(angle) * p.y;
      c = toRgb(vec3(yuv.x, k * yuv.y - s * yuv.z, s * yuv.y + k * yuv.z));
    } else if (kind == OP_BALANCE) {
      float l = max(c.r, max(c.g, c.b)) + min(c.r, min(c.g, c.b));
      c = vec3(balance(c.r, l, p.x, q.x), balance(c.g, l, p.y, q.y), balance(c.b, l, p.z, q.z));
    } else if (kind == OP_VIGNETTE) {
      float distance = length(pixel - region.xy - region.zw * 0.5) / length(region.zw * 0.5);
      float k = cos(p.x * distance), f = distance > 1.0 ? 0.0 : k * k * k * k;
      vec3 yuv = toYuv(c);
      c = toRgb(vec3(full(limited(yuv.x) * f), yuv.yz * f));
    } else if (kind == OP_SEPIA) {
      float s = p.x;
      c = mat3(1.0 - s + 0.393 * s, 0.349 * s, 0.272 * s,
        0.769 * s, 1.0 - s + 0.686 * s, 0.534 * s,
        0.189 * s, 0.168 * s, 1.0 - s + 0.131 * s) * c;
    } else if (kind == OP_NEGATE) c = 1.0 - c;
    else if (kind == OP_POSTERIZE) c = floor(c * (p.x - 1.0) + 0.5) / (p.x - 1.0);
    else if (kind == OP_GRAIN) {
      vec3 noise = vec3(hash(pixel), hash(pixel + 17.0), hash(pixel + 41.0)) * 2.0 - 1.0;
      c = toRgb(toYuv(c) + noise * p.x / 255.0);
    } else if (kind == OP_CURVES) {
      vec3 x = clamp(c, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0;
      c = vec3(texture(curve, vec2(x.r, 0.5)).r, texture(curve, vec2(x.g, 0.5)).g,
        texture(curve, vec2(x.b, 0.5)).b);
    } else if (kind == OP_LUT) {
      vec3 x = clamp((c - p.xyz) / (q.xyz - p.xyz), 0.0, 1.0);
      c = texture(lut, x * ((q.w - 1.0) / q.w) + 0.5 / q.w).rgb;
    }
    // Exposure runs in floating point; FFmpeg clips it only at the next 8-bit stage.
    if (kind != OP_EXPOSURE) c = clamp(c, 0.0, 1.0);
  }
  if (blend > 0) {
    vec3 below = texture(base, baseWindow.xy + uv * baseWindow.zw).rgb;
    c = blend == ${blendModes.normal}
      ? c * opacity + below * (1.0 - opacity)
      : c + (blended(c, below) - c) * opacity;
  }
  color = vec4(clamp(c, 0.0, 1.0), tex(uv).a);
}`;

interface Target {
  texture: WebGLTexture;
  buffer: WebGLFramebuffer;
}

/** WebGL2 grading for one canvas. Textures for curves and LUTs are cached by their recipe value. */
export class GradeRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private source: WebGLTexture;
  private targets: Target[] = [];
  private targetSize = '';
  private floatTargets: boolean;
  /** CPU-emulated WebGL grades fewer pixels to keep playback smooth. */
  readonly software: boolean;
  get maxTextureSize(): number {
    return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE);
  }
  private curves = new Map<string, WebGLTexture>();
  private luts = new Map<
    string,
    { texture: WebGLTexture; size: number; min: number[]; max: number[] }
  >();

  /** `alpha` keeps transparent image pixels; video frames are opaque. */
  constructor(
    private canvas: HTMLCanvasElement | OffscreenCanvas,
    alpha = false,
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha,
      antialias: false,
      depth: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 is unavailable.');
    this.gl = gl;
    this.floatTargets = !!gl.getExtension('EXT_color_buffer_float');
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    this.software = /swiftshader|llvmpipe|softpipe|software/i.test(
      String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
    );
    const shader = (type: number, text: string) => {
      const value = gl.createShader(type)!;
      gl.shaderSource(value, text);
      gl.compileShader(value);
      if (!gl.getShaderParameter(value, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(value) ?? 'Shader compilation failed.');
      return value;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? 'Shader linking failed.');
    this.program = program;
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(this.uniform('source'), 0);
    gl.uniform1i(this.uniform('curve'), 1);
    gl.uniform1i(this.uniform('lut'), 2);
    gl.uniform1i(this.uniform('base'), 3);
    this.source = this.texture();
  }
  private uniform(name: string) {
    if (!this.uniforms.has(name))
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name)!;
  }
  private texture(filter: number = this.gl.LINEAR) {
    const gl = this.gl,
      texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }
  private ensureTargets(width: number, height: number) {
    const key = `${width}x${height}`;
    if (key === this.targetSize) return;
    const gl = this.gl;
    for (const target of this.targets) {
      gl.deleteTexture(target.texture);
      gl.deleteFramebuffer(target.buffer);
    }
    // Two ping-pong targets, plus one so a blended layer's input survives its passes.
    this.targets = [0, 1, 2].map(() => {
      const texture = this.texture();
      if (this.floatTargets)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const buffer = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      return { texture, buffer };
    });
    this.targetSize = key;
  }
  private curveTexture(curves: NonNullable<GradePass['ops'][number]['curves']>) {
    const key = JSON.stringify(curves);
    let texture = this.curves.get(key);
    if (!texture) {
      const gl = this.gl;
      texture = this.texture();
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        256,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        curveTable(curves),
      );
      if (this.curves.size >= 16) this.release(this.curves);
      this.curves.set(key, texture);
    }
    return texture;
  }
  private lutTexture(cube: string) {
    let entry = this.luts.get(cube);
    if (!entry) {
      const gl = this.gl,
        { size, min, max, data } = cubeTexture(cube),
        texture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_3D, texture);
      for (const parameter of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R])
        gl.texParameteri(gl.TEXTURE_3D, parameter, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, size, size, size, 0, gl.RGB, gl.FLOAT, data);
      if (this.luts.size >= 4) {
        for (const value of this.luts.values()) gl.deleteTexture(value.texture);
        this.luts.clear();
      }
      entry = { texture, size, min, max };
      this.luts.set(cube, entry);
    }
    return entry;
  }
  private release(cache: Map<string, WebGLTexture>) {
    for (const texture of cache.values()) this.gl.deleteTexture(texture);
    cache.clear();
  }
  /**
   * Draw one frame. `frame` is the graded picture size in pixels, so kernel radii,
   * pixelation blocks and the vignette match the export at any canvas resolution.
   * Pass `null` as the image to grade the previously uploaded picture again, and
   * `window` (top-left origin, 0–1) to grade a cropped part of it.
   */
  render(
    image: TexImageSource | null,
    passes: GradePass[],
    frame: { width: number; height: number },
    crop: Crop | null,
    seed = 0,
    window = { x: 0, y: 0, width: 1, height: 1 },
  ) {
    const gl = this.gl,
      { width, height } = this.canvas;
    gl.viewport(0, 0, width, height);
    const list: GradePass[] = passes.length ? passes : [{ kernel: 0, value: 0, ops: [] }];
    // Allocate before binding the source: texture creation changes the unit's binding.
    if (list.length > 1) this.ensureTargets(width, height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.source);
    if (image) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
    gl.uniform2f(this.uniform('frame'), frame.width, frame.height);
    gl.uniform4f(
      this.uniform('region'),
      crop?.x ?? 0,
      crop?.y ?? 0,
      crop?.width ?? frame.width,
      crop?.height ?? frame.height,
    );
    gl.uniform1f(this.uniform('seed'), seed);
    const cropped = [window.x, 1 - window.y - window.height, window.width, window.height],
      whole = [0, 0, 1, 1];
    let input = this.source,
      base = this.source;
    list.forEach((pass, index) => {
      const last = index === list.length - 1;
      if (pass.layerStart) base = input;
      const target = this.targets.find((item) => item.texture !== input && item.texture !== base);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, input);
      gl.uniform4fv(this.uniform('window'), input === this.source ? cropped : whole);
      gl.bindFramebuffer(gl.FRAMEBUFFER, last ? null : target!.buffer);
      gl.uniform1i(this.uniform('blend'), pass.blend ? blendModes[pass.blend] : 0);
      // Always rebind: a stale texture here could be this pass's render target.
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, pass.blend ? base : this.source);
      if (pass.blend) {
        gl.uniform4fv(this.uniform('baseWindow'), base === this.source ? cropped : whole);
        gl.uniform1f(this.uniform('opacity'), pass.opacity ?? 1);
      }
      gl.uniform1i(this.uniform('kernel'), pass.kernel);
      gl.uniform1f(this.uniform('kernelValue'), pass.value);
      gl.uniform1i(this.uniform('count'), pass.ops.length);
      const kinds = new Int32Array(maxPassOps),
        first = new Float32Array(maxPassOps * 4),
        second = new Float32Array(maxPassOps * 4);
      pass.ops.forEach((step, i) => {
        kinds[i] = step.op;
        first.set(step.a, i * 4);
        second.set(step.b, i * 4);
        if (step.curves) {
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, this.curveTexture(step.curves));
        }
        if (step.lut) {
          const lut = this.lutTexture(step.lut);
          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_3D, lut.texture);
          first.set([...lut.min, 0], i * 4);
          second.set([...lut.max, lut.size], i * 4);
        }
      });
      gl.uniform1iv(this.uniform('op'), kinds);
      gl.uniform4fv(this.uniform('a'), first);
      gl.uniform4fv(this.uniform('b'), second);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!last) input = target!.texture;
    });
  }
  dispose(lose = false) {
    const gl = this.gl;
    this.release(this.curves);
    for (const value of this.luts.values()) gl.deleteTexture(value.texture);
    this.luts.clear();
    for (const target of this.targets) {
      gl.deleteTexture(target.texture);
      gl.deleteFramebuffer(target.buffer);
    }
    gl.deleteTexture(this.source);
    gl.deleteProgram(this.program);
    if (lose) gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

let support: boolean | undefined;
/** Probe once with the real shader, so unsupported drivers keep the rendered preview path. */
export function supportsRealtimeGrade() {
  if (support !== undefined) return support;
  try {
    if (typeof document === 'undefined') return (support = false);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    new GradeRenderer(canvas).dispose(true);
    support = true;
  } catch {
    support = false;
  }
  return support;
}
/** Animated GIF sources display as images, so their corrections keep the rendered preview. */
export const realtimeGradeFor = (asset: MediaAsset) =>
  asset.kind === 'video' && !/\.gif$/i.test(asset.name) && supportsRealtimeGrade();
