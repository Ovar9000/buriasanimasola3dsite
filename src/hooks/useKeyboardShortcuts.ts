import { useEffect } from 'react'
import { useExplorerStore } from '../store/useExplorerStore'

/**
 * ← / →  previous / next waypoint
 * Esc    close lightbox → close panel / return to overview
 * T      toggle guided tour
 * L      toggle day / sunset lighting
 * H      return to overview
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
      const st = useExplorerStore.getState()
      if (st.lightbox) return // the lightbox handles its own keys
      switch (e.key) {
        case 'ArrowRight':
          st.stopTour()
          st.next()
          break
        case 'ArrowLeft':
          st.stopTour()
          st.prev()
          break
        case 'Escape':
          if (st.aboutOpen) st.setAboutOpen(false)
          else if (st.activeId) st.resetView()
          break
        case 't':
        case 'T':
          st.toggleTour()
          break
        case 'l':
        case 'L':
          st.toggleTimeOfDay()
          break
        case 'h':
        case 'H':
          st.resetView()
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
