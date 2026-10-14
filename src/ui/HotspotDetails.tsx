import { ChevronLeft, ChevronRight, Sun, Sunset, X } from 'lucide-react'
import { HOTSPOTS, type Hotspot } from '../data/hotspots'
import { useExplorerStore } from '../store/useExplorerStore'
import { categoryIcon } from './categoryIcon'
import { ImageCarousel } from './ImageCarousel'

const CATEGORY_LABEL: Record<Hotspot['category'], string> = {
  beach: 'Shoreline',
  rock: 'Rock formation',
  cove: 'Cove',
  landmark: 'Landmark',
  aerial: 'Aerial',
}

interface Props {
  hotspot: Hotspot
  index: number
  onClose: () => void
}

/** Shared content for the desktop side panel and the mobile bottom sheet. */
export function HotspotHeader({ hotspot, index, onClose }: Props) {
  const Icon = categoryIcon(hotspot.category)
  return (
    <header className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-lagoon-300">
          <Icon size={13} aria-hidden />
          <span>{CATEGORY_LABEL[hotspot.category]}</span>
          <span className="text-white/35">
            {String(index + 1).padStart(2, '0')} / {String(HOTSPOTS.length).padStart(2, '0')}
          </span>
        </div>
        <h2 className="font-display text-2xl leading-tight text-sand-50 sm:text-[1.75rem]">{hotspot.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-white/70">{hotspot.summary}</p>
      </div>
      <button type="button" onClick={onClose} className="icon-btn -mr-1.5 -mt-1 shrink-0 text-white/70" aria-label="Close and return to overview">
        <X size={20} aria-hidden />
      </button>
    </header>
  )
}

export function HotspotBody({ hotspot }: { hotspot: Hotspot }) {
  const openLightbox = useExplorerStore((s) => s.openLightbox)
  const timeOfDay = useExplorerStore((s) => s.timeOfDay)
  const setTimeOfDay = useExplorerStore((s) => s.setTimeOfDay)
  const next = useExplorerStore((s) => s.next)
  const prev = useExplorerStore((s) => s.prev)
  const stopTour = useExplorerStore((s) => s.stopTour)

  const suggest = hotspot.bestTime && hotspot.bestTime !== timeOfDay ? hotspot.bestTime : null

  return (
    <div className="space-y-5">
      <ImageCarousel key={hotspot.id} images={hotspot.images} title={hotspot.title} onOpen={(i) => openLightbox(hotspot.id, i)} />

      {suggest && (
        <button
          type="button"
          onClick={() => setTimeOfDay(suggest)}
          className="flex w-full items-center gap-3 rounded-2xl border border-ember-300/30 bg-gradient-to-r from-ember-400/20 to-transparent px-4 py-3 text-left text-sm transition hover:from-ember-400/30"
        >
          {suggest === 'sunset' ? <Sunset size={18} className="text-ember-300" aria-hidden /> : <Sun size={18} className="text-ember-300" aria-hidden />}
          <span>
            <span className="font-medium text-white">Best seen at {suggest}</span>
            <span className="block text-white/60">Switch the island’s lighting</span>
          </span>
        </button>
      )}

      <div className="space-y-3 text-[15px] leading-relaxed text-white/80">
        {hotspot.description.map((p) => (
          <p key={p.slice(0, 24)}>{p}</p>
        ))}
      </div>

      <dl className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
        {hotspot.facts.map((f) => (
          <div key={f.label} className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2.5">
            <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/45">{f.label}</dt>
            <dd className="mt-0.5 text-sm text-sand-100">{f.value}</dd>
          </div>
        ))}
      </dl>

      <nav className="flex gap-2 pt-1" aria-label="Waypoints">
        <button
          type="button"
          onClick={() => {
            stopTour()
            prev()
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/12 px-4 py-2.5 text-sm text-white/85 transition hover:bg-white/10"
        >
          <ChevronLeft size={16} aria-hidden /> Previous
        </button>
        <button
          type="button"
          onClick={() => {
            stopTour()
            next()
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-sand-50 px-4 py-2.5 text-sm font-medium text-deep-900 transition hover:bg-white"
        >
          Next stop <ChevronRight size={16} aria-hidden />
        </button>
      </nav>
    </div>
  )
}
