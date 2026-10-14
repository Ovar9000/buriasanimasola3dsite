import { Color, type MeshStandardMaterial } from 'three'

/**
 * World-space surface detail for the island, injected into its existing PBR
 * material with `onBeforeCompile`. Everything is procedural and projected
 * triplanarly (X, Y and Z planes blended by the surface normal), so there is
 * no UV stretching and the detail stays sharp however close the camera gets:
 *
 *  - steep faces: horizontal sedimentary strata (warped, per-layer tint,
 *    grooves at the bedding planes, fine laminae) plus ridged micro-cracks;
 *  - upward faces above `grassLine`: green / golden coastal grass;
 *  - upward faces right at the waterline: fine pale coral sand.
 *
 * The model's own texture is kept underneath (modulated, not replaced), and
 * the bedding planes and cracks also bend the shading normal. Detail fades
 * out once it gets smaller than a pixel to avoid shimmer.
 */
export interface RockDetailOptions {
  /** World height splitting grass (above) from sand (below). */
  grassLine?: number
  /** Thickness of one sedimentary layer, world units. */
  layer?: number
  /** 0 = off, 1 = full strength. */
  strength?: number
}

const DETAIL_PARS = /* glsl */ `
varying vec3 vRdPos;
varying vec3 vRdNormal;
uniform float rdGrassLine;
uniform float rdLayer;
uniform float rdStrength;
uniform vec3 rdGrassGreen;
uniform vec3 rdGrassGold;
uniform vec3 rdSand;
float rdH;

float rdHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float rdNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rdHash(i), rdHash(i + vec2(1.0, 0.0)), u.x), mix(rdHash(i + vec2(0.0, 1.0)), rdHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float rdNoise2(vec2 p) {
  return rdNoise(p) * 0.65 + rdNoise(p * 2.3 + 5.0) * 0.35;
}
float rdFbm(vec2 p) {
  return rdNoise(p) * 0.55 + rdNoise(p * 2.03 + 17.1) * 0.3 + rdNoise(p * 4.1 - 9.3) * 0.15;
}
// ridged noise: 1 along thin crack lines, 0 elsewhere
float rdRidge(vec2 p) {
  return 1.0 - smoothstep(0.0, 0.06, abs(rdNoise2(p) - 0.5));
}
float rdTri(vec3 p, vec3 w, float scale) {
  return rdNoise2(p.zy * scale) * w.x + rdNoise2(p.xz * scale) * w.y + rdNoise2(p.xy * scale) * w.z;
}
float rdTriRidge(vec3 p, vec3 w) {
  return rdRidge(p.zy) * w.x + rdRidge(p.xz) * w.y + rdRidge(p.xy) * w.z;
}
// bump-map style normal perturbation from a screen-space height derivative
vec3 rdPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`

const DETAIL_ALBEDO = /* glsl */ `
{
  vec3 n = normalize(vRdNormal);
  vec3 p = vRdPos;
  vec3 w = pow(abs(n), vec3(4.0));
  w /= dot(w, vec3(1.0));
  // fade detail that would be smaller than a few pixels
  float footprint = length(fwidth(p));
  float near = 1.0 - smoothstep(rdLayer * 0.25, rdLayer * 0.9, footprint);
  float nearFine = 1.0 - smoothstep(0.03, 0.12, footprint);

  float upness = n.y;
  float level = smoothstep(0.62, 0.86, upness);
  float above = step(rdGrassLine, p.y);

  vec3 base = diffuseColor.rgb;
  vec3 col = base;
  float groove = 0.0;
  float cracks = 0.0;
  float laminae = 0.5;

  // ---- sedimentary strata (steep faces)
  if (level < 0.999) {
    float warp = (rdFbm(p.xz * 0.11) - 0.5) * 1.6;
    float sy = (p.y + warp) / rdLayer;
    float id = floor(sy);
    float f = fract(sy);
    float tint = mix(0.78, 1.18, rdHash(vec2(id, 3.7)));
    // recessed bedding plane at the bottom of each layer, rounded ledge above it
    groove = 1.0 - smoothstep(0.0, 0.16, f) * smoothstep(1.0, 0.86, f);
    laminae = rdNoise(vec2(sy * 6.0, (p.x + p.z) * 0.7));
    float fine = 1.0;
    if (nearFine > 0.0) {
      cracks = rdTriRidge(p * 1.7, w) * nearFine;
      fine = mix(1.0, 0.92 + 0.16 * rdTri(p, w, 9.0), nearFine);
    }
    float strata = tint * (1.0 - groove * 0.38) * (0.9 + 0.2 * laminae) * (1.0 - cracks * 0.45) * fine;
    col = base * mix(1.0, strata, near);
  }

  // ---- level ground: coastal grass above the grass line, coral sand below
  if (level > 0.001) {
    vec3 ground;
    if (above > 0.5) {
      float g1 = rdTri(p, w, 0.35);
      float g2 = rdTri(p, w, 3.2);
      vec3 grass = mix(rdGrassGreen, rdGrassGold, smoothstep(0.38, 0.68, g1));
      grass *= 0.75 + 0.5 * mix(0.5, g2, nearFine);
      ground = mix(base, grass, 0.62);
    } else {
      float s1 = rdTri(p, w, 1.3);
      float s2 = rdTri(p, w, 14.0);
      vec3 sand = rdSand * (0.86 + 0.18 * s1) * (0.93 + 0.14 * mix(0.5, s2, nearFine));
      ground = mix(base, sand, 0.7);
    }
    // sand only right at the waterline; rock ledges between it and the grass line stay rock
    float w2 = above > 0.5 ? level : level * (1.0 - smoothstep(0.5, 1.3, p.y));
    col = mix(col, ground, w2);
  }
  diffuseColor.rgb = mix(base, col, rdStrength);

  // height for the normal perturbation (cliffs only)
  rdH = (-groove * 0.6 - cracks * 0.35 + laminae * 0.12) * near * (1.0 - level) * rdStrength;
}
`

const DETAIL_NORMAL = /* glsl */ `
{
  float k = rdLayer * 0.35;
  normal = rdPerturb(-vViewPosition, normal, vec2(dFdx(rdH), dFdy(rdH)) * k, faceDirection);
}
`

const patched = new WeakSet<MeshStandardMaterial>()

export function applyRockDetail(material: MeshStandardMaterial, opts: RockDetailOptions = {}) {
  if (patched.has(material)) return
  patched.add(material)
  const uniforms = {
    rdGrassLine: { value: opts.grassLine ?? 2.5 },
    rdLayer: { value: opts.layer ?? 0.42 },
    rdStrength: { value: opts.strength ?? 1 },
    rdGrassGreen: { value: new Color('#5d8a2c') },
    rdGrassGold: { value: new Color('#c4ab52') },
    rdSand: { value: new Color('#efe6d2') },
  }
  const previous = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer)
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRdPos;\nvarying vec3 vRdNormal;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vRdPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vRdNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DETAIL_PARS}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${DETAIL_ALBEDO}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${DETAIL_NORMAL}`)
  }
  material.customProgramCacheKey = () => 'rock-detail'
  material.needsUpdate = true
  return uniforms
}
