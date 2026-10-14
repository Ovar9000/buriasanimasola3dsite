import { AnimatePresence, motion } from 'framer-motion'
import { Keyboard, MousePointer2, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useExplorerStore } from '../store/useExplorerStore'

const SHORTCUTS: [string, string][] = [
  ['← →', 'Previous / next waypoint'],
  ['T', 'Start / pause guided tour'],
  ['L', 'Toggle day / sunset'],
  ['H', 'Back to overview'],
  ['Esc', 'Close panel'],
]

export function AboutDialog() {
  const open = useExplorerStore((s) => s.aboutOpen)
  const setOpen = useExplorerStore((s) => s.setAboutOpen)
  const closeBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) closeBtn.current?.focus()
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="about"
          className="fixed inset-0 z-[55] grid place-items-end bg-black/50 backdrop-blur-sm sm:place-items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="glass safe-bottom no-scrollbar max-h-[88dvh] w-full overflow-y-auto rounded-t-[28px] p-6 sm:max-w-lg sm:rounded-[28px] sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-lagoon-300">San Pascual · Burias Island · Masbate</p>
                <h2 id="about-title" className="mt-1 font-display text-3xl text-sand-50">
                  Animasola Island
                </h2>
              </div>
              <button ref={closeBtn} type="button" onClick={() => setOpen(false)} className="icon-btn -mr-2 -mt-1 text-white/70" aria-label="Close">
                <X size={20} aria-hidden />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-white/80">
              <p>
                A small islet off Burias Island in Masbate, in the Philippines’ Bicol Region, Animasola is a single flat-topped block of
                finely layered rock — sheer, banded cliffs crowned with grass — ringed by pale sand and a trail of flat rock slabs running out
                across a clear, turquoise reef.
              </p>
              <p>
                Its name is usually traced to the Spanish <em>ánima sola</em>, “lonely soul”. Visitors typically arrive by boat on
                island-hopping trips from San Pascual, often paired with nearby Sombrero Island.
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-white/55">
                <MousePointer2 size={13} aria-hidden /> Getting around
              </p>
              <ul className="space-y-1.5 text-sm text-white/75">
                <li>Drag to orbit · scroll or pinch to zoom · right-drag / two-finger drag to pan</li>
                <li>Tap a marker or a waypoint to fly there</li>
              </ul>
              <p className="mb-2 mt-4 hidden items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-white/55 sm:flex">
                <Keyboard size={13} aria-hidden /> Keyboard
              </p>
              <dl className="hidden grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm sm:grid">
                {SHORTCUTS.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt>
                      <kbd className="rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 font-sans text-xs text-white/85">{k}</kbd>
                    </dt>
                    <dd className="text-white/70">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <p className="mt-5 text-xs leading-relaxed text-white/40">
              A view-only 3D visualisation for exploration and trip inspiration — not a navigational chart. Always travel with a licensed local
              boat operator and check sea conditions before crossing.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
