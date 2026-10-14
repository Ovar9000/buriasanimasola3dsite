import { AnimatePresence, motion } from 'framer-motion'
import { Play } from 'lucide-react'
import { HOTSPOTS } from '../data/hotspots'
import { useExplorerStore } from '../store/useExplorerStore'
import { categoryIcon } from './categoryIcon'

/** Desktop: vertical waypoint rail on the left edge. */
export function WaypointRail() {
  const activeId = useExplorerStore((s) => s.activeId)
  const hoveredId = useExplorerStore((s) => s.hoveredId)
  const select = useExplorerStore((s) => s.select)
  const setHovered = useExplorerStore((s) => s.setHovered)
  const stopTour = useExplorerStore((s) => s.stopTour)

  return (
    <nav aria-label="Waypoints" className="glass fixed left-5 top-1/2 z-20 w-56 -translate-y-1/2 rounded-3xl p-2">
      <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-white/45">Waypoints</p>
      <ol>
        {HOTSPOTS.map((h, i) => {
          const active = h.id === activeId
          const Icon = categoryIcon(h.category)
          return (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => {
                  stopTour()
                  select(h.id)
                }}
                onPointerEnter={() => setHovered(h.id)}
                onPointerLeave={() => setHovered(null)}
                aria-current={active ? 'location' : undefined}
                className={`relative flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm transition-colors ${
                  active ? 'text-deep-900' : hoveredId === h.id ? 'bg-white/8 text-white' : 'text-white/75 hover:bg-white/8 hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="rail-active"
                    className="absolute inset-0 rounded-2xl bg-sand-50"
                    transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                  />
                )}
                <span className={`relative w-5 text-[11px] tabular-nums ${active ? 'text-deep-900/60' : 'text-white/40'}`}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="relative flex-1 truncate">{h.label}</span>
                <Icon size={14} className={`relative ${active ? 'text-lagoon-500' : 'text-white/35'}`} aria-hidden />
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** Mobile: horizontally scrolling chips along the bottom while no spot is open. */
export function WaypointChips() {
  const activeId = useExplorerStore((s) => s.activeId)
  const select = useExplorerStore((s) => s.select)
  const startTour = useExplorerStore((s) => s.startTour)
  const touring = useExplorerStore((s) => s.touring)

  return (
    <AnimatePresence>
      {activeId === null && (
        <motion.nav
          aria-label="Waypoints"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="safe-bottom fixed inset-x-0 bottom-0 z-20"
        >
          <ol className="no-scrollbar flex snap-x gap-2 overflow-x-auto px-3 pb-1 pt-6 [mask-image:linear-gradient(90deg,transparent,black_12px,black_calc(100%-12px),transparent)]">
            {!touring && (
              <li className="snap-start">
                <button
                  type="button"
                  onClick={startTour}
                  className="flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-sand-50 px-4 text-sm font-medium text-deep-900 shadow-lg"
                >
                  <Play size={15} aria-hidden /> Guided tour
                </button>
              </li>
            )}
            {HOTSPOTS.map((h, i) => {
              const Icon = categoryIcon(h.category)
              return (
                <li key={h.id} className="snap-start">
                  <button
                    type="button"
                    onClick={() => select(h.id)}
                    className="glass flex h-11 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm text-white"
                  >
                    <span className="text-[11px] tabular-nums text-white/45">{String(i + 1).padStart(2, '0')}</span>
                    <Icon size={14} className="text-lagoon-300" aria-hidden />
                    {h.label}
                  </button>
                </li>
              )
            })}
          </ol>
        </motion.nav>
      )}
    </AnimatePresence>
  )
}
