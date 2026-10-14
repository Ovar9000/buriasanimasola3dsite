import { useProgress } from '@react-three/drei'
import { AnimatePresence, motion } from 'framer-motion'
import { useExplorerStore } from '../store/useExplorerStore'

/** Full-screen loader shown until the island is in the scene and the intro begins. */
export function LoadingScreen() {
  const sceneReady = useExplorerStore((s) => s.sceneReady)
  const { progress } = useProgress()
  const pct = sceneReady ? 100 : Math.min(99, Math.round(progress))

  return (
    <AnimatePresence>
      {!sceneReady && (
        <motion.div
          key="loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 1.1, ease: 'easeInOut' } }}
          className="fixed inset-0 z-50 grid place-items-center bg-[radial-gradient(120%_80%_at_50%_100%,#0b3b4d_0%,#06141f_55%,#030b12_100%)] px-6"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Loading Animasola Island"
        >
          <div className="w-full max-w-sm text-center">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.3em] text-lagoon-300">Burias · Masbate · Philippines</p>
            <h1 className="font-display text-5xl text-sand-50 sm:text-6xl">Animasola</h1>
            <p className="mt-3 text-sm text-white/60">The island of the lonely soul</p>
            <div className="mx-auto mt-10 h-px w-full overflow-hidden bg-white/10">
              <motion.div
                className="h-full bg-gradient-to-r from-lagoon-400 to-sand-100"
                animate={{ width: `${pct}%` }}
                transition={{ ease: 'easeOut', duration: 0.4 }}
              />
            </div>
            <p className="mt-3 text-xs tabular-nums text-white/45">{pct}%</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
