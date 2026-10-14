import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import {
  CanvasTexture,
  Color,
  SRGBColorSpace,
  DataTexture,
  LinearMipmapLinearFilter,
  type MeshBasicMaterial,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  TextureLoader,
  type ShaderMaterial,
  type Texture,
} from 'three'
import { Water } from 'three/examples/jsm/objects/Water.js'
import { ASSETS } from '../config/assets'
import { OCEAN } from '../config/scene'
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js'
import { mulberry32, smoothstep } from '../lib/math'
import { shoreDistance, tailDistance } from './proceduralIsland'
import { useExplorerStore } from '../store/useExplorerStore'
import { sampleAtmosphere } from './atmosphere'

/**
 * Reflective ocean (three.js `Water`) using `water-normals.jpg`, plus a soft
 * turquoise "shallows" halo around the island. If the normal map is missing a
 * tileable one is synthesised so the sea still ripples.
 */
export function Ocean() {
  const quality = useExplorerStore((s) => s.quality)
  const normals = useWaterNormals()

  const water = useMemo(() => {
    const res = quality === 'high' ? 1024 : quality === 'medium' ? 512 : 256
    const w = new Water(new PlaneGeometry(OCEAN.size, OCEAN.size), {
      textureWidth: res,
      textureHeight: res,
      waterNormals: normals,
      sunDirection: sampleAtmosphere().sunDirection.clone(),
      sunColor: 0xffffff,
      waterColor: OCEAN.dayColor,
      distortionScale: 1.6,
      fog: true,
    })
    w.rotation.x = -Math.PI / 2
    w.renderOrder = -1
    const u = (w.material as ShaderMaterial).uniforms
    u.size.value = 14
    u.alpha.value = 1
    return w
    // `normals` is swapped in place below; only quality should rebuild the reflector.
  }, [quality])

  useEffect(() => {
    ;(water.material as ShaderMaterial).uniforms.normalSampler.value = normals
  }, [water, normals])

  useEffect(
    () => () => {
      water.geometry.dispose()
      ;(water.material as ShaderMaterial).dispose()
      // Water keeps its reflection target on the material's mirrorSampler.
      ;((water.material as ShaderMaterial).uniforms.mirrorSampler.value as Texture | null)?.dispose()
    },
    [water],
  )

  useFrame((_, delta) => {
    const a = sampleAtmosphere()
    const u = (water.material as ShaderMaterial).uniforms
    u.time.value += Math.min(delta, 0.1) * 0.8
    u.sunDirection.value.copy(a.sunDirection)
    u.sunColor.value.copy(a.sunColor)
    u.waterColor.value.copy(a.water)
  })

  return (
    <>
      <primitive object={water} />
      <Shallows />
    </>
  )
}

const REEF = { size: 130, centre: [-2, 8] as const, resolution: 384 }

/**
 * Turquoise reef flat laid just above the sea: bright over sand near the
 * shore and along the slab tail, mottled with darker coral, fading to the
 * deep blue. Shaped from the island footprint in `proceduralIsland.ts`.
 */
function Shallows() {
  const outlineVersion = useExplorerStore((s) => s.outlineVersion)
  const texture = useMemo(() => {
    const { size: S, resolution: n, centre } = REEF
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = n
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(n, n)
    const near = new Color('#8ae8d9')
    const mid = new Color('#34c1b8')
    const far = new Color('#1b8b98')
    const coral = new Color('#2d5f5c')
    const weed = new Color('#5d6d4c')
    const c = new Color()
    for (let py = 0; py < n; py++) {
      for (let px = 0; px < n; px++) {
        // canvas row 0 = far (-Z) edge once the plane is laid flat
        const x = centre[0] - S / 2 + ((px + 0.5) / n) * S
        const z = centre[1] - S / 2 + ((py + 0.5) / n) * S
        const wobble = reefNoise(x * 0.06, z * 0.06) * 0.35
        const island = 1 - smoothstep(1, 13 + wobble * 8, shoreDistance(x, z))
        const tail = tailDistance(x, z)
        const spine = 1 - smoothstep(1.5, 8.5 + wobble * 6, tail.d) * (tail.along < 1 ? 1 : 0)
        const reef = Math.max(island, tail.along < 1 ? spine * (1 - smoothstep(0.85, 1, tail.along)) : 0)
        c.copy(far).lerp(mid, smoothstep(0.1, 0.55, reef)).lerp(near, smoothstep(0.6, 0.95, reef))
        const m = reefNoise(x * 0.22 + 11, z * 0.22)
        const patch = smoothstep(0.1, 0.45, m) * smoothstep(0.15, 0.6, reef) * (1 - smoothstep(0.85, 1, reef))
        c.lerp(m > 0.3 ? weed : coral, patch * 0.65)
        const i = (py * n + px) * 4
        img.data[i] = c.r * 255
        img.data[i + 1] = c.g * 255
        img.data[i + 2] = c.b * 255
        img.data[i + 3] = Math.pow(smoothstep(0, 0.55, reef), 1.4) * 235
      }
    }
    ctx.putImageData(img, 0, 0)
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    return t
    // Re-shape the reef whenever the island outline is re-measured.
  }, [outlineVersion])

  useEffect(() => () => texture.dispose(), [texture])

  const [material, setMaterial] = useState<MeshBasicMaterial | null>(null)

  useFrame(() => {
    if (material) material.color.copy(sampleAtmosphere().shallows)
  })

  return (
    <mesh rotation-x={-Math.PI / 2} position={[REEF.centre[0], 0.04, REEF.centre[1]]} renderOrder={1}>
      <planeGeometry args={[REEF.size, REEF.size]} />
      <meshBasicMaterial ref={setMaterial} map={texture} transparent opacity={0.72} depthWrite={false} fog />
    </mesh>
  )
}

const reefNoiseGen = new SimplexNoise({ random: mulberry32(7) })
const reefNoise = (x: number, z: number) =>
  (reefNoiseGen.noise(x, z) + reefNoiseGen.noise(x * 2.1, z * 2.1) * 0.5 + reefNoiseGen.noise(x * 4.3, z * 4.3) * 0.25) / 1.75

/** Loads `water-normals.jpg`, falling back to a generated tileable normal map. */
function useWaterNormals() {
  const [texture, setTexture] = useState<Texture>(() => createProceduralWaterNormals())

  useEffect(() => {
    let cancelled = false
    new TextureLoader().load(
      ASSETS.textures.waterNormals,
      (t) => {
        if (cancelled) return t.dispose()
        t.wrapS = t.wrapT = RepeatWrapping
        setTexture((prev) => {
          prev.dispose()
          return t
        })
      },
      undefined,
      () => console.warn('[assets] "textures/water-normals.jpg" unavailable — using generated normals.'),
    )
    return () => {
      cancelled = true
    }
  }, [])

  return texture
}

/** Tileable normal map built from a sum of integer-frequency waves. */
function createProceduralWaterNormals(size = 256): Texture {
  const rand = mulberry32(42)
  const waves = Array.from({ length: 24 }, () => {
    const kx = Math.round((rand() - 0.5) * 16)
    const ky = Math.round((rand() - 0.5) * 16)
    return { kx, ky, amp: 1 / (1 + Math.hypot(kx, ky)), phase: rand() * Math.PI * 2 }
  }).filter((w) => w.kx !== 0 || w.ky !== 0)

  const data = new Uint8Array(size * size * 4)
  const TAU = Math.PI * 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      let dx = 0
      let dy = 0
      for (const w of waves) {
        const c = Math.cos(TAU * (w.kx * u + w.ky * v) + w.phase) * w.amp * TAU
        dx += c * w.kx
        dy += c * w.ky
      }
      const s = 0.035
      const nx = -dx * s
      const ny = -dy * s
      const inv = 1 / Math.hypot(nx, ny, 1)
      const i = (y * size + x) * 4
      data[i] = (nx * inv * 0.5 + 0.5) * 255
      data[i + 1] = (ny * inv * 0.5 + 0.5) * 255
      data[i + 2] = (inv * 0.5 + 0.5) * 255
      data[i + 3] = 255
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.minFilter = LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}
