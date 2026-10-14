import { animate, AnimatePresence, motion, useDragControls, useMotionValue, type PanInfo } from 'framer-motion'
import { ChevronUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { HOTSPOT_BY_ID, hotspotIndex } from '../data/hotspots'
import { useViewportHeight } from '../hooks/useViewport'
import { LAYOUT } from '../lib/layout'
import { useExplorerStore } from '../store/useExplorerStore'
import { HotspotBody, HotspotHeader } from './HotspotDetails'

const SPRING = { type: 'spring', stiffness: 380, damping: 38 } as const

/** Mobile: draggable bottom sheet with "peek" and "expanded" snap points. */
export function BottomSheet() {
  const activeId = useExplorerStore((s) => s.activeId)
  const hotspot = activeId ? HOTSPOT_BY_ID[activeId] : null
  return <AnimatePresence>{hotspot && <Sheet key="sheet" hotspotId={hotspot.id} />}</AnimatePresence>
}

function Sheet({ hotspotId }: { hotspotId: string }) {
  const hotspot = HOTSPOT_BY_ID[hotspotId]
  const resetView = useExplorerStore((s) => s.resetView)
  const vh = useViewportHeight()
  // Expanded, the sheet stops just below the top bar.
  const height = vh - 72
  const peekY = height - Math.round(vh * LAYOUT.sheetPeek)
  const [expanded, setExpanded] = useState(false)
  const dragControls = useDragControls()
  const y = useMotionValue(peekY)

  // Snap whenever the target changes (expand/collapse, rotation, browser chrome).
  useEffect(() => {
    const ctl = animate(y, expanded ? 0 : peekY, SPRING)
    return () => ctl.stop()
  }, [expanded, peekY, y])

  // New waypoint → back to peek so the camera shot stays visible.
  useEffect(() => setExpanded(false), [hotspotId])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const cur = y.get()
    const v = info.velocity.y
    if (cur > peekY + 90 || (!expanded && v > 700)) return resetView()
    let next = expanded
    if (v < -350) next = true
    else if (v > 350) next = false
    else next = cur < peekY / 2
    if (next === expanded) animate(y, next ? 0 : peekY, SPRING)
    else setExpanded(next)
  }

  return (
    <motion.section
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={SPRING}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30"
      style={{ height }}
      aria-label={`${hotspot.title} details`}
    >
      <motion.div
        style={{ y }}
        drag="y"
        dragControls={dragControls}
        dragListener={!expanded}
        dragDirectionLock
        dragConstraints={{ top: 0, bottom: height }}
        dragElastic={{ top: 0.04, bottom: 0.3 }}
        dragMomentum={false}
        onDragEnd={onDragEnd}
        className="glass pointer-events-auto flex h-full flex-col rounded-t-[28px] border-b-0"
      >
        <div className="touch-none px-5 pt-2" onPointerDown={(e) => dragControls.start(e)}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mx-auto mb-2 flex h-6 w-16 items-center justify-center"
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
            aria-expanded={expanded}
          >
            <span className="h-1.5 w-10 rounded-full bg-white/35" />
          </button>
          <HotspotHeader hotspot={hotspot} index={hotspotIndex(hotspot.id)} onClose={resetView} />
        </div>
        <div
          className={`no-scrollbar safe-bottom min-h-0 flex-1 px-5 pt-4 ${expanded ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden'}`}
        >
          <HotspotBody hotspot={hotspot} />
        </div>
        {!expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="absolute inset-x-0 flex items-center justify-center gap-1 bg-gradient-to-t from-deep-950 via-deep-950/90 to-transparent pb-3 pt-8 text-xs font-medium uppercase tracking-[0.14em] text-white/75"
            style={{ top: Math.round(vh * LAYOUT.sheetPeek) - 64 }}
          >
            <ChevronUp size={14} aria-hidden /> More about this spot
          </button>
        )}
      </motion.div>
    </motion.section>
  )
}
