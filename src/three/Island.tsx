import { useGLTF } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useExplorerStore } from '../store/useExplorerStore'
import { Box3, Color, Group, Matrix4, Mesh, Vector3, type MeshStandardMaterial, type Object3D } from 'three'
import { ASSETS } from '../config/assets'
import { ISLAND } from '../config/scene'
import { AssetBoundary } from './AssetBoundary'
import { eastShorePoint, getIslandDressing, getProceduralIsland, setIslandOutline, terrainHeight } from './proceduralIsland'
import { applyRockDetail } from './rockDetail'
import { buildSignGeometry } from './signLetters'

interface IslandProps {
  /** Called with the island root once it is in the scene (used for hotspot surface snapping). */
  onReady: (root: Object3D) => void
}

/**
 * The island: loads `animasola-island.glb`, and falls back to a procedural
 * stand-in if the model is missing or fails to parse.
 */
export function Island({ onReady }: IslandProps) {
  return (
    <AssetBoundary name="models/animasola-island.glb" fallback={<ProceduralIsland onReady={onReady} />}>
      <IslandModel onReady={onReady} />
    </AssetBoundary>
  )
}

/** Dev helper: Alt/Option-click the island to log a world position for hotspot authoring. */
const logPoint = (e: ThreeEvent<PointerEvent>) => {
  if (!import.meta.env.DEV || !e.altKey) return
  e.stopPropagation()
  const p = e.point
  console.info(`[hotspot] anchor: [${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}]`)
}

function IslandModel({ onReady }: IslandProps) {
  const { scene } = useGLTF(ASSETS.model.island)
  const root = useRef<Group>(null)

  // Normalise arbitrary exports from their bounding box: rotate, scale the
  // longest horizontal side to ISLAND.targetSize, centre on the origin and sit
  // the configured fraction of the model below sea level (y = 0).
  const fit = useMemo(() => {
    scene.rotation.y = ISLAND.rotationY
    scene.position.set(0, 0, 0)
    scene.scale.setScalar(1)
    scene.updateMatrixWorld(true)
    const box = new Box3().setFromObject(scene)
    const size = box.getSize(new Vector3())
    const centre = box.getCenter(new Vector3())
    const s = ISLAND.targetSize / Math.max(size.x, size.z, 1e-6)
    const waterline = box.min.y + size.y * ISLAND.submergedFraction
    let triangles = 0
    scene.traverse((o) => {
      if ((o as Mesh).isMesh) {
        const m = o as Mesh
        m.castShadow = true
        m.receiveShadow = true
        triangles += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3
        gradeMaterial(m.material as MeshStandardMaterial)
      }
    })
    const position = new Vector3(-centre.x * s, -waterline * s, -centre.z * s)
    const toWorld = new Matrix4().makeTranslation(position).scale(new Vector3(s, s, s))
    // Shape the reef (and the optional beach dressing) around this model.
    setIslandOutline(measureWaterline(scene, toWorld), ISLAND.dressing)
    const sign = ISLAND.dressing ? dressingSignSpot() : modelSignSpot(scene, toWorld)
    console.info(
      `[assets] models/animasola-island.glb loaded: ${Math.round(triangles).toLocaleString()} triangles, ` +
        `fitted to ${(size.x * s).toFixed(1)} × ${(size.y * s).toFixed(1)} × ${(size.z * s).toFixed(1)} world units.`,
    )
    return { scale: s, position, sign }
  }, [scene])

  const bumpOutline = useExplorerStore((st) => st.bumpOutline)
  useLayoutEffect(() => {
    bumpOutline()
    if (root.current) onReady(root.current)
  }, [onReady, fit, bumpOutline])

  return (
    <group ref={root} onPointerDown={logPoint}>
      <group position={fit.position} scale={fit.scale}>
        <primitive object={scene} />
      </group>
      {ISLAND.dressing && <IslandDressing />}
      <IslandSign position={fit.sign} />
    </group>
  )
}

const graded = new WeakSet<MeshStandardMaterial>()

/**
 * Scan exports tend to come out grey and slightly metallic, which reads as
 * dull concrete under a tropical sun. Make the rock fully dielectric, warm
 * its albedo toward the honey-brown of the real cliffs, and add the
 * triplanar strata / grass / sand detail on top of its texture.
 */
function gradeMaterial(mat: MeshStandardMaterial) {
  if (!mat?.isMeshStandardMaterial || graded.has(mat)) return
  graded.add(mat)
  mat.metalness = 0
  mat.color.multiply(new Color(ISLAND.tint))
  mat.envMapIntensity = 1.1
  applyRockDetail(mat, { grassLine: ISLAND.grassLine })
}

/** The ANIMASOLA letters, facing east (+X) and reading left to right from the sea. */
function IslandSign({ position }: { position: Vector3 }) {
  const geometry = useMemo(() => buildSignGeometry(), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh
      name="animasola-sign"
      geometry={geometry}
      position={position}
      rotation-y={Math.PI / 2}
      castShadow
      receiveShadow
      userData={{ noSnap: true }}
    >
      <meshStandardMaterial color="#f7f5ef" roughness={0.38} metalness={0} envMapIntensity={1.2} />
    </mesh>
  )
}

/** Where the sign stands: north–south position on the east front. */
const SIGN_Z = 0.5

/** On the procedural beach, a couple of metres up from the water. */
function dressingSignSpot() {
  const [x, z] = eastShorePoint(SIGN_Z, 2.4)
  return new Vector3(x, terrainHeight(x, z) - 0.05, z)
}

/**
 * On a bare model: the first dry ground met walking in from the sea along the
 * east front, found from a height profile of the model's vertices (cheaper
 * than ray-casting half a million triangles).
 */
function modelSignSpot(scene: Object3D, fit: Matrix4) {
  const BIN = 0.25
  const bins = 160
  const top = new Float32Array(bins).fill(-Infinity)
  const v = new Vector3()
  const m = new Matrix4()
  scene.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    m.multiplyMatrices(fit, mesh.matrixWorld)
    const pos = mesh.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m)
      if (v.x < 0 || Math.abs(v.z - SIGN_Z) > 1.6) continue
      const b = Math.floor(v.x / BIN)
      if (b < bins) top[b] = Math.max(top[b], v.y)
    }
  })
  // walk inland from the outermost bin to the first one standing clear of the sea
  for (let b = bins - 1; b >= 0; b--) {
    if (top[b] > 0.12) {
      const x = (b + 0.5) * BIN
      // a sheer cliff: stand the letters just in front of it, on the waterline
      const y = top[b] > 1.2 ? 0.02 : top[b] - 0.06
      return new Vector3(top[b] > 1.2 ? x + 0.6 : x - 0.3, y, SIGN_Z)
    }
  }
  const [x] = eastShorePoint(SIGN_Z, 0.5)
  return new Vector3(x, 0.02, SIGN_Z)
}

/** Beach, slab tail and sign beach in world units (shared with the procedural island). */
function IslandDressing() {
  const geo = useMemo(() => getIslandDressing(), [])
  return (
    <>
      <mesh geometry={geo.terrain} receiveShadow>
        <meshStandardMaterial vertexColors color="#c9b494" roughness={0.96} metalness={0} envMapIntensity={0.6} />
      </mesh>
      <mesh geometry={geo.slabs} castShadow receiveShadow>
        <meshStandardMaterial vertexColors color="#c7b49c" roughness={0.85} metalness={0} envMapIntensity={0.8} />
      </mesh>
      <mesh geometry={geo.props} castShadow receiveShadow userData={{ noSnap: true }}>
        <meshStandardMaterial vertexColors roughness={0.6} metalness={0} />
      </mesh>
    </>
  )
}

/**
 * Waterline outline of a model in world space: the furthest vertex within a
 * metre of sea level, per angular bin, gap-filled and smoothed.
 */
function measureWaterline(scene: Object3D, fit: Matrix4, bins = 180) {
  const radius = new Float32Array(bins)
  const v = new Vector3()
  const m = new Matrix4()
  scene.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    m.multiplyMatrices(fit, mesh.matrixWorld)
    const pos = mesh.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m)
      if (v.y > 1) continue
      const b = Math.floor(((Math.atan2(v.z, v.x) + Math.PI) / (Math.PI * 2)) * bins) % bins
      radius[b] = Math.max(radius[b], Math.hypot(v.x, v.z))
    }
  })
  // fill empty bins from their nearest filled neighbours
  const filled = radius.slice()
  for (let b = 0; b < bins; b++) {
    if (filled[b] > 0) continue
    for (let d = 1; d < bins / 2; d++) {
      const r = Math.max(radius[(b + d) % bins], radius[(b - d + bins) % bins])
      if (r > 0) {
        filled[b] = r
        break
      }
    }
  }
  // circular smoothing so the shore doesn't zig-zag
  const out = new Float32Array(bins)
  for (let b = 0; b < bins; b++) {
    let sum = 0
    for (let d = -2; d <= 2; d++) sum += filled[(b + d + bins) % bins]
    out[b] = sum / 5
  }
  return out
}

function ProceduralIsland({ onReady }: IslandProps) {
  const geo = useMemo(() => {
    setIslandOutline(null)
    return getProceduralIsland()
  }, [])
  const root = useRef<Group>(null)

  const bumpOutline = useExplorerStore((st) => st.bumpOutline)
  useLayoutEffect(() => {
    bumpOutline()
    if (root.current) onReady(root.current)
  }, [onReady, bumpOutline])

  const sign = useMemo(() => dressingSignSpot(), [])

  return (
    <group ref={root} onPointerDown={logPoint}>
      <mesh geometry={geo.mesa} castShadow receiveShadow>
        <meshStandardMaterial ref={detailed} vertexColors roughness={0.92} metalness={0} envMapIntensity={0.8} />
      </mesh>
      <mesh geometry={geo.rubble} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.85} metalness={0} envMapIntensity={0.8} />
      </mesh>
      <IslandDressing />
      <IslandSign position={sign} />
    </group>
  )
}

/** Ref callback adding the triplanar rock detail to the procedural mesa. */
const detailed = (m: MeshStandardMaterial | null) => {
  if (m) applyRockDetail(m, { grassLine: ISLAND.grassLine })
}
