import { useEffect } from 'react'
import { TOUR } from '../config/scene'
import { HOTSPOTS, hotspotIndex } from '../data/hotspots'
import { useExplorerStore } from '../store/useExplorerStore'

/**
 * Drives the guided tour: once the camera lands on a waypoint, linger for
 * TOUR.dwell seconds, then move on. After the last stop it returns to the
 * overview and ends.
 */
export function useTourDirector() {
  const touring = useExplorerStore((s) => s.touring)
  const isFlying = useExplorerStore((s) => s.isFlying)
  const activeId = useExplorerStore((s) => s.activeId)
  const viewNonce = useExplorerStore((s) => s.viewNonce)

  useEffect(() => {
    if (!touring || isFlying || activeId === null) return
    const id = window.setTimeout(() => {
      const st = useExplorerStore.getState()
      const i = hotspotIndex(st.activeId)
      if (i >= HOTSPOTS.length - 1) st.resetView()
      else st.select(HOTSPOTS[i + 1].id)
    }, TOUR.dwell * 1000)
    return () => window.clearTimeout(id)
  }, [touring, isFlying, activeId, viewNonce])
}
