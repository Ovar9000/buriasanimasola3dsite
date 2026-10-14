import { PerformanceMonitor } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { NeutralToneMapping, type Object3D } from 'three'
import type { QualityTier } from '../lib/types'
import { useExplorerStore } from '../store/useExplorerStore'
import { Atmosphere } from './Atmosphere'
import { CameraRig } from './CameraRig'
import { Effects } from './Effects'
import { Hotspots, useSnapAnchors } from './Hotspots'
import { Island } from './Island'
import { Ocean } from './Ocean'

const DPR: Record<QualityTier, [number, number]> = {
  low: [0.75, 1],
  medium: [1, 1.5],
  high: [1, 2],
}

const TIERS: QualityTier[] = ['low', 'medium', 'high']

export function Experience() {
  const quality = useExplorerStore((s) => s.quality)
  const setQuality = useExplorerStore((s) => s.setQuality)
  const [island, setIsland] = useState<Object3D | null>(null)
  // MSAA on the default framebuffer only helps when the composer is off.
  const [antialias] = useState(() => useExplorerStore.getState().quality === 'low')
  // Never climb above what the device was first judged capable of.
  const [ceiling] = useState(() => TIERS.indexOf(useExplorerStore.getState().quality))

  useSnapAnchors(island)

  const step = useCallback(
    (dir: 1 | -1) => {
      const i = TIERS.indexOf(useExplorerStore.getState().quality)
      setQuality(TIERS[Math.min(ceiling, Math.max(0, i + dir))])
    },
    [setQuality, ceiling],
  )

  return (
    <Canvas
      className="!fixed inset-0"
      shadows="percentage"
      dpr={DPR[quality]}
      camera={{ fov: 42, near: 0.5, far: 9000, position: [-210, 95, 260] }}
      gl={{ antialias, powerPreference: 'high-performance', toneMapping: NeutralToneMapping }}
      aria-label="Interactive 3D model of Animasola Island"
    >
      <PerformanceMonitor
        flipflops={3}
        onDecline={() => step(-1)}
        onIncline={() => step(1)}
        onFallback={() => setQuality('low')}
      />
      <Atmosphere />
      <Ocean />
      <Suspense fallback={null}>
        <Island onReady={setIsland} />
        <SceneReady />
      </Suspense>
      <Hotspots />
      <CameraRig />
      <Effects />
    </Canvas>
  )
}

/** Mounts once the suspended island content has resolved (loaded or fallen back). */
function SceneReady() {
  const setSceneReady = useExplorerStore((s) => s.setSceneReady)
  useEffect(() => {
    // Give the first frame a moment to compile shaders before the intro starts.
    const id = window.setTimeout(setSceneReady, 250)
    return () => window.clearTimeout(id)
  }, [setSceneReady])
  return null
}
