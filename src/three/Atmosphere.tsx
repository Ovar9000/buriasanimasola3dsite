import { Environment } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Fog, Mesh, PMREMGenerator, Scene, type DirectionalLight, type HemisphereLight, type ShaderMaterial, type WebGLRenderTarget } from 'three'
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
  const fill = useRef<DirectionalLight>(null)

  const sky = useMemo(() => createSkyDome(4000), [])
  useEffect(
    () => () => {
      sky.geometry.dispose()
      ;(sky.material as ShaderMaterial).dispose()
    },
    [sky],
  )

  // Cheaper clouds on the low tier.
  useEffect(() => {
    const m = sky.material as ShaderMaterial
    m.defines = { CLOUD_OCTAVES: quality === 'low' ? 3 : 5 }
    m.needsUpdate = true
  }, [sky, quality])

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

  useFrame(({ camera, clock }) => {
    const a = sampleAtmosphere()
    const u = (sky.material as ShaderMaterial).uniforms
    u.sunDirection.value.copy(a.sunDirection)
    u.zenith.value.copy(a.zenith)
    u.horizon.value.copy(a.horizon)
    u.horizonSun.value.copy(a.horizonSun)
    u.sunGlow.value.copy(a.sunGlow)
    u.glowStrength.value = a.glowStrength
    u.cloudLit.value.copy(a.cloudLit).multiplyScalar(1.15)
    u.cloudShade.value.copy(a.cloudShade)
    u.cloudCover.value = a.cloudCover
    u.time.value = clock.elapsedTime
    // Keep the dome centred on the viewer so it behaves like an infinitely distant sky.
    sky.position.copy(camera.position)

    if (sun.current) {
      sun.current.position.copy(a.sunDirection).multiplyScalar(120)
      sun.current.color.copy(a.sunColor)
      // Fade the key light as the sun grazes the horizon.
      sun.current.intensity = a.sunIntensity * Math.min(1, 0.35 + a.sunDirection.y * 4)
    }
    if (fill.current) {
      // From over the viewer's shoulder, a little above the eye line.
      fill.current.position.set(camera.position.x, camera.position.y + 20, camera.position.z)
      fill.current.color.copy(a.fillColor)
      fill.current.intensity = a.fillIntensity
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
      <directionalLight ref={fill} />
      <directionalLight
        ref={sun}
        castShadow={quality !== 'low'}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.035}
        shadow-radius={3}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={1}
        shadow-camera-far={300}
      />
      <ImageBasedLighting timeOfDay={timeOfDay} sky={sky} />
    </>
  )
}

/**
 * Loads the matching HDRI (`env-day.hdr` / `env-sunset.hdr`). If a file is
 * missing, the sky dome itself (clouds, sun and all) is rendered into the
 * environment map instead, so reflections and fill light match the sky.
 */
function ImageBasedLighting({ timeOfDay, sky }: { timeOfDay: TimeOfDay; sky: Mesh }) {
  const file = timeOfDay === 'day' ? ASSETS.textures.envDay : ASSETS.textures.envSunset
  const fallback = <SkyEnvironment sky={sky} />
  return (
    <AssetBoundary key={file} name={file.replace(/^.*textures\//, 'textures/')} fallback={fallback}>
      <Suspense fallback={fallback}>
        <Environment files={file} background={false} />
      </Suspense>
    </AssetBoundary>
  )
}

/**
 * Pre-filters the live sky dome into `scene.environment`. Re-rendered while
 * the lighting cross-fades (a few times a second) and once it settles.
 */
function SkyEnvironment({ sky }: { sky: Mesh }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const state = useMemo(() => {
    const envScene = new Scene()
    // Shares the dome's material, so it carries the same uniforms every frame.
    const dome = new Mesh(sky.geometry, sky.material)
    dome.scale.setScalar(0.01)
    envScene.add(dome)
    return { envScene, pmrem: new PMREMGenerator(gl), target: null as WebGLRenderTarget | null, blend: Number.NaN, last: 0, frames: 0 }
  }, [gl, sky])

  useFrame(({ clock }) => {
    // Let <Atmosphere> push the sky uniforms once before the first capture.
    if (state.frames++ < 1) return
    const blend = atmosphere.blend
    const now = clock.elapsedTime
    const changed = blend !== state.blend
    if (!changed && state.target) return
    // While blending, refresh at most ~6× a second; always catch the final value.
    const settled = blend === 0 || blend === 1
    if (state.target && !settled && now - state.last < 0.16) return
    const next = state.pmrem.fromScene(state.envScene, 0, 0.1, 100, { size: 128 })
    scene.environment = next.texture
    state.target?.dispose()
    state.target = next
    state.blend = blend
    state.last = now
  })

  useEffect(
    () => () => {
      if (state.target && scene.environment === state.target.texture) scene.environment = null
      state.target?.dispose()
      state.pmrem.dispose()
    },
    [scene, state],
  )

  return null
}
