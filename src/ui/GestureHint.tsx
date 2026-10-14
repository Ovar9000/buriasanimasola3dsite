import { AnimatePresence, motion } from 'framer-motion'
import { Hand } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useExplorerStore } from '../store/useExplorerStore'

/** One-time "how to move" hint after the intro lands; dismissed on first interaction. */
export function GestureHint({ desktop }: { desktop: boolean }) {
  const introDone = useExplorerStore((s) => s.introDone)
  const activeId = useExplorerStore((s) => s.activeId)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!introDone) return
    setShow(true)
    const hide = () => setShow(false)
    const id = window.setTimeout(hide, 7000)
    window.addEventListener('pointerdown', hide, { once: true })
    window.addEventListener('wheel', hide, { once: true })
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('pointerdown', hide)
      window.removeEventListener('wheel', hide)
    }
  }, [introDone])

  return (
    <AnimatePresence>
      {show && activeId === null && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className={`glass pointer-events-none fixed left-1/2 z-10 flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-full px-4 py-2 text-xs text-white/85 ${
            desktop ? 'bottom-6' : 'bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.5rem)]'
          }`}
        >
          <Hand size={14} className="text-lagoon-300" aria-hidden />
          {desktop ? 'Drag to orbit · scroll to zoom · click a marker to fly in' : 'Drag to orbit · pinch to zoom · tap a marker'}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
