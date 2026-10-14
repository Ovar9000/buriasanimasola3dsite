import { useGLTF } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Box3, Group, Mesh, Vector3, type Object3D } from 'three'
import { ASSETS } from '../config/assets'
import { ISLAND } from '../config/scene'
import { AssetBoundary } from './AssetBoundary'
import { getProceduralIsland } from './proceduralIsland'

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
    return { scale: s, position: new Vector3(-centre.x * s, -waterline * s, -centre.z * s) }
  }, [scene])

  useLayoutEffect(() => {
    if (root.current) onReady(root.current)
  }, [onReady, fit])

  return (
    <group ref={root} position={fit.position} scale={fit.scale} onPointerDown={logPoint}>
      <primitive object={scene} />
    </group>
  )
}

function ProceduralIsland({ onReady }: IslandProps) {
  const geo = useMemo(() => getProceduralIsland(), [])
  const root = useRef<Group>(null)

  useLayoutEffect(() => {
    if (root.current) onReady(root.current)
  }, [onReady])

  return (
    <group ref={root} onPointerDown={logPoint}>
      <mesh geometry={geo.terrain} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.96} metalness={0} envMapIntensity={0.6} />
      </mesh>
      <mesh geometry={geo.mesa} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.92} metalness={0} envMapIntensity={0.8} />
      </mesh>
      <mesh geometry={geo.rocks} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.85} metalness={0} envMapIntensity={0.8} />
      </mesh>
      <mesh geometry={geo.props} castShadow receiveShadow userData={{ noSnap: true }}>
        <meshStandardMaterial vertexColors roughness={0.6} metalness={0} />
      </mesh>
    </group>
  )
}
