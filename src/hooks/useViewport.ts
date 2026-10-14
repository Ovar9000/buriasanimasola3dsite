import { useSyncExternalStore } from 'react'

const subscribe = (cb: () => void) => {
  window.addEventListener('resize', cb)
  window.visualViewport?.addEventListener('resize', cb)
  return () => {
    window.removeEventListener('resize', cb)
    window.visualViewport?.removeEventListener('resize', cb)
  }
}

/** Live inner height (tracks mobile browser chrome showing/hiding). */
export const useViewportHeight = () =>
  useSyncExternalStore(
    subscribe,
    () => window.innerHeight,
    () => 800,
  )
