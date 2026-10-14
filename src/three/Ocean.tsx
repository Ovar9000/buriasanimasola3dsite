import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  TextureLoader,
  Vector4,
  type ShaderMaterial,
  type Texture,
} from 'three'
import { Water } from 'three/examples/jsm/objects/Water.js'
import { ASSETS } from '../config/assets'
import { OCEAN } from '../config/scene'
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js'
import { mulberry32, smoothstep } from '../lib/math'
import { OCEAN_FRAGMENT } from './oceanShader'
import { islandHasBeach, shoreDistance, tailDistance, terrainHeight } from './proceduralIsland'
import { useExplorerStore } from '../store/useExplorerStore'
import { sampleAtmosphere } from './atmosphere.ts'

/**
 * The sea: three.js `Water` for its planar reflection, with a custom shader
 * (`oceanShader.ts`) for band-limited procedural waves, Fresnel, sun glint,
 * a depth-lit turquoise lagoon over a baked seabed, caustics and shore foam.
 * If `water-normals.jpg` is missing, a tileable ripple map is synthesised.
 */
export function Ocean() {
  const quality = useExplorerStore((s) => s.quality)
  const outlineVersion = useExplorerStore((s) => s.outlineVersion)
  const normals = useWaterNormals()
  // Re-bake the seabed whenever the island outline is re-measured.
  const seabed = useMemo(() => createSeabedTexture(), [outlineVersion])
  useEffect(() => () => seabed.dispose(), [seabed])

  const water = useMemo(() => {
    const res = quality === 'high' ? 1024 : quality === 'medium' ? 768 : 384
    const w = new Water(new PlaneGeometry(OCEAN.size, OCEAN.size), {
      textureWidth: res,
      textureHeight: res,
      waterNormals: normals,
      sunDirection: sampleAtmosphere().sunDirection.clone(),
      sunColor: 0xffffff,
      waterColor: OCEAN.dayColor,
      distortionScale: 2.2,
      fog: true,
    })
    w.rotation.x = -Math.PI / 2
    w.renderOrder = -1
    w.receiveShadow = true
    const m = w.material as ShaderMaterial
    m.fragmentShader = OCEAN_FRAGMENT
    m.defines = { OCEAN_WAVES: quality === 'low' ? 6 : 10, ...(quality === 'low' ? {} : { OCEAN_CAUSTICS: '' }) }
    Object.assign(m.uniforms, {
      seabed: { value: null },
      seabedRect: { value: new Vector4(REEF.centre[0] - REEF.size / 2, REEF.centre[1] - REEF.size / 2, REEF.size, REEF.size) },
      sunIntensity: { value: 1 },
      ambient: { value: new Color() },
      scatterColor: { value: new Color() },
      shallowTint: { value: new Color(1, 1, 1) },
      lagoonGlow: { value: 0 },
    })
    return w
    // `normals` and `seabed` are swapped in place below; only quality should rebuild the reflector.
  }, [quality])

  useEffect(() => {
    const u = (water.material as ShaderMaterial).uniforms
    u.normalSampler.value = normals
    u.seabed.value = seabed
  }, [water, normals, seabed])

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
    u.time.value += Math.min(delta, 0.1)
    u.sunDirection.value.copy(a.sunDirection)
    u.sunColor.value.copy(a.sunColor)
    u.sunIntensity.value = a.sunIntensity
    u.ambient.value.copy(a.hemiSky).multiplyScalar(a.hemiIntensity)
    u.waterColor.value.copy(a.water)
    u.scatterColor.value.copy(a.scatter)
    u.shallowTint.value.copy(a.shallows)
    u.lagoonGlow.value = a.lagoonGlow
  })

  return <primitive object={water} />
}

/** Area covered by the baked seabed (world units); outside it the sea is deep. */
const REEF = { size: 130, centre: [-2, 8] as const, resolution: 384 }

/**
 * Bakes the seabed around the island into a texture the ocean shader reads:
 * R = sqrt(depth / 40 m), G = coral / weed cover, B = weed vs coral,
 * A = sand brightness. Depth follows the beach / reef terrain near the shore
 * and the slab tail, then drops off to open water.
 */
function createSeabedTexture() {
  const { size: S, resolution: n, centre } = REEF
  const beach = islandHasBeach()
  const data = new Uint8Array(n * n * 4)
  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      // row 0 = the -Z (north) edge, i.e. v = 0
      const x = centre[0] - S / 2 + ((px + 0.5) / n) * S
      const z = centre[1] - S / 2 + ((py + 0.5) / n) * S
      const wobble = reefNoise(x * 0.06, z * 0.06) * 0.35
      const island = 1 - smoothstep(1, 13 + wobble * 8, shoreDistance(x, z))
      const tail = tailDistance(x, z)
      const spine = tail.along < 1 ? (1 - smoothstep(1.5, 8.5 + wobble * 6, tail.d)) * (1 - smoothstep(0.85, 1, tail.along)) : 0
      const reef = Math.max(island, spine)
      const sd = shoreDistance(x, z)
      // With the beach dressing the bed follows its terrain; around a bare model
      // it shelves gently from the waterline to the reef flat.
      const shelf = beach ? Math.max(0, -terrainHeight(x, z)) : sd <= 0 ? 0 : Math.min(3.2, 0.12 + sd * 0.32 + reefNoise(x * 0.3, z * 0.3) * 0.25)
      const depth = Math.min(40, shelf + 34 * Math.pow(1 - reef, 1.6))
      const m = reefNoise(x * 0.22 + 11, z * 0.22)
      const patch = smoothstep(0.1, 0.45, m) * smoothstep(0.15, 0.6, reef) * (1 - smoothstep(0.85, 1, reef))
      const i = (py * n + px) * 4
      data[i] = Math.sqrt(depth / 40) * 255
      data[i + 1] = patch * 255
      data[i + 2] = (m > 0.3 ? 1 : 0) * 255
      data[i + 3] = (reefNoise(x * 0.9 - 5, z * 0.9) * 0.5 + 0.5) * 255
    }
  }
  const t = new DataTexture(data, n, n, RGBAFormat)
  t.minFilter = LinearMipmapLinearFilter
  t.magFilter = LinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  return t
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
  const waves = Array.from({ length: 64 }, () => {
    const kx = Math.round((rand() - 0.5) * 22)
    const ky = Math.round((rand() - 0.5) * 22)
    return { kx, ky, amp: 1 / Math.pow(1 + Math.hypot(kx, ky), 1.5), phase: rand() * Math.PI * 2 }
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
