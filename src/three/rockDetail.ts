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
uniform vec3 rdShrub;
uniform vec3 rdSand;
uniform vec3 rdRockA;
uniform vec3 rdRockB;
uniform vec3 rdRockC;
uniform vec3 rdRockD;
float rdH;

// sandstone package colour: mostly honey / ochre, with buff and dark bands
vec3 rdPalette(float h) {
  return h < 0.38 ? rdRockA : h < 0.68 ? rdRockB : h < 0.84 ? rdRockD : rdRockC;
}

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
  float near = 1.0 - smoothstep(rdLayer * 0.35, rdLayer * 1.2, footprint);
  float nearFine = 1.0 - smoothstep(0.03, 0.12, footprint);

  float level = smoothstep(0.62, 0.86, n.y);
  float above = smoothstep(rdGrassLine - 0.35, rdGrassLine + 0.35, p.y);

  vec3 base = diffuseColor.rgb;
  // The scan texture is a dark grey-green patchwork. Keep only its relative
  // brightness (as surface detail) and its green patches (as shrubs).
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  float texMod = mix(1.0, clamp(lum / 0.075, 0.5, 1.6), 0.55);
  float veg = smoothstep(0.003, 0.018, base.g - (base.r + base.b) * 0.5);

  float groove = 0.0;
  float cracks = 0.0;
  float laminae = 0.5;

  // ---- sandstone cliff (steep faces)
  vec3 cliff;
  {
    float warp = (rdFbm(p.xz * 0.09) - 0.5) * 1.4 + (rdNoise(p.xz * 0.7) - 0.5) * 0.12;
    float y = p.y + warp;
    float sy = y / rdLayer;
    float id = floor(sy);
    float f = fract(sy);
    // beds come in packages of similar colour, a metre or so thick
    float pkgY = y / 0.95;
    float pkg = floor(pkgY);
    vec3 rock = mix(rdPalette(rdHash(vec2(pkg, 7.3))), rdPalette(rdHash(vec2(pkg + 1.0, 7.3))), smoothstep(0.85, 1.0, fract(pkgY)));
    rock *= mix(0.84, 1.12, rdHash(vec2(id, 3.7)));
    // horizontal coordinate running along the face
    vec2 t = normalize(vec2(-n.z, n.x) + 1e-4);
    float u = dot(p.xz, t);
    rock *= 0.9 + 0.2 * rdNoise(vec2(u * 0.35, sy * 0.5));
    // dark rain-wash streaks running down the face
    float streak = smoothstep(0.58, 0.9, rdNoise(vec2(u * 1.6, p.y * 0.1))) * smoothstep(0.4, 2.5, p.y);
    rock *= 1.0 - streak * 0.38;
    // recessed bedding plane at the bottom of each bed, rounded ledge above it
    groove = 1.0 - smoothstep(0.0, 0.2, f) * smoothstep(1.0, 0.8, f);
    laminae = rdNoise(vec2(sy * 5.0, u * 0.9));
    float fine = 1.0;
    if (nearFine > 0.0) {
      cracks = rdTriRidge(p * 1.7, w) * nearFine;
      fine = mix(1.0, 0.9 + 0.2 * rdTri(p, w, 9.0), nearFine);
    }
    vec3 detail = rock * (1.0 - groove * 0.34) * (0.9 + 0.2 * laminae) * (1.0 - cracks * 0.4) * fine;
    cliff = mix(rock, detail, near) * texMod;
    // wet, darker wave-cut notch at the base, with a hint of algae
    float wet = 1.0 - smoothstep(0.15, 1.3, p.y);
    cliff = mix(cliff, cliff * vec3(0.42, 0.44, 0.40), wet);
    // shrubs clinging to the face, where the scan texture was green
    float clump = smoothstep(0.35, 0.65, rdNoise(p.xz * 1.3 + p.y * 0.8));
    cliff = mix(cliff, rdShrub * (0.7 + 0.6 * texMod), veg * clump * 0.85 * smoothstep(1.2, 2.5, p.y));
  }

  // ---- level ground: dry coastal grass above the grass line, pale beach below
  vec3 ground = cliff;
  if (level > 0.001) {
    float g1 = rdTri(p, w, 0.22);
    float g2 = rdTri(p, w, 3.2);
    float g3 = rdTri(p, w, 1.1);
    vec3 grass = mix(rdGrassGold, rdGrassGreen, smoothstep(0.42, 0.78, g1 * 0.7 + g3 * 0.3));
    grass *= 0.78 + 0.44 * mix(0.5, g2, nearFine);
    // darker shrub clumps, denser toward the cliff edge and where the scan was green
    float edge = 1.0 - smoothstep(0.8, 0.95, n.y);
    float shrubs = smoothstep(0.55, 0.75, g3 + edge * 0.35 + veg * 0.3);
    grass = mix(grass, rdShrub * (0.75 + 0.5 * g2), shrubs);
    grass *= mix(1.0, texMod, 0.35);

    float s1 = rdTri(p, w, 1.3);
    float s2 = rdTri(p, w, 14.0);
    vec3 sand = rdSand * (0.86 + 0.18 * s1) * (0.9 + 0.2 * mix(0.5, s2, nearFine));
    // sand only right at the waterline; ledges between it and the grass line stay rock
    float beach = 1.0 - smoothstep(0.35, 1.0, p.y);
    vec3 low = mix(cliff, sand, beach * 0.75);
    ground = mix(low, grass, above);
  }
  vec3 col = mix(cliff, ground, level);
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
    rdLayer: { value: opts.layer ?? 0.16 },
    rdStrength: { value: opts.strength ?? 1 },
    rdGrassGreen: { value: new Color('#528f32') },
    rdGrassGold: { value: new Color('#c2ad59') },
    rdShrub: { value: new Color('#386d22') },
    rdSand: { value: new Color('#dfd4be') },
    rdRockA: { value: new Color('#c29f74') },
    rdRockB: { value: new Color('#d6ba90') },
    rdRockC: { value: new Color('#a3835e') },
    rdRockD: { value: new Color('#b4956f') },
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
