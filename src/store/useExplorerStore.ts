import { create } from 'zustand'
import { HOTSPOTS, hotspotIndex } from '../data/hotspots'
import type { QualityTier, TimeOfDay, Vec3 } from '../lib/types'

interface ExplorerState {
  /** Currently focused hotspot, `null` = island overview. */
  activeId: string | null
  hoveredId: string | null
  timeOfDay: TimeOfDay
  /** Guided tour auto-advance. */
  touring: boolean
  /** True while GSAP is flying the camera between views. */
  isFlying: boolean
  /** Bumped to force a camera move even if `activeId` didn't change (e.g. reset). */
  viewNonce: number
  sceneReady: boolean
  introDone: boolean
  quality: QualityTier
  /** Hotspot anchors after being dropped onto the island surface. */
  anchors: Record<string, Vec3>
  lightbox: { hotspotId: string; index: number } | null
  aboutOpen: boolean

  select: (id: string | null) => void
  next: () => void
  prev: () => void
  resetView: () => void
  setHovered: (id: string | null) => void
  setTimeOfDay: (t: TimeOfDay) => void
  toggleTimeOfDay: () => void
  startTour: () => void
  stopTour: () => void
  toggleTour: () => void
  setFlying: (v: boolean) => void
  setSceneReady: () => void
  setIntroDone: () => void
  setQuality: (q: QualityTier) => void
  setAnchors: (a: Record<string, Vec3>) => void
  openLightbox: (hotspotId: string, index: number) => void
  closeLightbox: () => void
  setAboutOpen: (v: boolean) => void
}

const wrap = (i: number) => (i + HOTSPOTS.length) % HOTSPOTS.length

const initialQuality = (): QualityTier => {
  if (typeof window === 'undefined') return 'high'
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  if (coarse && cores <= 4) return 'low'
  if (coarse || cores <= 4) return 'medium'
  return 'high'
}

export const useExplorerStore = create<ExplorerState>()((set, get) => ({
  activeId: null,
  hoveredId: null,
  timeOfDay: 'day',
  touring: false,
  isFlying: false,
  viewNonce: 0,
  sceneReady: false,
  introDone: false,
  quality: initialQuality(),
  anchors: Object.fromEntries(HOTSPOTS.map((h) => [h.id, h.anchor])),
  lightbox: null,
  aboutOpen: false,

  select: (id) => set((s) => ({ activeId: id, viewNonce: s.viewNonce + 1 })),
  next: () => {
    const i = hotspotIndex(get().activeId)
    get().select(HOTSPOTS[wrap(i + 1)].id)
  },
  prev: () => {
    const i = hotspotIndex(get().activeId)
    get().select(HOTSPOTS[wrap(i < 0 ? -1 : i - 1)].id)
  },
  resetView: () => set((s) => ({ activeId: null, touring: false, viewNonce: s.viewNonce + 1 })),
  setHovered: (hoveredId) => set({ hoveredId }),
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
  toggleTimeOfDay: () => set((s) => ({ timeOfDay: s.timeOfDay === 'day' ? 'sunset' : 'day' })),
  startTour: () => {
    set({ touring: true, lightbox: null })
    // Kick off from the current stop, or the first one if we're on the overview.
    if (get().activeId === null) get().select(HOTSPOTS[0].id)
  },
  stopTour: () => set({ touring: false }),
  toggleTour: () => (get().touring ? get().stopTour() : get().startTour()),
  setFlying: (isFlying) => set({ isFlying }),
  setSceneReady: () => set({ sceneReady: true }),
  setIntroDone: () => set({ introDone: true }),
  setQuality: (quality) => set({ quality }),
  setAnchors: (anchors) => set({ anchors }),
  openLightbox: (hotspotId, index) => set({ lightbox: { hotspotId, index }, touring: false }),
  closeLightbox: () => set({ lightbox: null }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen, touring: aboutOpen ? false : get().touring }),
}))
