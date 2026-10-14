import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Raycaster, Vector3, type Mesh, type Object3D } from 'three'
import { HOTSPOTS, type Hotspot } from '../data/hotspots'
import { smoothstep } from '../lib/math'
import type { Vec3 } from '../lib/types'
import { useExplorerStore } from '../store/useExplorerStore'
import { categoryIcon } from '../ui/categoryIcon'

/**
 * Drops snap-enabled hotspot anchors onto whatever island is loaded (GLB or
 * procedural) by ray-casting straight down, so markers sit on the surface
 * without hand-tuning Y for every model export.
 */
export function useSnapAnchors(island: Object3D | null) {
  const setAnchors = useExplorerStore((s) => s.setAnchors)
  useEffect(() => {
    if (!island) return
    island.updateMatrixWorld(true)
    const ray = new Raycaster()
    const down = new Vector3(0, -1, 0)
    const anchors: Record<string, Vec3> = {}
    for (const h of HOTSPOTS) {
      const attached = h.attachTo ? island.getObjectByName(h.attachTo) : undefined
      if (attached) {
        const p = attached.getWorldPosition(new Vector3())
        anchors[h.id] = [p.x, p.y + (h.lift ?? 1), p.z]
        continue
      }
      if (!h.snap) {
        anchors[h.id] = h.anchor
        continue
      }
      ray.set(new Vector3(h.anchor[0], 500, h.anchor[2]), down)
      // Props flagged `userData.noSnap` (e.g. the sign) shouldn't catch markers.
      const hit = ray.intersectObject(island, true).find((h) => !h.object.userData.noSnap)
      const surface = hit ? hit.point.y : h.anchor[1]
      anchors[h.id] = [h.anchor[0], Math.max(surface + (h.lift ?? 1), h.minY ?? -Infinity), h.anchor[2]]
    }
    setAnchors(anchors)
  }, [island, setAnchors])
}

export function Hotspots() {
  const introDone = useExplorerStore((s) => s.introDone)
  return (
    <group visible={introDone}>
      {HOTSPOTS.map((h, i) => (
        <HotspotMarker key={h.id} hotspot={h} index={i} hidden={!introDone} />
      ))}
    </group>
  )
}

const tmpDir = new Vector3()
const tmpFacing = new Vector3()

function HotspotMarker({ hotspot, index, hidden }: { hotspot: Hotspot; index: number; hidden: boolean }) {
  const anchor = useExplorerStore((s) => s.anchors[hotspot.id])
  const active = useExplorerStore((s) => s.activeId === hotspot.id)
  const hovered = useExplorerStore((s) => s.hoveredId === hotspot.id)
  const select = useExplorerStore((s) => s.select)
  const setHovered = useExplorerStore((s) => s.setHovered)
  const stopTour = useExplorerStore((s) => s.stopTour)

  const wrapper = useRef<HTMLDivElement>(null)
  const ring = useRef<Mesh>(null)
  const position = useMemo(() => new Vector3(...anchor), [anchor])

  // Direction the marker "faces": straight up for aerial, otherwise outward from the island centre.
  const facing = useMemo(() => {
    if (hotspot.category === 'aerial') return new Vector3(0, 1, 0)
    return tmpFacing.set(anchor[0], 0.35 * Math.hypot(anchor[0], anchor[2]), anchor[2]).normalize().clone()
  }, [anchor, hotspot.category])

  useFrame(({ camera, clock }) => {
    const el = wrapper.current
    if (el) {
      // Fade markers on the far side of the island instead of costly occlusion raycasts.
      tmpDir.copy(camera.position).sub(position).normalize()
      const vis = active ? 1 : smoothstep(-0.45, 0.05, tmpDir.dot(facing))
      el.style.opacity = String(vis)
      el.style.pointerEvents = vis > 0.25 ? 'auto' : 'none'
    }
    if (ring.current) {
      const t = (clock.elapsedTime * 0.8) % 1
      ring.current.scale.setScalar(1 + t * 2.2)
      ;(ring.current.material as { opacity: number }).opacity = (1 - t) * 0.7
    }
  })

  const Icon = categoryIcon(hotspot.category)
  const showLabel = active || hovered

  return (
    <group position={position}>
      {hotspot.category !== 'aerial' && (
        // glowing leader line from the marker down to the spot it describes
        <mesh position-y={-(hotspot.lift ?? 1) / 2} visible={!hidden}>
          <cylinderGeometry args={[0.025, 0.025, hotspot.lift ?? 1, 6, 1, true]} />
          <meshBasicMaterial color="#7ff3e6" transparent opacity={active ? 0.9 : 0.55} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {active && hotspot.category !== 'aerial' && (
        <mesh ref={ring} position-y={-(hotspot.lift ?? 1) + 0.15} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.9, 1.15, 48]} />
          <meshBasicMaterial color="#8af7ea" transparent depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {!hidden && (
        <Html center zIndexRange={[30, 10]} style={{ transition: 'opacity 200ms' }}>
          <div ref={wrapper} className="select-none">
            <button
              type="button"
              aria-label={`${hotspot.title} — view details`}
              aria-pressed={active}
              onClick={(e) => {
                e.stopPropagation()
                stopTour()
                select(hotspot.id)
              }}
              onPointerEnter={() => setHovered(hotspot.id)}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setHovered(hotspot.id)}
              onBlur={() => setHovered(null)}
              className="group relative flex items-center gap-2 outline-none"
            >
              <span className="relative grid h-11 w-11 place-items-center">
                {!active && <span className="hotspot-pulse absolute inset-1 rounded-full bg-lagoon-300/50" style={{ animationDelay: `${index * 0.35}s` }} />}
                <span
                  className={`relative grid h-9 w-9 place-items-center rounded-full border shadow-lg backdrop-blur-md transition-all duration-300 group-focus-visible:ring-2 group-focus-visible:ring-sky-300 ${
                    active
                      ? 'scale-110 border-white bg-lagoon-200 text-slate-900 shadow-[0_0_22px_6px_rgba(111,227,212,0.65)]'
                      : 'border-lagoon-200/90 bg-lagoon-500/30 text-white shadow-[0_0_16px_3px_rgba(60,198,192,0.55)] group-hover:scale-110 group-hover:bg-lagoon-500/55'
                  }`}
                >
                  <Icon size={16} strokeWidth={2.2} aria-hidden />
                </span>
              </span>
              <span
                className={`pointer-events-none absolute left-11 whitespace-nowrap rounded-full bg-slate-950/70 px-3 py-1 text-xs font-medium tracking-wide text-white shadow-lg backdrop-blur-md transition-all duration-300 ${
                  showLabel ? 'translate-x-0 opacity-100' : '-translate-x-1 opacity-0'
                }`}
              >
                <span className="mr-1.5 text-white/50">{String(index + 1).padStart(2, '0')}</span>
                {hotspot.label}
              </span>
            </button>
          </div>
        </Html>
      )}
    </group>
  )
}
