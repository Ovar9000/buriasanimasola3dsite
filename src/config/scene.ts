import type { Vec3 } from '../lib/types'

/**
 * World conventions
 *  - 1 unit ≈ 1 metre-ish, island normalised to roughly ISLAND.targetSize across.
 *  - Sea level is y = 0.  +X = east, -X = west, -Z = north, +Z = south.
 */
export const ISLAND = {
  /** Largest horizontal extent the GLB is scaled to (world units). */
  targetSize: 32,
  /**
   * Extra rotation applied to the GLB (radians) so it runs north–south with its
   * terraced end toward the southern slab tail and the sign beach facing +X.
   */
  rotationY: Math.PI / 2,
  /**
   * Where the GLB's water line sits, as a fraction of its height from the bottom
   * (0 = model base sits on the sea, 0.08 = bottom 8% is submerged).
   */
  submergedFraction: 0.04,
  /**
   * Also surround the GLB with the procedural beach, slab tail and kiosk /
   * canopy props. Off by default: the model is shown on its own, with only the
   * reef shallows and the ANIMASOLA sign added around it.
   */
  dressing: false,
  /** World height splitting the detail shader's grass (above) from sand (below). */
  grassLine: 2.5,
  /** Multiplied into the model's albedo to warm up the rock (white = as exported). */
  tint: '#ffe0c0',
} as const

export const OCEAN = {
  size: 6000,
  dayColor: '#0b5568',
  sunsetColor: '#163a52',
}

/** Default "home" framing of the whole island. */
export const OVERVIEW_VIEW = {
  target: [-1, 3, 6] as Vec3,
  distance: 60,
  /** Degrees down from straight overhead. */
  polar: 75,
  /** Degrees around Y, 0 = looking from the south (+Z), negative = from the west. */
  azimuth: -38,
  /** At sunset the overview swings round so the low sun rakes across the cliffs from behind the viewer's right. */
  sunsetAzimuth: -118,
}

/** Where the camera starts before the intro fly-in. */
export const INTRO_START: { position: Vec3; target: Vec3 } = {
  position: [-210, 95, 260],
  target: [0, 0, 0],
}

export const CONTROLS = {
  minDistance: 9,
  maxDistance: 190,
  /** Keep the camera above the waves. */
  maxPolarAngle: Math.PI * 0.47,
  /** Seconds of inactivity before the idle auto-orbit kicks in. */
  idleAutoRotateAfter: 14,
}

export const TOUR = {
  /** Seconds to linger on each waypoint once the camera has arrived. */
  dwell: 7,
}
