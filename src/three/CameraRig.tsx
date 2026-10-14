import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { useCallback, useEffect, useRef, type ComponentRef } from 'react'
import { MathUtils, Spherical, Vector3, type PerspectiveCamera } from 'three'
import { CONTROLS, INTRO_START, OVERVIEW_VIEW } from '../config/scene'
import { HOTSPOT_BY_ID } from '../data/hotspots'
import { isDesktopWidth, LAYOUT } from '../lib/layout'
import { viewToPosition } from '../lib/math'
import type { Vec3 } from '../lib/types'
import { useExplorerStore } from '../store/useExplorerStore'

/** Flights orbit around this point so they swing round the island rather than through it. */
const PIVOT = new Vector3(0, 2, 0)
const TARGET_CLAMP_RADIUS = 34

interface Shot {
  position: Vector3
  target: Vector3
}

/**
 * Owns the camera: OrbitControls for free exploration, GSAP for the intro
 * fly-in and every waypoint transition, view-offset framing so the subject
 * isn't hidden behind the UI, and a gentle idle auto-orbit.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const tween = useRef<gsap.core.Tween | null>(null)
  const lastInteraction = useRef(performance.now())
  const offset = useRef({ x: 0, y: 0 })

  const sceneReady = useExplorerStore((s) => s.sceneReady)
  const viewNonce = useExplorerStore((s) => s.viewNonce)
  const anchors = useExplorerStore((s) => s.anchors)
  const timeOfDay = useExplorerStore((s) => s.timeOfDay)

  const reducedMotion = useRef(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)

  /** Resolve where the camera should be for the current selection. */
  const resolveShot = useCallback((): Shot => {
    const { activeId, timeOfDay } = useExplorerStore.getState()
    const aspect = size.width / Math.max(1, size.height)
    // Portrait screens need to back off to fit the same subject.
    const fit = aspect < 1 ? 1 + (1 - aspect) * 0.95 : 1
    const hotspot = activeId ? HOTSPOT_BY_ID[activeId] : null
    if (!hotspot) {
      const azimuth = timeOfDay === 'sunset' ? OVERVIEW_VIEW.sunsetAzimuth : OVERVIEW_VIEW.azimuth
      const view = { ...OVERVIEW_VIEW, azimuth, distance: OVERVIEW_VIEW.distance * fit }
      return { position: viewToPosition(OVERVIEW_VIEW.target, view), target: new Vector3(...OVERVIEW_VIEW.target) }
    }
    const target: Vec3 = hotspot.target ?? anchors[hotspot.id] ?? hotspot.anchor
    const view = { ...hotspot.view, distance: hotspot.view.distance * fit }
    return { position: viewToPosition(target, view), target: new Vector3(...target) }
  }, [anchors, size.width, size.height])

  const flyTo = useCallback(
    (shot: Shot, opts: { duration?: number; ease?: string; intro?: boolean } = {}) => {
      const ctrl = controls.current
      if (!ctrl) return
      tween.current?.kill()

      const fromPos = camera.position.clone()
      const fromTarget = ctrl.target.clone()
      const s0 = new Spherical().setFromVector3(fromPos.clone().sub(PIVOT))
      const s1 = new Spherical().setFromVector3(shot.position.clone().sub(PIVOT))
      let dTheta = s1.theta - s0.theta
      dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta)) // shortest way round
      const travel = Math.abs(dTheta) / Math.PI + fromPos.distanceTo(shot.position) / 120
      const duration = reducedMotion.current
        ? 0.001
        : (opts.duration ?? MathUtils.clamp(1.5 + travel * 1.4, 1.6, 3.6))

      const s = new Spherical()
      const proxy = { t: 0 }
      const startNonce = useExplorerStore.getState().viewNonce
      useExplorerStore.getState().setFlying(true)
      ctrl.enabled = false
      ctrl.autoRotate = false

      tween.current = gsap.to(proxy, {
        t: 1,
        duration,
        ease: opts.ease ?? 'power2.inOut',
        onUpdate: () => {
          const t = proxy.t
          // Pull out slightly mid-flight for a cinematic arc, more for longer trips.
          const swell = opts.intro ? 0 : Math.sin(Math.PI * t) * Math.min(0.35, travel * 0.18)
          s.radius = MathUtils.lerp(s0.radius, s1.radius, t) * (1 + swell)
          s.phi = MathUtils.lerp(s0.phi, s1.phi, t) - Math.sin(Math.PI * t) * swell * 0.6
          s.theta = s0.theta + dTheta * t
          s.makeSafe()
          camera.position.setFromSpherical(s).add(PIVOT)
          ctrl.target.lerpVectors(fromTarget, shot.target, t)
          camera.lookAt(ctrl.target)
        },
        onComplete: () => {
          camera.position.copy(shot.position)
          ctrl.target.copy(shot.target)
          ctrl.enabled = true
          ctrl.update()
          lastInteraction.current = performance.now()
          const st = useExplorerStore.getState()
          st.setFlying(false)
          if (opts.intro) {
            st.setIntroDone()
            // A waypoint was picked mid-intro: go there now.
            if (st.viewNonce !== startNonce) latest.current.flyTo(latest.current.resolveShot())
          }
        },
      })
    },
    [camera],
  )

  // Intro: start far out at sea, then sweep in once the scene has loaded.
  useEffect(() => {
    if (!controls.current) return
    camera.position.set(...INTRO_START.position)
    controls.current.target.set(...INTRO_START.target)
    camera.lookAt(controls.current.target)
  }, [camera])

  // Latest callbacks, so the flight effects below fire only on their triggers
  // (not on every resize / anchor update that recreates the callbacks).
  const latest = useRef({ flyTo, resolveShot })
  latest.current = { flyTo, resolveShot }

  useEffect(() => {
    if (!sceneReady || useExplorerStore.getState().introDone) return
    const { flyTo: fly, resolveShot: shot } = latest.current
    fly(shot(), { duration: 4.8, ease: 'power3.inOut', intro: true })
  }, [sceneReady])

  // Every selection / reset triggers a flight (after the intro).
  useEffect(() => {
    if (!useExplorerStore.getState().introDone) return
    const { flyTo: fly, resolveShot: shot } = latest.current
    fly(shot())
  }, [viewNonce])

  // On the overview, a lighting change re-frames toward the sun.
  useEffect(() => {
    const st = useExplorerStore.getState()
    if (!st.introDone || st.activeId !== null) return
    latest.current.flyTo(latest.current.resolveShot(), { duration: 3.2 })
  }, [timeOfDay])

  useEffect(() => () => void tween.current?.kill(), [])

  // Pause the guided tour when the visitor grabs the camera.
  useEffect(() => {
    const ctrl = controls.current
    if (!ctrl) return
    const onStart = () => {
      lastInteraction.current = performance.now()
      ctrl.autoRotate = false
      const st = useExplorerStore.getState()
      if (st.touring) st.stopTour()
    }
    ctrl.addEventListener('start', onStart)
    return () => ctrl.removeEventListener('start', onStart)
  }, [])

  useFrame((_, delta) => {
    const ctrl = controls.current
    if (!ctrl) return
    const st = useExplorerStore.getState()

    // Idle auto-orbit on the overview.
    const idle = (performance.now() - lastInteraction.current) / 1000 > CONTROLS.idleAutoRotateAfter
    ctrl.autoRotate = idle && st.introDone && !st.isFlying && !st.touring && st.activeId === null && !reducedMotion.current

    // Keep panning within reach of the island.
    const t = ctrl.target
    const r = Math.hypot(t.x, t.z)
    if (r > TARGET_CLAMP_RADIUS) {
      t.x *= TARGET_CLAMP_RADIUS / r
      t.z *= TARGET_CLAMP_RADIUS / r
    }
    t.y = MathUtils.clamp(t.y, -2, 30)

    // Shift the projection so the subject sits in the space the UI leaves free.
    const desktop = isDesktopWidth(size.width)
    const panelOpen = st.activeId !== null
    const wantX = panelOpen && desktop ? Math.min(LAYOUT.panelWidth, size.width * 0.4) / 2 : 0
    const wantY = panelOpen && !desktop ? (size.height * LAYOUT.sheetPeek) / 2 - 24 : 0
    const k = 1 - Math.exp(-delta * 4)
    offset.current.x += (wantX - offset.current.x) * k
    offset.current.y += (wantY - offset.current.y) * k
    if (Math.abs(offset.current.x) < 0.5 && Math.abs(offset.current.y) < 0.5 && wantX === 0 && wantY === 0) {
      if (camera.view?.enabled) camera.clearViewOffset()
    } else {
      camera.setViewOffset(size.width, size.height, offset.current.x, offset.current.y, size.width, size.height)
    }
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.6}
      zoomSpeed={0.8}
      panSpeed={0.7}
      autoRotateSpeed={0.35}
      minDistance={CONTROLS.minDistance}
      maxDistance={CONTROLS.maxDistance}
      maxPolarAngle={CONTROLS.maxPolarAngle}
      screenSpacePanning={false}
    />
  )
}
