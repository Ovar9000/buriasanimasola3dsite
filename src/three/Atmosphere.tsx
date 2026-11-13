import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { FogExp2, Mesh, PMREMGenerator, Scene, type DirectionalLight, type HemisphereLight, type ShaderMaterial, type WebGLRenderTarget } from 'three'
import { useExplorerStore } from '../store/useExplorerStore'
import { atmosphere, PRESETS, sampleAtmosphere } from './atmosphere.ts'
import { Clouds } from './Clouds'
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
    scene.fog = new FogExp2(p.fog, p.fogDensity)
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
    u.fogColor.value.copy(a.fog)
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
    if (scene.fog) {
      scene.fog.color.copy(a.fog)
      if (scene.fog instanceof FogExp2) scene.fog.density = a.fogDensity
    }
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
      <Clouds />
      <ImageBasedLighting sky={sky} />
    </>
  )
}

/** Pre-filters the live sky dome into the environment map for reflections and ambient fill. */
function ImageBasedLighting({ sky }: { sky: Mesh }) {
  // Live dynamic PMREM environment filtered from the active sky dome
  return <SkyEnvironment sky={sky} />
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
    return {
      envScene,
      pmrem: new PMREMGenerator(gl),
      targetDay: null as WebGLRenderTarget | null,
      targetSunset: null as WebGLRenderTarget | null,
      currentTarget: null as WebGLRenderTarget | null,
      frames: 0,
    }
  }, [gl, sky])

  useFrame(() => {
    // Let <Atmosphere> push the sky uniforms before capture
    if (state.frames++ < 2) return

    const blend = atmosphere.blend
    // Capture on startup, and only re-filter once transitions have settled.
    // This avoids stalling the GPU with 6x cubemap bakes/sec during camera flights!
    const settled = blend === 0 || blend === 1

    if (blend === 0 && !state.targetDay) {
      state.targetDay = state.pmrem.fromScene(state.envScene, 0, 0.1, 100, { size: 256 })
    } else if (blend === 1 && !state.targetSunset) {
      state.targetSunset = state.pmrem.fromScene(state.envScene, 0, 0.1, 100, { size: 256 })
    }

    const desired = blend > 0.5 ? state.targetSunset ?? state.targetDay : state.targetDay ?? state.targetSunset
    if (desired && scene.environment !== desired.texture) {
      scene.environment = desired.texture
      state.currentTarget = desired
    }

    // When fully settled, ensure the settled target exists and is active
    if (settled) {
      const isDay = blend === 0
      const active = isDay ? state.targetDay : state.targetSunset
      if (!active) {
        const next = state.pmrem.fromScene(state.envScene, 0, 0.1, 100, { size: 256 })
        if (isDay) state.targetDay = next
        else state.targetSunset = next
        scene.environment = next.texture
        state.currentTarget = next
      }
    }
  })

  useEffect(
    () => () => {
      scene.environment = null
      state.targetDay?.dispose()
      state.targetSunset?.dispose()
      state.pmrem.dispose()
    },
    [scene, state],
  )

  return null
}
