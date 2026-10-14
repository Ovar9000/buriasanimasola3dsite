import { useEffect } from 'react'
import { HOTSPOT_BY_ID } from '../data/hotspots'
import { useExplorerStore } from '../store/useExplorerStore'

const PREFIX = '#/'

const readHash = () => {
  const id = window.location.hash.startsWith(PREFIX) ? decodeURIComponent(window.location.hash.slice(PREFIX.length)) : ''
  return HOTSPOT_BY_ID[id] ? id : null
}

/** Keeps `#/<hotspot-id>` in the URL so any view can be shared or bookmarked. */
export function useHashSync() {
  const activeId = useExplorerStore((s) => s.activeId)

  // Deep link on first load + browser back/forward.
  useEffect(() => {
    const initial = readHash()
    if (initial) useExplorerStore.getState().select(initial)
    const onHash = () => {
      const id = readHash()
      if (id !== useExplorerStore.getState().activeId) useExplorerStore.getState().select(id)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const next = activeId ? `${PREFIX}${activeId}` : ''
    if (window.location.hash === next || (!next && !window.location.hash)) return
    const url = `${window.location.pathname}${window.location.search}${next}`
    window.history.replaceState(null, '', url)
  }, [activeId])
}
