import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three'
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ISLAND } from '../config/scene'
import { HOTSPOTS } from '../data/hotspots'
import { mulberry32 } from '../lib/math'
import { useExplorerStore } from '../store/useExplorerStore'

interface Placement {
  pos: Vector3
  normal: Vector3
  scale: number
  yaw: number
  tint: Color
}

const WIND_SWAY = { value: 0 }

/** Attach subtle trade-wind vertex sway to a foliage material via `onBeforeCompile`. */
function applyWindSway(mat: MeshStandardMaterial, strength: number) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = WIND_SWAY
    shader.uniforms.uWindStrength = { value: strength }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;\nuniform float uWindStrength;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec3 wp = (instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
        vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif
        float h = max(transformed.y, 0.0);
        float bend = h * h * uWindStrength;
        float gust = sin(uWindTime * 1.85 + wp.x * 0.55 + wp.z * 0.42) + 0.4 * sin(uWindTime * 3.1 + wp.x * 1.15);
        transformed.x += gust * bend;
        transformed.z += cos(uWindTime * 1.45 + wp.z * 0.65) * bend * 0.6;`,
      )
  }
  mat.customProgramCacheKey = () => `foliage-wind-${strength}`
}

/** Wind-sculpted coastal shrub cushion anchored at y = 0 with deep interior AO shading. */
function buildShrubGeometry(): BufferGeometry {
  const rand = mulberry32(808)
  const parts: BufferGeometry[] = []
  const lobes: [number, number, number, number, number][] = [
    [0, 0.18, 0, 0.36, 0.24],
    [0.24, 0.14, 0.10, 0.27, 0.19],
    [-0.22, 0.15, -0.14, 0.29, 0.20],
    [0.09, 0.16, -0.24, 0.25, 0.18],
    [-0.14, 0.13, 0.23, 0.26, 0.18],
    [0.22, 0.11, -0.16, 0.21, 0.15],
    [-0.24, 0.12, 0.12, 0.22, 0.15],
  ]
  const baseCol = new Color('#1f3813')
  const tipCol = new Color('#6d9033')
  const c = new Color()

  for (const [lx, ly, lz, rx, ry] of lobes) {
    const g = new IcosahedronGeometry(1, 1).toNonIndexed()
    g.deleteAttribute('uv')
    const pos = g.attributes.position
    const colors = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i)
      const vy = pos.getY(i)
      const vz = pos.getZ(i)
      const jitter = 0.78 + rand() * 0.38
      const px = lx + vx * rx * jitter
      const py = Math.max(-0.04, ly + vy * ry * jitter)
      const pz = lz + vz * rx * jitter
      pos.setXYZ(i, px, py, pz)
      const radial = Math.min(1, Math.hypot(px, pz) / 0.55)
      const t = Math.min(1, Math.max(0, (py + 0.02) / 0.36 * 0.7 + radial * 0.3))
      c.copy(baseCol).lerp(tipCol, t * t)
      colors.set([c.r, c.g, c.b], i * 3)
    }
    g.setAttribute('color', new BufferAttribute(colors, 3))
    g.computeVertexNormals()
    parts.push(g)
  }

  const merged = mergeGeometries(parts, false)!
  parts.forEach((p) => p.dispose())
  return merged
}

/** Six-blade arching coastal grass tuft anchored at y = 0. */
function buildGrassGeometry(): BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const root = new Color('#38521e')
  const tip = new Color('#b4ac54')
  const c = new Color()
  const blades = 6

  for (let b = 0; b < blades; b++) {
    const angle = (b / blades) * Math.PI + (b % 2) * 0.32
    const ca = Math.cos(angle)
    const sa = Math.sin(angle)
    const lean = 0.12 + (b % 3) * 0.06
    const h = 0.44 + (b % 3) * 0.11
    const w0 = 0.04
    const segs = 3
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs
      const t1 = (s + 1) / segs
      const y0 = t0 * h
      const y1 = t1 * h
      const hw0 = w0 * (1 - t0 * 0.85)
      const hw1 = w0 * (1 - t1 * 0.95)
      const off0 = t0 * t0 * lean
      const off1 = t1 * t1 * lean
      const ox0 = ca * off0
      const oz0 = sa * off0
      const ox1 = ca * off1
      const oz1 = sa * off1
      const px = -sa
      const pz = ca

      const p00 = [ox0 - px * hw0, y0, oz0 - pz * hw0]
      const p10 = [ox0 + px * hw0, y0, oz0 + pz * hw0]
      const p01 = [ox1 - px * hw1, y1, oz1 - pz * hw1]
      const p11 = [ox1 + px * hw1, y1, oz1 + pz * hw1]

      positions.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01)
      c.copy(root).lerp(tip, t0)
      const c0 = [c.r, c.g, c.b]
      c.copy(root).lerp(tip, t1)
      const c1 = [c.r, c.g, c.b]
      colors.push(...c0, ...c0, ...c1, ...c0, ...c1, ...c1)
    }
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geo.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  geo.computeVertexNormals()
  return geo
}

/** Sample upward-facing summit triangles directly in O(N) without costly raycasts. */
function samplePlacements(island: Object3D, targetShrubs: number, targetGrass: number) {
  island.updateMatrixWorld(true)
  const rand = mulberry32(1984)
  const noise = new SimplexNoise({ random: mulberry32(421) })
  const minLine = ISLAND.grassLine + 0.5

  const va = new Vector3()
  const vb = new Vector3()
  const vc = new Vector3()
  const ab = new Vector3()
  const ac = new Vector3()
  const nrm = new Vector3()

  interface Candidate {
    pos: Vector3
    normal: Vector3
  }
  const pool: Candidate[] = []

  island.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || mesh.userData.noSnap) return
    const pos = mesh.geometry?.attributes?.position
    if (!pos) return
    const idx = mesh.geometry.index
    const triCount = (idx ? idx.count : pos.count) / 3
    if (triCount < 1) return

    const step = Math.max(1, Math.floor(triCount / 55000))
    const mw = mesh.matrixWorld
    for (let t = 0; t < triCount; t += step) {
      const i0 = idx ? idx.getX(t * 3) : t * 3
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2
      va.fromBufferAttribute(pos, i0).applyMatrix4(mw)
      vb.fromBufferAttribute(pos, i1).applyMatrix4(mw)
      vc.fromBufferAttribute(pos, i2).applyMatrix4(mw)
      const cy = (va.y + vb.y + vc.y) / 3
      if (cy < minLine) continue

      ab.subVectors(vb, va)
      ac.subVectors(vc, va)
      nrm.crossVectors(ab, ac)
      if (nrm.lengthSq() < 1e-10) continue
      nrm.normalize()
      if (nrm.y < 0.72) continue

      const cx = (va.x + vb.x + vc.x) / 3
      const cz = (va.z + vb.z + vc.z) / 3
      if (HOTSPOTS.some((h) => Math.hypot(cx - h.anchor[0], cz - h.anchor[2]) < 1.8)) continue

      pool.push({ pos: new Vector3(cx, cy, cz), normal: nrm.clone() })
    }
  })

  // Shuffle candidate triangles deterministically
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
  }

  const shrubs: Placement[] = []
  const grass: Placement[] = []
  const shrubCells = new Set<string>()
  const grassCells = new Set<string>()

  for (const cand of pool) {
    const { pos, normal } = cand
    const n = noise.noise(pos.x * 0.24, pos.z * 0.24) * 0.5 + 0.5

    if (shrubs.length < targetShrubs && pos.y >= 6.8 && normal.y > 0.78 && n >= 0.44) {
      const key = `${Math.round(pos.x / 1.25)},${Math.round(pos.z / 1.25)}`
      if (!shrubCells.has(key)) {
        shrubCells.add(key)
        shrubs.push({
          pos,
          normal,
          scale: 0.44 + rand() * 0.48,
          yaw: rand() * Math.PI * 2,
          tint: new Color().setHSL(0.24 + (rand() - 0.5) * 0.04, 0.42 + rand() * 0.16, 0.80 + rand() * 0.26),
        })
        continue
      }
    }

    if (grass.length < targetGrass && pos.y >= 5.2 && normal.y > 0.75) {
      const key = `${Math.round(pos.x / 0.58)},${Math.round(pos.z / 0.58)}`
      if (!grassCells.has(key)) {
        grassCells.add(key)
        grass.push({
          pos,
          normal,
          scale: 0.75 + rand() * 0.65,
          yaw: rand() * Math.PI * 2,
          tint: new Color().setHSL(0.24 + (rand() - 0.5) * 0.05, 0.4 + rand() * 0.16, 0.88 + rand() * 0.28),
        })
      }
    }

    if (shrubs.length >= targetShrubs && grass.length >= targetGrass) break
  }

  return { shrubs, grass }
}

/** Write placement transforms & colors into an `InstancedMesh`. */
function populateInstances(mesh: InstancedMesh, items: Placement[], tiltFactor: number) {
  const up = new Vector3(0, 1, 0)
  const qSlope = new Quaternion()
  const qYaw = new Quaternion()
  const mat = new Matrix4()
  const s = new Vector3()
  const p = new Vector3()
  const targetUp = new Vector3()

  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    targetUp.copy(up).lerp(it.normal, tiltFactor).normalize()
    qSlope.setFromUnitVectors(up, targetUp)
    qYaw.setFromAxisAngle(up, it.yaw)
    qSlope.multiply(qYaw)
    p.copy(it.pos).addScaledVector(targetUp, -0.05)
    s.setScalar(it.scale)
    mat.compose(p, qSlope, s)
    mesh.setMatrixAt(i, mat)
    mesh.setColorAt(i, it.tint)
  }
  mesh.count = items.length
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

/** Instanced 3D coastal shrubs & wind-swaying grass tufts snapped onto the island plateau. */
export function Vegetation({ island }: { island: Object3D | null }) {
  const quality = useExplorerStore((s) => s.quality)
  const shrubRef = useRef<InstancedMesh>(null)
  const grassRef = useRef<InstancedMesh>(null)

  const counts = quality === 'high' ? { s: 95, g: 300 } : quality === 'medium' ? { s: 65, g: 180 } : { s: 38, g: 0 }

  const placements = useMemo(() => {
    if (!island) return null
    return samplePlacements(island, counts.s, counts.g)
  }, [island, counts.s, counts.g])

  const { shrubGeo, grassGeo, shrubMat, grassMat } = useMemo(() => {
    const sg = buildShrubGeometry()
    const gg = buildGrassGeometry()
    const sm = new MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, envMapIntensity: 0.75 })
    const gm = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0,
      envMapIntensity: 0.75,
      side: DoubleSide,
    })
    applyWindSway(sm, 0.14)
    applyWindSway(gm, 0.36)
    return { shrubGeo: sg, grassGeo: gg, shrubMat: sm, grassMat: gm }
  }, [])

  useEffect(
    () => () => {
      shrubGeo.dispose()
      grassGeo.dispose()
      shrubMat.dispose()
      grassMat.dispose()
    },
    [shrubGeo, grassGeo, shrubMat, grassMat],
  )

  useEffect(() => {
    if (!placements) return
    if (shrubRef.current) populateInstances(shrubRef.current, placements.shrubs, 0.45)
    if (grassRef.current && placements.grass.length > 0) populateInstances(grassRef.current, placements.grass, 0.3)
  }, [placements])

  useFrame(({ clock }) => {
    WIND_SWAY.value = clock.elapsedTime
  })

  if (!placements) return null

  return (
    <group userData={{ noSnap: true }}>
      {placements.shrubs.length > 0 && (
        <instancedMesh
          ref={shrubRef}
          args={[shrubGeo, shrubMat, placements.shrubs.length]}
          castShadow={quality !== 'low'}
          receiveShadow
        />
      )}
      {placements.grass.length > 0 && (
        <instancedMesh ref={grassRef} args={[grassGeo, grassMat, placements.grass.length]} receiveShadow />
      )}
    </group>
  )
}
