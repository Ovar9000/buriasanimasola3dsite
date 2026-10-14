import { motion } from 'framer-motion'
import { Info, Pause, Play, RotateCcw, Sun, Sunset } from 'lucide-react'
import { useExplorerStore } from '../store/useExplorerStore'

export function TopBar() {
  const touring = useExplorerStore((s) => s.touring)
  const toggleTour = useExplorerStore((s) => s.toggleTour)
  const timeOfDay = useExplorerStore((s) => s.timeOfDay)
  const setTimeOfDay = useExplorerStore((s) => s.setTimeOfDay)
  const resetView = useExplorerStore((s) => s.resetView)
  const setAboutOpen = useExplorerStore((s) => s.setAboutOpen)

  return (
    <header className="safe-top pointer-events-none fixed inset-x-0 top-0 z-40 flex items-start justify-between gap-2 px-3 sm:px-5">
      <button
        type="button"
        onClick={resetView}
        className="glass pointer-events-auto flex shrink-0 items-center gap-3 rounded-full p-1.5 text-left min-[420px]:pr-4"
        aria-label="Animasola Island — return to overview"
      >
        <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-lagoon-300 to-lagoon-500 text-deep-900">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M3 16c2.2-.8 3.3-5.2 5.2-6.6 1.1 1.5 1.5 3.3 3 3.7 1.1-3.3 2.6-7.3 4.4-8.1 1.1 3 1.9 8.1 3.7 11z" fill="currentColor" />
            <path d="M2 18c3-1.1 4.8 1.1 7.3 0s4.8 1.1 7.3 0 3.7-.7 5.4 0" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
        </span>
        <span className="hidden leading-tight min-[420px]:block">
          <span className="block font-display text-lg text-sand-50">Animasola</span>
          <span className="hidden text-[11px] tracking-wide text-white/55 sm:block">Burias · San Pascual, Masbate</span>
        </span>
      </button>

      <nav className="glass pointer-events-auto flex items-center gap-0.5 rounded-full p-1" aria-label="Explorer controls">
        <button
          type="button"
          onClick={toggleTour}
          aria-pressed={touring}
          aria-label={touring ? 'Pause guided tour' : 'Start guided tour'}
          title={touring ? 'Pause tour (T)' : 'Guided tour (T)'}
          className={`icon-btn gap-2 px-3 ${touring ? 'bg-sand-50 text-deep-900 hover:!bg-white' : ''}`}
        >
          <span className="flex items-center gap-2">
            {touring ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
            <span className="hidden text-sm font-medium sm:inline">{touring ? 'Pause' : 'Tour'}</span>
          </span>
        </button>

        <div role="radiogroup" aria-label="Time of day" className="relative mx-0.5 flex rounded-full bg-white/8 p-0.5">
          {(['day', 'sunset'] as const).map((t) => {
            const active = timeOfDay === t
            const Icon = t === 'day' ? Sun : Sunset
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={t === 'day' ? 'Daytime lighting' : 'Sunset lighting'}
                title={`${t === 'day' ? 'Day' : 'Sunset'} (L)`}
                onClick={() => setTimeOfDay(t)}
                className={`relative grid h-9 w-9 place-items-center rounded-full transition-colors sm:h-10 sm:w-10 ${active ? (t === 'day' ? 'text-deep-900' : 'text-white') : 'text-white/60 hover:text-white'}`}
              >
                {active && (
                  <motion.span
                    layoutId="tod-pill"
                    className={`absolute inset-0 rounded-full ${t === 'day' ? 'bg-sand-50' : 'bg-gradient-to-br from-ember-300 to-ember-400'}`}
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon size={17} className="relative" aria-hidden />
              </button>
            )
          })}
        </div>

        <button type="button" onClick={resetView} className="icon-btn" aria-label="Reset view" title="Overview (H)">
          <RotateCcw size={17} aria-hidden />
        </button>
        <button type="button" onClick={() => setAboutOpen(true)} className="icon-btn" aria-label="About Animasola Island" title="About">
          <Info size={18} aria-hidden />
        </button>
      </nav>
    </header>
  )
}
