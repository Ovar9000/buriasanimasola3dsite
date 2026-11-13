/**
 * Fragment shader for the ocean. It replaces the stock three.js `Water`
 * shader but keeps that class's planar-reflection machinery (mirrorSampler,
 * textureMatrix, eye) and its vertex shader.
 *
 *  - Normals come from a sum of directional swells computed in the shader plus
 *    two rotated ripple-texture layers, and each band fades out once it gets
 *    smaller than a pixel. That removes the tiling and shimmer and leaves a
 *    smooth, glossy sea toward the horizon.
 *  - The water body is lit from a baked seabed map (depth, coral / weed, sand)
 *    using Beer–Lambert absorption, so shallow water over sand turns turquoise
 *    and darkens to sapphire over the drop-off. The seabed is sampled with
 *    refraction parallax and has animated caustics.
 *  - Shore foam forms where the water gets shallow, with surf bands rolling in.
 *  - The surface uses Schlick Fresnel against the planar reflection, plus an
 *    HDR sun glint that feeds the bloom pass.
 */
export const OCEAN_VERTEX = /* glsl */ `
uniform mat4 textureMatrix;
uniform float time;
uniform sampler2D seabed;
uniform vec4 seabedRect;

varying vec4 mirrorCoord;
varying vec4 worldPosition;

#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>

float swellHeight(vec2 p) {
  float h = 0.0;
  float wl = 46.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float angle = 2.75 + fi * 2.39996;
    vec2 dir = vec2(cos(angle), sin(angle));
    float k = 6.28318 / wl;
    float omega = sqrt(9.81 * k);
    float amp = 0.16 / (1.0 + fi * 0.45);
    h += sin(k * dot(dir, p) - omega * time + fi * 1.7) * amp;
    wl *= 0.64;
  }
  return h;
}

void main() {
  vec4 baseWorld = modelMatrix * vec4(position, 1.0);
  vec2 suv = (baseWorld.xz - seabedRect.xy) / seabedRect.zw;
  float bedR = texture2D(seabed, suv).r;
  float bedDepth = (any(lessThan(suv, vec2(0.0))) || any(greaterThan(suv, vec2(1.0))))
    ? 40.0
    : bedR * bedR * 40.0;
  float dist = length(baseWorld.xz);
  // Keep water calm right against shallow sand/rocks and fade beyond mid-range so horizon stays crisp
  float waveMask = smoothstep(0.55, 3.6, bedDepth) * (1.0 - smoothstep(140.0, 440.0, dist));

  vec3 pos = position;
  pos.z += swellHeight(baseWorld.xz) * waveMask;

  worldPosition = modelMatrix * vec4(pos, 1.0);
  mirrorCoord = textureMatrix * worldPosition;
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
  #include <shadowmap_vertex>
}
`

export const OCEAN_FRAGMENT = /* glsl */ `
uniform sampler2D mirrorSampler;
uniform sampler2D normalSampler;
uniform sampler2D seabed;
uniform vec4 seabedRect;
uniform float time;
uniform float distortionScale;
uniform vec3 sunColor;
uniform float sunIntensity;
uniform vec3 sunDirection;
uniform vec3 ambient;
uniform vec3 eye;
uniform vec3 waterColor;
uniform vec3 scatterColor;
uniform vec3 shallowTint;
uniform float lagoonGlow;

varying vec4 mirrorCoord;
varying vec4 worldPosition;

#include <common>
#include <packing>
#include <bsdfs>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>

#ifndef OCEAN_WAVES
#define OCEAN_WAVES 10
#endif

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

/** Surface slope (dh/dx, dh/dz) of the swell field, band-limited by pixel footprint. */
vec2 swellSlope(vec2 p, float footprint) {
  vec2 slope = vec2(0.0);
  float wavelength = 46.0;
  for (int i = 0; i < OCEAN_WAVES; i++) {
    float fi = float(i);
    // Golden-angle spread prevents periodic horizontal scanline banding across the sea
    float angle = 2.75 + fi * 2.39996;
    vec2 dir = vec2(cos(angle), sin(angle));
    float k = 6.28318 / wavelength;
    float omega = sqrt(9.81 * k);
    float steep = 0.072 * mix(0.45, 1.0, smoothstep(0.0, 3.0, fi)) / (1.0 + fi * 0.14);
    float phase = k * dot(dir, p) - omega * time + fi * 1.7;
    // fade bands smaller than a few pixels so the sea never shimmers
    float fade = smoothstep(1.0, 3.0, wavelength / footprint);
    slope += dir * cos(phase) * steep * fade;
    wavelength *= 0.64;
  }
  return slope;
}

vec2 rippleSlope(vec2 p, float footprint) {
  const mat2 R1 = mat2(0.8, -0.6, 0.6, 0.8);
  const mat2 R2 = mat2(-0.28, -0.96, 0.96, -0.28);
  vec2 uv1 = R1 * p / 3.1 + vec2(time * 0.031, time * 0.017);
  vec2 uv2 = R2 * p / 1.3 - vec2(time * 0.021, -time * 0.043);
  vec2 n1 = texture2D(normalSampler, uv1).xy * 2.0 - 1.0;
  vec2 n2 = texture2D(normalSampler, uv2).xy * 2.0 - 1.0;
  float f1 = smoothstep(0.5, 2.5, 3.1 / footprint / 8.0);
  float f2 = smoothstep(0.5, 2.5, 1.3 / footprint / 8.0);
  return (transpose(R1) * n1) * 0.22 * f1 + (transpose(R2) * n2) * 0.16 * f2;
}

/** Animated caustic web (after Dave Hoskins' tileable water caustic). */
float caustics(vec2 p) {
  p = mod(p, 6.28318) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  float t = time * 0.5 + 23.0;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / max(length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten))), 1e-3);
  }
  c = min(c / 4.0, 4.0);
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 3.0);
}

/** (depth in metres, coral amount, weed vs coral, sand brightness) at a world position. */
vec4 sampleSeabed(vec2 xz) {
  vec2 uv = (xz - seabedRect.xy) / seabedRect.zw;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(40.0, 0.0, 0.0, 0.5);
  vec4 s = texture2D(seabed, uv);
  return vec4(s.r * s.r * 40.0, s.gba);
}

void main() {
  #include <logdepthbuf_fragment>

  vec3 toEye = eye - worldPosition.xyz;
  float dist = length(toEye);
  vec3 V = toEye / dist;
  vec2 p = worldPosition.xz;

  // world-space size of one pixel here (approx.), grows at grazing angles
  float footprint = max(length(fwidth(p)), 1e-4);

  vec4 bed = sampleSeabed(p);
  // Sheltered reef shallows damp out open-ocean swells toward the beach
  float calm = smoothstep(0.0, 2.6, bed.x);
  vec2 slope = swellSlope(p, footprint) * mix(0.22, 1.0, calm) + rippleSlope(p, footprint) * mix(0.42, 1.0, calm);
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));

  vec3 L = normalize(sunDirection);
  float shadow = getShadowMask();
  float NdV = max(dot(N, V), 0.0);

  // ---- water body: look through the surface at the seabed
  // refraction parallax: the bottom we see is offset along the view ray
  vec2 refr = (-V.xz / max(V.y, 0.25)) * min(bed.x, 8.0) * 0.48 + N.xz * min(bed.x, 6.0) * 0.32;
  vec4 bedSeen = sampleSeabed(p + refr);
  float depth = mix(bed.x, bedSeen.x, 0.7);

  // ---- reflection (physically proportioned UV perturbation so close-up cliff reflections don't shred)
  vec2 projUv = mirrorCoord.xy / mirrorCoord.w;
  vec2 distortion = N.xz * (0.0025 + 0.14 / (dist + 22.0)) * distortionScale * mix(0.25, 1.0, calm);
  vec3 reflection = texture2D(mirrorSampler, clamp(projUv + distortion, 0.002, 0.998)).rgb;
  float fresnel = (0.02 + 0.98 * pow(1.0 - NdV, 5.0)) * smoothstep(0.02, 0.28, depth);

  vec3 sand = vec3(0.78, 0.73, 0.61);
  vec3 coral = vec3(0.28, 0.27, 0.22);
  vec3 weed = vec3(0.21, 0.28, 0.17);
  vec3 albedo = mix(sand, mix(coral, weed, bedSeen.b), bedSeen.g * 0.78) * (0.84 + 0.34 * bedSeen.a);

  float sunUp = max(L.y, 0.0);
  float caust = 0.0;
  #ifdef OCEAN_CAUSTICS
    if (depth < 7.0) {
      vec2 cp = (p + refr) * 0.42 + N.xz * 0.6;
      caust = caustics(cp) * (1.0 - smoothstep(0.3, 7.0, depth)) * smoothstep(0.02, 0.25, sunUp);
    }
  #endif
  vec3 sunLight = sunColor * sunIntensity * sunUp * shadow;
  vec3 bottomLight = (sunLight * (0.82 + caust * 1.55) + ambient) * RECIPROCAL_PI;
  vec3 bottom = albedo * bottomLight * shallowTint;

  // light travels down to the bed and back up to the eye
  float path = depth * (1.0 + 1.0 / max(V.y, 0.22));
  vec3 absorption = vec3(0.44, 0.082, 0.048);
  vec3 transmit = exp(-absorption * path);

  // deep-water colour, with sunlit subsurface scattering through wave flanks
  float sss = pow(max(dot(V, -vec3(L.x, 0.0, L.z)), 1e-4), 3.0) * max(slope.x * L.x + slope.y * L.z, 0.0) * 3.0;
  vec3 deep = waterColor * (0.85 + 0.15 * shadow) + scatterColor * sss * sunUp * mix(0.4, 1.0, shadow);
  vec3 body = mix(deep, bottom, transmit);
  // turquoise / emerald light scattered back up out of the shallows
  float shallow = smoothstep(0.05, 0.35, depth) * (1.0 - smoothstep(1.8, 12.5, depth));
  vec3 lagoon = mix(vec3(0.03, 0.54, 0.44), vec3(0.04, 0.72, 0.66), smoothstep(0.0, 2.8, depth));
  body += lagoon * shallow * lagoonGlow * (0.55 + 0.45 * bedSeen.a) * (0.45 + 0.55 * shadow);

  vec3 color = mix(body, reflection, fresnel);

  // ---- sun glint (HDR, feeds bloom)
  vec3 H = normalize(L + V);
  float NdH = max(dot(N, H), 1e-4);
  float glint = pow(NdH, 1200.0) * 75.0 + pow(NdH, 160.0) * 0.95 + pow(NdH, 28.0) * 0.045;
  color += sunColor * sunIntensity * glint * fresnel * shadow * smoothstep(-0.02, 0.08, L.y);

  // ---- shore foam & gentle surf wash
  float n = vnoise(p * 1.6 + vec2(time * 0.35, -time * 0.21)) * 0.6 + vnoise(p * 4.3 - time * 0.4) * 0.4;
  float edge = 1.0 - smoothstep(0.0, 0.11 + n * 0.18, depth);
  float bands = smoothstep(0.68, 0.97, sin(depth * 14.0 + time * 1.35 + n * 4.2)) * (1.0 - smoothstep(0.04, 0.52, depth));
  float foam = clamp(edge * (0.48 + 0.55 * n) + bands * smoothstep(0.38, 0.80, n) * 0.72, 0.0, 1.0);
  vec3 foamColor = vec3(0.95) * (sunLight + ambient) * RECIPROCAL_PI * 1.15;
  color = mix(color, foamColor, foam);

  gl_FragColor = vec4(color, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`
