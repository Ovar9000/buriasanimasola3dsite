import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { HOTSPOT_BY_ID } from '../data/hotspots'
import { useExplorerStore } from '../store/useExplorerStore'
import { SmartImage } from './SmartImage'

/** Full-screen photo viewer (swipe, arrow keys, Esc). */
export function Lightbox() {
  const lightbox = useExplorerStore((s) => s.lightbox)
  const close = useExplorerStore((s) => s.closeLightbox)
  const open = useExplorerStore((s) => s.openLightbox)
  const closeBtn = useRef<HTMLButtonElement>(null)

  const hotspot = lightbox ? HOTSPOT_BY_ID[lightbox.hotspotId] : null
  const images = hotspot?.images ?? []
  const index = lightbox?.index ?? 0
  const image = images[index]

  const go = (d: number) => {
    if (!hotspot || images.length < 2) return
    open(hotspot.id, (index + d + images.length) % images.length)
  }

  useEffect(() => {
    if (!lightbox) return
    closeBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120) close()
    else if (info.offset.x < -60) go(1)
    else if (info.offset.x > 60) go(-1)
  }

  return (
    <AnimatePresence>
      {hotspot && image && (
        <motion.div
          key="lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-xl"
          role="dialog"
          aria-modal="true"
          aria-label={`${hotspot.title} photos`}
          onClick={close}
        >
          <div className="safe-top flex items-center justify-between px-4 pb-2" onClick={(e) => e.stopPropagation()}>
            <div className="min-w-0">
              <p className="truncate font-display text-lg text-sand-50">{hotspot.title}</p>
              <p className="text-xs text-white/55 tabular-nums">
                {index + 1} / {images.length}
              </p>
            </div>
            <button ref={closeBtn} type="button" onClick={close} className="icon-btn" aria-label="Close photos">
              <X size={22} aria-hidden />
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={image.src}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.22 }}
                drag
                dragSnapToOrigin
                dragElastic={0.6}
                onDragEnd={onDragEnd}
                onClick={(e) => e.stopPropagation()}
                className="h-full max-h-[80dvh] w-full max-w-6xl touch-none"
              >
                <SmartImage src={image.src} alt={image.alt} label={hotspot.title} className="h-full w-full rounded-xl [&_img]:object-contain" />
              </motion.div>
            </AnimatePresence>
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    go(-1)
                  }}
                  className="icon-btn absolute left-2 bg-white/10 sm:left-4"
                  aria-label="Previous photo"
                >
                  <ChevronLeft size={22} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    go(1)
                  }}
                  className="icon-btn absolute right-2 bg-white/10 sm:right-4"
                  aria-label="Next photo"
                >
                  <ChevronRight size={22} aria-hidden />
                </button>
              </>
            )}
          </div>
          {image.caption && (
            <p className="safe-bottom px-6 pt-3 text-center text-sm text-white/70" onClick={(e) => e.stopPropagation()}>
              {image.caption}
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
