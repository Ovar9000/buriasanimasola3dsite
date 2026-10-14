import { ASSETS } from '../config/assets'
import type { TimeOfDay, Vec3 } from '../lib/types'

export type HotspotCategory = 'beach' | 'rock' | 'cove' | 'landmark' | 'aerial'

export interface HotspotImage {
  src: string
  alt: string
  caption?: string
}

export interface HotspotView {
  /** Camera distance from the anchor. */
  distance: number
  /** Degrees down from straight overhead (0 = top-down, 90 = horizon). */
  polar: number
  /** Degrees around Y. 0 = from the south (+Z), 90 = from the east (+X), -90 = from the west. */
  azimuth: number
}

export interface Hotspot {
  id: string
  title: string
  /** Short label shown on the 3D marker and in waypoint lists. */
  label: string
  category: HotspotCategory
  /**
   * World-space anchor. X/Z place the marker; Y is used as-is unless `snap`
   * is true, in which case the marker is dropped onto the island surface.
   */
  anchor: Vec3
  snap?: boolean
  /** Name of an object in the island (e.g. the sign) to anchor to instead; `lift` is added above it. */
  attachTo?: string
  /** Height above the snapped surface. */
  lift?: number
  /** Never let a snapped marker sink below this height (e.g. over water). */
  minY?: number
  /** Camera look-at override; defaults to the (snapped) anchor. */
  target?: Vec3
  view: HotspotView
  summary: string
  description: string[]
  facts: { label: string; value: string }[]
  images: HotspotImage[]
  /** If set, the panel offers a one-tap switch to this lighting. */
  bestTime?: TimeOfDay
}

/** Ordered as the guided tour visits them (clockwise from the west). */
export const HOTSPOTS: Hotspot[] = [
  {
    id: 'west-front',
    title: 'West Front',
    label: 'West Front',
    category: 'beach',
    anchor: [-7.2, 1, 0],
    snap: true,
    lift: 1.4,
    view: { distance: 40, polar: 74, azimuth: -95 },
    summary: 'A narrow strip of pale sand beneath sheer, layered cliffs and old rockfall.',
    description: [
      'On its western side Animasola rises almost straight out of the reef: a wall of banded rock, its brow fringed with shrubs, with a thin ribbon of sand and pebbles at its foot.',
      'Blocks that have broken away over the years lie heaped below the cliff, and boats often nose in along the beach here, in water that turns from glassy turquoise to deep blue within a few strokes.',
    ],
    facts: [
      { label: 'Facing', value: 'West' },
      { label: 'Shore', value: 'Sand & pebbles' },
      { label: 'Look for', value: 'Rockfall below the cliff' },
    ],
    images: [
      { src: ASSETS.hotspots.westFront1, alt: 'The west front of Animasola Island with its layered cliff and narrow beach', caption: 'The western cliffs from the air' },
      { src: ASSETS.hotspots.westFront2, alt: 'Pale beach and rock below the west front of Animasola', caption: 'Beach and rockfall on the west front' },
    ],
  },
  {
    id: 'mermaids-lair',
    title: 'Mermaid’s Lair',
    label: 'Mermaid’s Lair',
    category: 'cove',
    anchor: [-3.2, 1, 21],
    snap: true,
    lift: 1.3,
    minY: 1.5,
    view: { distance: 34, polar: 24, azimuth: -150 },
    summary: 'A mosaic of flat, cracked rock slabs with clear turquoise pools between them.',
    description: [
      'From the island’s southern tip a trail of flat rock slabs runs out across the reef — some cracked into near-perfect tiles, others standing alone like stepping stones.',
      'Between them the water pools shallow and impossibly clear. Seen from above, the slabs and the glowing channels between them are the island’s most photographed pattern.',
    ],
    facts: [
      { label: 'Where', value: 'Southern slab trail' },
      { label: 'Best seen', value: 'From above, midday' },
      { label: 'Underfoot', value: 'Flat, cracked rock' },
    ],
    images: [
      { src: ASSETS.hotspots.mermaidsLairTop, alt: 'Top-down view of flat rock slabs and turquoise pools at Mermaid’s Lair', caption: 'Mermaid’s Lair from above' },
    ],
  },
  {
    id: 'classic-cliff',
    title: 'The Classic Cliff',
    label: 'Classic Cliff',
    category: 'rock',
    anchor: [5.6, 4.5, 8.9],
    snap: false,
    view: { distance: 32, polar: 80, azimuth: 30 },
    summary: 'The postcard angle — stacked bands of rock rising sheer from the beach.',
    description: [
      'Animasola’s cliffs are built of countless thin, horizontal layers, weathered into ledges, notches and overhangs so regular they look almost hand-laid.',
      'Stand back on the sand and the banded wall fills the frame, crowned with grass and shrubs; low sun picks out every layer in shades from honey to chocolate.',
    ],
    facts: [
      { label: 'Rock', value: 'Finely layered, wave-cut' },
      { label: 'Height', value: 'The island’s full face' },
      { label: 'Tip', value: 'Shoot from the water’s edge' },
    ],
    images: [
      { src: ASSETS.hotspots.classicCliffView, alt: 'The classic view of Animasola’s layered rock cliff', caption: 'The classic cliff view' },
    ],
  },
  {
    id: 'animasola-sign',
    title: 'The Animasola Sign',
    label: 'Island Sign',
    category: 'landmark',
    anchor: [10.6, 1, 0.5],
    snap: true,
    attachTo: 'animasola-sign',
    lift: 2.2,
    view: { distance: 26, polar: 84, azimuth: 92 },
    summary: 'White letters on the east-front beach — the classic sunset photo stop.',
    description: [
      '“Animasola” is usually traced to the Spanish ánima sola — the “lonely soul” — a fitting name for an islet standing on its own off the coast of Burias.',
      'The big white letters stand on the pebbly beach of the east front, right beneath the layered cliff. At golden hour the rock glows amber behind them while the sun sinks beyond the island.',
    ],
    facts: [
      { label: 'Name', value: 'From ánima sola, “lonely soul”' },
      { label: 'Best light', value: 'Late afternoon' },
      { label: 'Spot', value: 'East-front beach' },
    ],
    images: [
      { src: ASSETS.hotspots.animasolaSignSunset, alt: 'The ANIMASOLA letters on the beach below the layered cliff at sunset', caption: 'The island sign at golden hour' },
    ],
    bestTime: 'sunset',
  },
  {
    id: 'east-front',
    title: 'East Front',
    label: 'East Front',
    category: 'rock',
    anchor: [5, 12, -5],
    snap: true,
    lift: 1.4,
    target: [5, 3, -1],
    view: { distance: 52, polar: 76, azimuth: 76 },
    summary: 'The island’s broad eastern face — the side most visitors land on.',
    description: [
      'The east front is Animasola’s welcome mat: the widest stretch of beach, the sign, a little kiosk and shade, all tucked under the long banded cliff.',
      'From a boat offshore you take in the whole face in one sweep — the grassy plateau on top, the layered wall, and the reef shallows glowing in front.',
    ],
    facts: [
      { label: 'Facing', value: 'East' },
      { label: 'Shore', value: 'Widest beach' },
      { label: 'Seen from', value: 'The water' },
    ],
    images: [
      { src: ASSETS.hotspots.eastFrontWide, alt: 'Wide view of Animasola’s eastern front', caption: 'The east front, wide' },
    ],
  },
  {
    id: 'east-back-front',
    title: 'East Back Front',
    label: 'East Back',
    category: 'beach',
    anchor: [5.6, 1, -13.2],
    snap: true,
    lift: 1.4,
    minY: 1.5,
    view: { distance: 40, polar: 72, azimuth: 145 },
    summary: 'Round the northern corner — quieter sand, rock shelves and reef.',
    description: [
      'Follow the shore north from the east front and the beach narrows into pockets of sand between low rock shelves, with the cliff’s layers close enough to touch.',
      'Fewer visitors make it round here, so it is a good place to find an empty frame — or a patch of shade under the overhangs.',
    ],
    facts: [
      { label: 'Facing', value: 'North-east' },
      { label: 'Shore', value: 'Sand pockets, rock shelves' },
      { label: 'Vibe', value: 'Quiet, sheltered' },
    ],
    images: [
      { src: ASSETS.hotspots.eastBackFront1, alt: 'Rock shelves on the north-east shore of Animasola', caption: 'Rock shelves round the corner' },
      { src: ASSETS.hotspots.eastBackFront2, alt: 'Sand and rock on the north-eastern shore of Animasola', caption: 'A quiet sand pocket' },
    ],
  },
  {
    id: 'island-top-view',
    title: 'Bird’s-Eye View',
    label: 'Top View',
    category: 'aerial',
    anchor: [0, 12, -2],
    snap: false,
    target: [-1.5, 2, 9],
    view: { distance: 88, polar: 8, azimuth: 0 },
    summary: 'The whole island at once — grassy mesa, slab trail and reef in one frame.',
    description: [
      'From the air Animasola reveals its shape: a single flat-topped block of layered rock, its summit carpeted in grass, trailing a line of flat slabs out across the reef like a comet’s tail.',
      'The colour bands tell the story of the seabed — pale turquoise over sand, mottled green over coral, then deep blue where it drops away toward the channel.',
    ],
    facts: [
      { label: 'Where', value: 'San Pascual, Burias Is., Masbate' },
      { label: 'Region', value: 'Bicol, Philippines' },
      { label: 'Pair it with', value: 'Sombrero Island' },
    ],
    images: [
      { src: ASSETS.hotspots.islandTopView, alt: 'Aerial view of Animasola Island and its reef', caption: 'Animasola from above' },
    ],
  },
]

export const HOTSPOT_BY_ID: Record<string, Hotspot> = Object.fromEntries(HOTSPOTS.map((h) => [h.id, h]))

export const hotspotIndex = (id: string | null) => (id ? HOTSPOTS.findIndex((h) => h.id === id) : -1)
