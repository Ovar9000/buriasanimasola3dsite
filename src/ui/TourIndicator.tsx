import { AnimatePresence, motion } from 'framer-motion'
import { Pause } from 'lucide-react'
import { TOUR } from '../config/scene'
import { HOTSPOT_BY_ID, HOTSPOTS, hotspotIndex } from '../data/hotspots'
import { useExplorerStore } from '../store/useExplorerStore'

/** "Guided tour · 3 / 7" pill with a dwell progress bar. */
export function TourIndicator({ desktop }: { desktop: boolean }) {
  const touring = useExplorerStore((s) => s.touring)
  const activeId = useExplorerStore((s) => s.activeId)
  const isFlying = useExplorerStore((s) => s.isFlying)
  const viewNonce = useExplorerStore((s) => s.viewNonce)
  const stopTour = useExplorerStore((s) => s.stopTour)
  const hotspot = activeId ? HOTSPOT_BY_ID[activeId] : null

  return (
    <AnimatePresence>
      {touring && hotspot && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className={`glass pointer-events-auto fixed z-30 overflow-hidden rounded-full ${
            desktop ? 'left-1/2 top-[84px] -translate-x-1/2' : 'left-3 right-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.75rem)]'
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 py-1.5 pl-4 pr-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-lagoon-300">Guided tour</span>
            <span className="min-w-0 flex-1 truncate text-sm text-white">
              {hotspot.label}
              <span className="ml-2 text-white/45 tabular-nums">
                {hotspotIndex(hotspot.id) + 1}/{HOTSPOTS.length}
              </span>
            </span>
            <button type="button" onClick={stopTour} className="icon-btn h-8 min-w-8" aria-label="Pause guided tour">
              <Pause size={14} aria-hidden />
            </button>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
            {!isFlying && (
              <motion.div
                key={viewNonce}
                className="h-full origin-left bg-lagoon-300"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: TOUR.dwell, ease: 'linear' }}
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
