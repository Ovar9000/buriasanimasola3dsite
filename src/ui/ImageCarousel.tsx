import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react'
import { useState } from 'react'
import type { HotspotImage } from '../data/hotspots'
import { SmartImage } from './SmartImage'

interface Props {
  images: HotspotImage[]
  title: string
  onOpen: (index: number) => void
  className?: string
}

const SWIPE = 60

/** Swipeable photo strip for a hotspot. Remount (via `key`) to reset per hotspot. */
export function ImageCarousel({ images, title, onOpen, className = '' }: Props) {
  const [[index, dir], setIndex] = useState<[number, number]>([0, 0])
  const many = images.length > 1
  const go = (d: number) => setIndex(([i]) => [(i + d + images.length) % images.length, d])
  const image = images[index]

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE || info.velocity.x < -400) go(1)
    else if (info.offset.x > SWIPE || info.velocity.x > 400) go(-1)
  }

  return (
    <figure className={`relative ${className}`}>
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={image.src}
            custom={dir}
            initial={{ x: dir >= 0 ? '100%' : '-100%', opacity: 0.4 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: dir >= 0 ? '-100%' : '100%', opacity: 0.4 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            drag={many ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={onDragEnd}
            className="absolute inset-0 touch-pan-y"
          >
            <button
              type="button"
              onClick={() => onOpen(index)}
              className="group block h-full w-full"
              aria-label={`Open photo ${index + 1} of ${images.length}: ${image.alt}`}
            >
              <SmartImage src={image.src} alt={image.alt} label={title} className="h-full w-full" />
              <span className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white opacity-80 backdrop-blur transition group-hover:opacity-100">
                <Expand size={14} aria-hidden />
              </span>
            </button>
          </motion.div>
        </AnimatePresence>

        {many && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
            >
              <ChevronLeft size={18} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
            >
              <ChevronRight size={18} aria-hidden />
            </button>
            <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1.5" role="tablist" aria-label="Photos">
              {images.map((img, i) => (
                <button
                  key={img.src}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Photo ${i + 1}`}
                  onClick={() => setIndex([i, i > index ? 1 : -1])}
                  className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {image.caption && <figcaption className="mt-2 text-xs text-white/55">{image.caption}</figcaption>}
    </figure>
  )
}
