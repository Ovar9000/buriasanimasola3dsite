import { AnimatePresence, motion } from 'framer-motion'
import { HOTSPOT_BY_ID, hotspotIndex } from '../data/hotspots'
import { LAYOUT } from '../lib/layout'
import { useExplorerStore } from '../store/useExplorerStore'
import { HotspotBody, HotspotHeader } from './HotspotDetails'

/** Desktop: floating glass panel docked to the right edge. */
export function DetailPanel() {
  const activeId = useExplorerStore((s) => s.activeId)
  const resetView = useExplorerStore((s) => s.resetView)
  const hotspot = activeId ? HOTSPOT_BY_ID[activeId] : null

  return (
    <AnimatePresence>
      {hotspot && (
        <motion.aside
          key="panel"
          initial={{ x: 48, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 48, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          style={{ width: `min(${LAYOUT.panelWidth}px, 40vw)` }}
          className="glass fixed bottom-4 right-4 top-[84px] z-20 flex flex-col overflow-hidden rounded-[28px]"
          aria-label={`${hotspot.title} details`}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={hotspot.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="px-6 pb-4 pt-6">
                <HotspotHeader hotspot={hotspot} index={hotspotIndex(hotspot.id)} onClose={resetView} />
              </div>
              <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-6">
                <HotspotBody hotspot={hotspot} />
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
