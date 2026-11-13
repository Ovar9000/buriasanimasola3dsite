import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three'
import { mulberry32 } from '../lib/math'
import { useExplorerStore } from '../store/useExplorerStore'
import { sampleAtmosphere } from './atmosphere'

interface Puff {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  seed: number
  opacity: number
}

/** Generate layered cumulus cloud banks ringing the mid-far ocean horizon. */
function buildPuffs(bankCount: number): Puff[] {
  const rand = mulberry32(2026)
  const puffs: Puff[] = []
  for (let b = 0; b < bankCount; b++) {
    const angle = (b / bankCount) * Math.PI * 2 + (rand() - 0.5) * 0.25
    const dist = 220 + rand() * 300
    const cx = Math.cos(angle) * dist
    const cz = Math.sin(angle) * dist
    const cy = 18 + (dist - 220) * 0.035 + rand() * 14
    const cluster = 5 + Math.floor(rand() * 5)
    const bankScale = 0.95 + (dist / 450) * 0.85
    for (let k = 0; k < cluster; k++) {
      const spread = (k === 0 ? 0.2 : 1) * (11 + rand() * 18) * bankScale
      const theta = rand() * Math.PI * 2
      puffs.push({
        x: cx + Math.cos(theta) * spread,
        y: cy + (k === 0 ? 3.5 : (rand() - 0.35) * 6.0) * bankScale,
        z: cz + Math.sin(theta) * spread,
        sx: (34 + rand() * 34) * bankScale,
        sy: (14 + rand() * 14) * bankScale,
        seed: rand() * 100,
        opacity: 0.56 + rand() * 0.28,
      })
    }
  }
  return puffs
}

const VERTEX = /* glsl */ `
attribute vec3 aOffset;
attribute vec2 aScale;
attribute float aSeed;
attribute float aOpacity;

uniform float uTime;

varying vec2 vUv;
varying float vSeed;
varying float vOpacity;
varying vec3 vWorldPos;
varying vec3 vCenter;

void main() {
  vUv = uv;
  vSeed = aSeed;
  vOpacity = aOpacity;

  // Gentle trade-wind drift around each cloud's anchor
  vec3 center = aOffset + vec3(
    sin(uTime * 0.045 + aSeed) * 14.0 + cos(uTime * 0.02 + aSeed * 1.7) * 6.0,
    sin(uTime * 0.06 + aSeed * 2.1) * 1.1,
    cos(uTime * 0.038 + aSeed * 0.9) * 10.0
  );
  vCenter = center;

  // Camera-facing spherical billboard basis in world space
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 worldPos = center + right * (position.x * aScale.x) + up * (position.y * aScale.y);
  vWorldPos = worldPos;

  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
`

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec3 uSunGlow;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uGlowStrength;
uniform float uCloudCover;

varying vec2 vUv;
varying float vSeed;
varying float vOpacity;
varying vec3 vWorldPos;
varying vec3 vCenter;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  mat2 r = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 3; i++) {
    s += vnoise(p) * a;
    p = r * p;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  // Slightly flatten cloud bottoms into cumulus bases
  float baseTrim = smoothstep(-0.82, -0.18, p.y);
  float r = length(vec2(p.x, p.y * (p.y < 0.0 ? 1.35 : 0.95)));
  if (r > 1.0) discard;

  float n = fbm(vUv * 3.1 + vec2(vSeed, uTime * 0.018));
  float nFine = vnoise(vUv * 7.5 - vec2(uTime * 0.025, vSeed * 1.7));
  float billow = n * 0.72 + nFine * 0.28;

  float shape = (1.0 - smoothstep(0.22, 0.95, r + (billow - 0.5) * 0.45)) * baseTrim;
  float alpha = shape * vOpacity * smoothstep(0.08, 0.52, uCloudCover);
  if (alpha < 0.01) discard;

  // Approximate 3D puff normal for directional sun shading & warm undersides
  vec3 toCam = normalize(cameraPosition - vWorldPos);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 up = cross(toCam, right);
  vec3 N = normalize(right * p.x + up * p.y + toCam * sqrt(max(0.05, 1.0 - dot(p, p))) + vec3(0.0, 0.25, 0.0));

  float ndotl = dot(N, uSunDir) * 0.5 + 0.5;
  float topLight = smoothstep(-0.5, 0.75, p.y + (billow - 0.5) * 0.3);
  float lit = clamp(ndotl * 0.62 + topLight * 0.48, 0.0, 1.0);

  vec3 col = mix(uCloudShade * 0.92, uCloudLit * 1.14, lit);

  // Forward scattering silver/golden lining when looking toward the sun
  vec3 viewDir = normalize(vWorldPos - cameraPosition);
  float forward = pow(max(dot(viewDir, uSunDir), 1e-4), 4.0);
  float rim = (1.0 - shape * 0.75) * smoothstep(0.1, 0.8, shape);
  col += uSunGlow * forward * (0.55 + rim * 1.65) * uGlowStrength;

  // Exponential aerial perspective blending far clouds smoothly into horizon haze
  float dist = length(vWorldPos - cameraPosition);
  float fogF = dist * uFogDensity * 0.55;
  float fogAmt = 1.0 - exp(-fogF * fogF);
  col = mix(col, uFogColor, clamp(fogAmt, 0.0, 0.85));

  gl_FragColor = vec4(col, alpha * (1.0 - fogAmt * 0.28));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/** Drifting 3D cumulus cloud banks framing the island horizon. */
export function Clouds() {
  const quality = useExplorerStore((s) => s.quality)
  const ref = useRef<InstancedMesh>(null)

  const puffs = useMemo(() => buildPuffs(quality === 'low' ? 10 : 18), [quality])

  const { geometry, material } = useMemo(() => {
    const geo = new PlaneGeometry(1, 1)
    const offsets = new Float32Array(puffs.length * 3)
    const scales = new Float32Array(puffs.length * 2)
    const seeds = new Float32Array(puffs.length)
    const opacities = new Float32Array(puffs.length)

    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i]
      offsets.set([p.x, p.y, p.z], i * 3)
      scales.set([p.sx, p.sy], i * 2)
      seeds[i] = p.seed
      opacities[i] = p.opacity
    }

    geo.setAttribute('aOffset', new InstancedBufferAttribute(offsets, 3))
    geo.setAttribute('aScale', new InstancedBufferAttribute(scales, 2))
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1))
    geo.setAttribute('aOpacity', new InstancedBufferAttribute(opacities, 1))

    const mat = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new Vector3(0, 1, 0) },
        uCloudLit: { value: new Color() },
        uCloudShade: { value: new Color() },
        uSunGlow: { value: new Color() },
        uFogColor: { value: new Color() },
        uFogDensity: { value: 0.001 },
        uGlowStrength: { value: 0.6 },
        uCloudCover: { value: 0.45 },
      },
    })
    return { geometry: geo, material: mat }
  }, [puffs])

  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    for (let i = 0; i < puffs.length; i++) mesh.setMatrixAt(i, dummy.matrix)
    mesh.instanceMatrix.needsUpdate = true
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material, puffs])

  useFrame(({ clock }) => {
    const a = sampleAtmosphere()
    const u = material.uniforms
    u.uTime.value = clock.elapsedTime
    u.uSunDir.value.copy(a.sunDirection)
    u.uCloudLit.value.copy(a.cloudLit)
    u.uCloudShade.value.copy(a.cloudShade)
    u.uSunGlow.value.copy(a.sunGlow)
    u.uFogColor.value.copy(a.fog)
    u.uFogDensity.value = a.fogDensity
    u.uGlowStrength.value = a.glowStrength
    u.uCloudCover.value = a.cloudCover
  })

  return <instancedMesh ref={ref} args={[geometry, material, puffs.length]} frustumCulled={false} renderOrder={2} />
}
