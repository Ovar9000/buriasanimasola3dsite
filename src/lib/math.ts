import { Spherical, Vector3 } from 'three'
import type { HotspotView } from '../data/hotspots'
import type { Vec3 } from './types'

const DEG = Math.PI / 180

/** Camera position for a view orbiting `target` (see HotspotView for conventions). */
export function viewToPosition(target: Vec3, view: HotspotView, out = new Vector3()): Vector3 {
  const s = new Spherical(view.distance, Math.max(0.001, view.polar * DEG), view.azimuth * DEG)
  return out.setFromSpherical(s).add(new Vector3(...target))
}

/** Deterministic PRNG so the procedural island looks the same on every load. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
