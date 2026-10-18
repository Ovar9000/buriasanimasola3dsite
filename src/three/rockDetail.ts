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
float rdGrassH;
float rdLevel;
float rdNear;
float rdRough;

// sandstone package colour: warm honey / ochre, buff limestone and dark ferruginous bands
vec3 rdPalette(float h) {
  return h < 0.36 ? rdRockA : h < 0.66 ? rdRockB : h < 0.84 ? rdRockD : rdRockC;
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
  return 1.0 - smoothstep(0.0, 0.055, abs(rdNoise2(p) - 0.5));
}
float rdTri(vec3 p, vec3 w, float scale) {
  return rdNoise2(p.zy * scale) * w.x + rdNoise2(p.xz * scale) * w.y + rdNoise2(p.xy * scale) * w.z;
}
// Pure position-based lateral coordinate so screen derivatives never differentiate vertex normals
float rdPosNoise(vec3 p, float scale) {
  return (rdNoise2(p.zy * scale) + rdNoise2(p.xy * scale)) * 0.5;
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
  w /= max(dot(w, vec3(1.0)), 1e-4);
  // fade detail that would be smaller than a few pixels
  float footprint = length(fwidth(p));
  float near = 1.0 - smoothstep(rdLayer * 0.4, rdLayer * 1.5, footprint);
  float nearFine = 1.0 - smoothstep(0.025, 0.11, footprint);

  // Perturb slope and height thresholds by noise so terraced steps don't form artificial contour rings
  float edgeBreak = (rdFbm(p.xz * 0.42) - 0.5) * 0.22 + (rdNoise(p.xz * 1.7) - 0.5) * 0.10;
  float southTerrace = smoothstep(5.5, 13.5, p.z) * 1.4;
  float above = smoothstep(rdGrassLine + southTerrace - 0.35, rdGrassLine + southTerrace + 1.0, p.y + edgeBreak * 2.2);
  // Only allow grass on high flat plateau or broad upper ledges, not steep stepped cliff faces
  float slopeGate = mix(0.92, 0.70, above);
  float level = smoothstep(slopeGate, slopeGate + 0.14, n.y + edgeBreak * 0.55);

  vec3 base = diffuseColor.rgb;
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  // Adapt reference luminance so dark scan textures (lum ~ 0.07) are lifted while bright vertex colors keep their shading
  float refLum = mix(0.072, 0.36, smoothstep(0.14, 0.26, lum));
  float texMod = mix(1.0, clamp(lum / refLum, 0.52, 1.50), 0.62);
  float veg = smoothstep(0.003, 0.018, base.g - (base.r + base.b) * 0.5);

  float groove = 0.0;
  float cracks = 0.0;
  float laminae = 0.5;
  float cliffRough = 0.84;

  // ---- volcano-sedimentary cliff (steep faces & rock slabs)
  vec3 cliff;
  {
    float warp = (rdFbm(p.xz * 0.085) - 0.5) * 1.25 + (rdNoise(p.xz * 0.65) - 0.5) * 0.14;
    float y = p.y + warp;
    float sy = y / rdLayer;
    float id = floor(sy);
    float f = fract(sy);

    // Master beds (~0.65m packages) + medium strata (rdLayer) + lateral pinch-out
    float pkgY = y / 0.68;
    float pkg = floor(pkgY);
    float pkgFract = fract(pkgY);
    vec3 rock = mix(rdPalette(rdHash(vec2(pkg, 7.3))), rdPalette(rdHash(vec2(pkg + 1.0, 7.3))), smoothstep(0.82, 1.0, pkgFract));
    rock *= mix(0.85, 1.13, rdHash(vec2(id, 3.7)));

    // Lateral coordinate purely from world position so derivatives stay smooth across triangle edges
    float u = (p.x - p.z) * 0.7071;
    float v = (p.x + p.z) * 0.7071;
    float lateralVar = rdNoise(vec2(u * 0.32, sy * 0.35)) * 0.6 + rdNoise(vec2(v * 0.32, sy * 0.35)) * 0.4;
    rock *= 0.88 + 0.24 * lateralVar;

    // Dark vertical weathering & rain-wash mineral streaks on tall cliff faces
    float streak = smoothstep(0.54, 0.88, rdFbm(vec2(u * 1.1 + v * 0.8, p.y * 0.08))) * smoothstep(1.2, 4.0, p.y);
    rock *= mix(vec3(1.0), vec3(0.58, 0.53, 0.48), streak * 0.48);

    // Multi-scale bedding grooves: deep master notches + laterally varying minor grooves
    float majorGroove = 1.0 - smoothstep(0.0, 0.12, pkgFract) * smoothstep(1.0, 0.88, pkgFract);
    float minorPresence = smoothstep(0.22, 0.78, lateralVar);
    float minorGroove = (1.0 - smoothstep(0.0, 0.18, f) * smoothstep(1.0, 0.82, f)) * minorPresence;
    groove = clamp(majorGroove * 0.75 + minorGroove * 0.65, 0.0, 1.0);

    // Fine sedimentary laminae + horizontal solution pitting on flat slab tops + vertical block joints
    float topPit = rdFbm(p.xz * 1.8) * 0.6 + rdNoise2(p.xz * 5.2) * 0.4;
    laminae = mix(rdNoise(vec2(sy * 4.2, (u + v) * 0.65)), topPit, w.y * 0.75);
    float vertJoint = rdRidge(vec2((u - v) * 0.85 + pkg * 0.37, y * 0.55)) * (1.0 - majorGroove * 0.5);
    float topCrack = rdRidge(p.xz * 0.95) * 0.65 + rdRidge(p.xz * 2.1 + 3.7) * 0.35;

    float fine = 1.0;
    if (nearFine > 0.0) {
      float sideCrack = rdRidge(p.zy * 1.55) * 0.45 + rdRidge(p.xy * 1.55) * 0.45 + vertJoint * 0.55;
      cracks = clamp(mix(sideCrack, topCrack, w.y * 0.7), 0.0, 1.0) * nearFine;
      fine = mix(1.0, 0.84 + 0.32 * (rdPosNoise(p, 8.5) * (1.0 - w.y * 0.5) + rdNoise2(p.xz * 9.5) * w.y * 0.5), nearFine);
    } else {
      cracks = mix(vertJoint * 0.4, topCrack * 0.45, w.y * 0.7) * near;
    }

    // Sun-bleached upper ledges / slab tops vs darker recessed crevices
    float sunBleach = smoothstep(0.35, 0.75, n.y) * (1.0 - groove * 0.6) * (0.7 + 0.6 * topPit);
    rock = mix(rock, rdRockB * 1.05, sunBleach * 0.32);

    vec3 detail = rock * (1.0 - groove * 0.38) * (0.88 + 0.24 * laminae) * (1.0 - cracks * 0.45) * fine;
    cliff = mix(rock, detail, near) * texMod;
    cliffRough = clamp(0.80 + groove * 0.14 + cracks * 0.10 - sunBleach * 0.06, 0.65, 0.96);

    // Wave-splash darkening & intertidal algae near sea level (y < 0.48)
    float splash = 1.0 - smoothstep(-0.05, 0.48, p.y);
    cliff = mix(cliff, cliff * vec3(0.42, 0.44, 0.38), splash * 0.80);
    cliffRough = mix(cliffRough, 0.22, splash * 0.88);

    // Hanging coastal scrub / dwarf shrubs clinging to fractured ledges (main island only)
    if (rdGrassLine < 50.0) {
      float clump = smoothstep(0.38, 0.68, rdFbm(p.xz * 1.25 + p.y * 0.65));
      float cliffVeg = veg * clump * 0.88 * smoothstep(1.8, 3.4, p.y);
      cliff = mix(cliff, rdShrub * (0.68 + 0.55 * texMod), cliffVeg);
      cliffRough = mix(cliffRough, 0.92, cliffVeg);
    }
  }

  // ---- level ground: wind-swept coastal turf & scrub on the plateau, coral sand at the shore
  vec3 ground = cliff;
  float groundRough = cliffRough;
  float turfBump = 0.0;
  if (level > 0.001 && rdGrassLine < 50.0) {
    float gBroad = rdFbm(p.xz * 0.16);
    float gMed = rdFbm(p.xz * 0.85 + 4.3);
    float gFine = rdNoise2(p.xz * 4.2);
    // Natural wind-swept meadow: olive-green turf transitioning to sun-bleached golden thatch
    vec3 grass = mix(rdGrassGold, rdGrassGreen, smoothstep(0.36, 0.72, gBroad * 0.65 + gMed * 0.35));
    grass *= 0.80 + 0.38 * mix(0.5, gFine, nearFine);

    // Exposed weathered limestone/soil patches near windward rim and dry spots
    float rim = 1.0 - smoothstep(0.76, 0.94, n.y);
    float barePatch = smoothstep(0.62, 0.82, (1.0 - gBroad) * 0.7 + rim * 0.45);
    grass = mix(grass, rdRockB * (0.78 + 0.28 * gFine), barePatch * 0.65);

    // Dwarf coastal shrubs (Pemphis / Scaevola clumps) with 3D micro-relief
    float shrubs = smoothstep(0.54, 0.74, gMed + rim * 0.28 + veg * 0.28) * (1.0 - barePatch * 0.7);
    grass = mix(grass, rdShrub * (0.70 + 0.52 * gFine), shrubs);
    grass *= mix(1.0, texMod, 0.32);
    turfBump = (shrubs * 0.45 + gFine * 0.15 - barePatch * 0.2) * near;

    float s1 = rdNoise2(p.xz * 1.2);
    float s2 = rdNoise2(p.xz * 14.0);
    vec3 sand = rdSand * (0.88 + 0.16 * s1) * (0.92 + 0.16 * mix(0.5, s2, nearFine));
    float beach = 1.0 - smoothstep(0.28, 0.95, p.y);
    vec3 low = mix(cliff, sand, beach * 0.78);
    ground = mix(low, grass, above);
    groundRough = mix(mix(cliffRough, 0.88, beach), 0.92, above);
  }
  vec3 col = mix(cliff, ground, level);
  diffuseColor.rgb = mix(base, col, rdStrength);

  // Pure position-dependent heights so dFdx/dFdy never differentiate vertex normals
  rdH = (-groove * 0.52 - cracks * 0.32 + laminae * 0.11);
  rdGrassH = turfBump;
  rdLevel = level * above;
  rdNear = near * rdStrength;
  rdRough = mix(cliffRough, groundRough, level);
}
`

const DETAIL_ROUGHNESS = /* glsl */ `
roughnessFactor = mix(roughnessFactor, rdRough, rdStrength);
`

const DETAIL_NORMAL = /* glsl */ `
{
  vec2 dRock = vec2(dFdx(rdH), dFdy(rdH)) * (rdLayer * 0.28);
  vec2 dGrass = vec2(dFdx(rdGrassH), dFdy(rdGrassH)) * 0.045;
  vec2 dH = mix(dRock, dGrass, rdLevel) * rdNear;
  normal = rdPerturb(-vViewPosition, normal, dH, faceDirection);
}
`

const patched = new WeakSet<MeshStandardMaterial>()

export function applyRockDetail(material: MeshStandardMaterial, opts: RockDetailOptions = {}) {
  if (patched.has(material)) return
  patched.add(material)
  const uniforms = {
    rdGrassLine: { value: opts.grassLine ?? 3.6 },
    rdLayer: { value: opts.layer ?? 0.18 },
    rdStrength: { value: opts.strength ?? 0.94 },
    rdGrassGreen: { value: new Color('#4d7d2b') },
    rdGrassGold: { value: new Color('#a89d52') },
    rdShrub: { value: new Color('#2d541c') },
    rdSand: { value: new Color('#e6dac4') },
    rdRockA: { value: new Color('#c49e72') },
    rdRockB: { value: new Color('#d8bc92') },
    rdRockC: { value: new Color('#9c7b56') },
    rdRockD: { value: new Color('#b5936b') },
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
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${DETAIL_ROUGHNESS}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${DETAIL_NORMAL}`)
  }
  material.customProgramCacheKey = () => `rock-detail-${opts.grassLine ?? 3.6}-${opts.strength ?? 0.94}`
  material.needsUpdate = true
  return uniforms
}

/**
 * World-space coral sand & wet shoreline micro-detail for the beach terrain:
 * adds fine coral sand sparkle/grain, wave-wash ripple normals, pebble scatter,
 * and a dark, glossy wet-sand swash zone right at the waterline (y ≈ 0).
 */
export function applyBeachDetail(material: MeshStandardMaterial) {
  if (patched.has(material)) return
  patched.add(material)
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBdPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBdPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vBdPos;
        float bdBump;
        float bdRough;
        float bdHash(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        float bdNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(bdHash(i), bdHash(i + vec2(1.0, 0.0)), u.x), mix(bdHash(i + vec2(0.0, 1.0)), bdHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec2 xz = vBdPos.xz;
          float fp = length(fwidth(xz));
          float near = 1.0 - smoothstep(0.03, 0.18, fp);
          float nMacro = bdNoise(xz * 0.45) * 0.6 + bdNoise(xz * 1.3 + 7.1) * 0.4;
          float nPebble = bdNoise(xz * 6.5) * 0.6 + bdNoise(xz * 18.0) * 0.4;
          float ripples = sin(length(xz) * 7.5 + bdNoise(xz * 0.8) * 4.5) * 0.5 + 0.5;
          float wet = 1.0 - smoothstep(-0.04, 0.22, vBdPos.y);
          // Warm coral-sand tint and fine shell/pebble modulation
          diffuseColor.rgb *= (0.92 + 0.16 * nMacro) * mix(1.0, 0.90 + 0.20 * nPebble, near);
          // Darken wet swash zone where waves lap the beach
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.66, 0.62, 0.56), wet * 0.78);
          bdBump = (nPebble * 0.012 + ripples * 0.008 * (1.0 - wet * 0.5)) * near;
          bdRough = mix(0.90, 0.20, wet * 0.88);
        }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = bdRough;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 sx = dFdx(-vViewPosition);
          vec3 sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal);
          vec3 r2 = cross(normal, sx);
          float det = dot(sx, r1) * faceDirection;
          vec2 dB = vec2(dFdx(bdBump), dFdy(bdBump));
          normal = normalize(abs(det) * normal - sign(det) * (dB.x * r1 + dB.y * r2));
        }`,
      )
  }
  material.customProgramCacheKey = () => 'beach-detail'
  material.needsUpdate = true
}
