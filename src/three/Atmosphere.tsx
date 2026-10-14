import { Environment, Lightformer } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Fog, type DirectionalLight, type HemisphereLight, type ShaderMaterial } from 'three'
import { ASSETS } from '../config/assets'
import type { TimeOfDay } from '../lib/types'
import { useExplorerStore } from '../store/useExplorerStore'
import { AssetBoundary } from './AssetBoundary'
import { atmosphere, PRESETS, sampleAtmosphere } from './atmosphere'
import { createSkyDome } from './SkyDome'

const SHADOW_EXTENT = 42

/** Sky dome, sun, ambient fill, fog and image-based lighting, all driven by Time of Day. */
export function Atmosphere() {
  const timeOfDay = useExplorerStore((s) => s.timeOfDay)
  const quality = useExplorerStore((s) => s.quality)
  const reducedMotion = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, [])

  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const sun = useRef<DirectionalLight>(null)
  const hemi = useRef<HemisphereLight>(null)

  const sky = useMemo(() => createSkyDome(4000), [])
  useEffect(
    () => () => {
      sky.geometry.dispose()
      ;(sky.material as ShaderMaterial).dispose()
    },
    [sky],
  )

  useLayoutEffect(() => {
    const p = PRESETS.day
    scene.fog = new Fog(p.fog, 350, 2600)
    return () => {
      scene.fog = null
    }
  }, [scene])

  // Cross-fade every lighting parameter between presets.
  useEffect(() => {
    const target = timeOfDay === 'sunset' ? 1 : 0
    const tween = gsap.to(atmosphere, {
      blend: target,
      duration: reducedMotion ? 0 : 2.6,
      ease: 'power2.inOut',
    })
    return () => {
      tween.kill()
    }
  }, [timeOfDay, reducedMotion])

  useFrame(({ camera }) => {
    const a = sampleAtmosphere()
    const u = (sky.material as ShaderMaterial).uniforms
    u.sunDirection.value.copy(a.sunDirection)
    u.zenith.value.copy(a.zenith)
    u.horizon.value.copy(a.horizon)
    u.horizonSun.value.copy(a.horizonSun)
    u.sunGlow.value.copy(a.sunGlow)
    u.glowStrength.value = a.glowStrength
    // Keep the dome centred on the viewer so it behaves like an infinitely distant sky.
    sky.position.copy(camera.position)

    if (sun.current) {
      sun.current.position.copy(a.sunDirection).multiplyScalar(120)
      sun.current.color.copy(a.sunColor)
      // Fade the key light as the sun grazes the horizon.
      sun.current.intensity = a.sunIntensity * Math.min(1, 0.35 + a.sunDirection.y * 4)
    }
    if (hemi.current) {
      hemi.current.color.copy(a.hemiSky)
      hemi.current.groundColor.copy(a.hemiGround)
      hemi.current.intensity = a.hemiIntensity
    }
    if (scene.fog) scene.fog.color.copy(a.fog)
    scene.environmentIntensity = a.envIntensity
    gl.toneMappingExposure = a.exposure
  })

  const shadowSize = quality === 'high' ? 2048 : quality === 'medium' ? 1024 : 512

  return (
    <>
      <primitive object={sky} />
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={sun}
        castShadow={quality !== 'low'}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={1}
        shadow-camera-far={300}
      />
      <ImageBasedLighting timeOfDay={timeOfDay} />
    </>
  )
}

/**
 * Loads the matching HDRI (`env-day.hdr` / `env-sunset.hdr`). If a file is
 * missing, a lightweight studio of Lightformers tinted for that time of day
 * stands in so reflections and fill light still look right.
 */
function ImageBasedLighting({ timeOfDay }: { timeOfDay: TimeOfDay }) {
  const file = timeOfDay === 'day' ? ASSETS.textures.envDay : ASSETS.textures.envSunset
  const fallback = <FallbackEnvironment timeOfDay={timeOfDay} />
  return (
    <AssetBoundary key={file} name={file.replace(/^.*textures\//, 'textures/')} fallback={fallback}>
      <Suspense fallback={fallback}>
        <Environment files={file} background={false} />
      </Suspense>
    </AssetBoundary>
  )
}

function FallbackEnvironment({ timeOfDay }: { timeOfDay: TimeOfDay }) {
  const sunset = timeOfDay === 'sunset'
  return (
    <Environment key={timeOfDay} resolution={128} frames={1} background={false}>
      <color attach="background" args={[sunset ? '#4a3346' : '#9cc4dc']} />
      {/* sky dome */}
      <Lightformer form="rect" intensity={sunset ? 0.8 : 2} color={sunset ? '#f0a27c' : '#d8ecff'} position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[40, 40, 1]} />
      {/* horizon band */}
      <Lightformer form="ring" intensity={sunset ? 1.6 : 0.8} color={sunset ? '#ff8f4d' : '#ffffff'} position={[0, -1, 0]} rotation-x={Math.PI / 2} scale={[18, 18, 1]} />
      {/* sun glint */}
      <Lightformer
        form="circle"
        intensity={sunset ? 6 : 8}
        color={sunset ? '#ffb070' : '#fff6e5'}
        position={sunset ? [-9, 0.6, -3] : [4, 7, 5]}
        scale={2}
      />
      {/* sea bounce */}
      <Lightformer form="rect" intensity={0.5} color={sunset ? '#1d3b52' : '#2aa8b8'} position={[0, -6, 0]} rotation-x={-Math.PI / 2} scale={[40, 40, 1]} />
    </Environment>
  )
}
