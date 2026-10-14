import { useGLTF } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useExplorerStore } from '../store/useExplorerStore'
import { Box3, Group, Matrix4, Mesh, Vector3, type Object3D } from 'three'
import { ASSETS } from '../config/assets'
import { ISLAND } from '../config/scene'
import { AssetBoundary } from './AssetBoundary'
import { getIslandDressing, getProceduralIsland, setIslandOutline } from './proceduralIsland'

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

  // Normalise arbitrary exports: rotate, scale to ISLAND.targetSize, centre on
  // the origin and sit the configured fraction of the model below sea level.
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
    scene.traverse((o) => {
      if ((o as Mesh).isMesh) {
        const m = o as Mesh
        m.castShadow = true
        m.receiveShadow = true
      }
    })
    const position = new Vector3(-centre.x * s, -waterline * s, -centre.z * s)
    // Shape the beach / reef / sign around this model rather than the procedural mesa.
    setIslandOutline(ISLAND.dressing ? measureWaterline(scene, new Matrix4().makeTranslation(position).scale(new Vector3(s, s, s))) : null)
    return { scale: s, position }
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
    </group>
  )
}

/** Beach, slab tail and sign beach in world units (shared with the procedural island). */
function IslandDressing() {
  const geo = useMemo(() => getIslandDressing(), [])
  return (
    <>
      <mesh geometry={geo.terrain} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.96} metalness={0} envMapIntensity={0.6} />
      </mesh>
      <mesh geometry={geo.slabs} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.85} metalness={0} envMapIntensity={0.8} />
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

  return (
    <group ref={root} onPointerDown={logPoint}>
      <mesh geometry={geo.mesa} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.92} metalness={0} envMapIntensity={0.8} />
      </mesh>
      <mesh geometry={geo.rubble} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.85} metalness={0} envMapIntensity={0.8} />
      </mesh>
      <IslandDressing />
    </group>
  )
}
