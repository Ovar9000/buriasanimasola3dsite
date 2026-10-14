import { Color, MathUtils, Vector3 } from 'three'

/**
 * Lighting presets for the Time-of-Day toggle. `atmosphere.blend` (0 = day,
 * 1 = sunset) is tweened by GSAP and every lighting component samples it
 * per-frame, so the whole scene cross-fades instead of popping.
 */
interface Preset {
  /** Degrees above the horizon. */
  sunElevation: number
  /** Degrees around Y, 0 = south (+Z), 90 = east (+X), -90 = west. */
  sunAzimuth: number
  sunColor: string
  sunIntensity: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  /** Sky dome gradient. */
  zenith: string
  /** Horizon colour facing away from the sun. */
  horizon: string
  /** Horizon colour beneath the sun. */
  horizonSun: string
  /** Sun disc + halo colour in the sky dome. */
  sunGlow: string
  glowStrength: number
  fog: string
  water: string
  /** Tint multiplied over the reef-flat texture. */
  shallows: string
  envIntensity: number
  exposure: number
  bloom: number
}

export const PRESETS: Record<'day' | 'sunset', Preset> = {
  day: {
    sunElevation: 55,
    sunAzimuth: 35,
    sunColor: '#fff4e3',
    sunIntensity: 2.1,
    hemiSky: '#cfe6ff',
    hemiGround: '#cdb995',
    hemiIntensity: 0.85,
    zenith: '#2a74c6',
    horizon: '#a9d4ea',
    horizonSun: '#d9eefa',
    sunGlow: '#fff3d6',
    glowStrength: 0.35,
    fog: '#a9d1e6',
    water: '#0a5466',
    shallows: '#ffffff',
    envIntensity: 0.85,
    exposure: 1,
    bloom: 0.3,
  },
  sunset: {
    sunElevation: 4,
    sunAzimuth: -68,
    sunColor: '#ff9548',
    sunIntensity: 2.2,
    hemiSky: '#e6a28c',
    hemiGround: '#3a2a3c',
    hemiIntensity: 0.6,
    zenith: '#22305e',
    horizon: '#b98aa2',
    horizonSun: '#ffa057',
    sunGlow: '#ffc27a',
    glowStrength: 1.1,
    fog: '#c1909a',
    water: '#13304a',
    shallows: '#a28e9e',
    envIntensity: 0.55,
    exposure: 1,
    bloom: 0.75,
  },
}

export const atmosphere = { blend: 0 }

/** Interpolated preset values, refreshed by `sampleAtmosphere()`. */
export const sampled = {
  sunDirection: new Vector3(),
  sunColor: new Color(),
  sunIntensity: 0,
  hemiSky: new Color(),
  hemiGround: new Color(),
  hemiIntensity: 0,
  zenith: new Color(),
  horizon: new Color(),
  horizonSun: new Color(),
  sunGlow: new Color(),
  glowStrength: 0,
  fog: new Color(),
  water: new Color(),
  shallows: new Color(),
  envIntensity: 1,
  exposure: 1,
  bloom: 0,
}

const ca = new Color()
const cb = new Color()
const mixColor = (out: Color, a: string, b: string, t: number) => out.copy(ca.set(a)).lerp(cb.set(b), t)

let lastBlend = Number.NaN

export function sampleAtmosphere() {
  const t = atmosphere.blend
  if (t === lastBlend) return sampled
  lastBlend = t
  const a = PRESETS.day
  const b = PRESETS.sunset
  const lerp = (x: number, y: number) => MathUtils.lerp(x, y, t)

  const elev = MathUtils.degToRad(lerp(a.sunElevation, b.sunElevation))
  const azim = MathUtils.degToRad(lerp(a.sunAzimuth, b.sunAzimuth))
  sampled.sunDirection.set(Math.cos(elev) * Math.sin(azim), Math.sin(elev), Math.cos(elev) * Math.cos(azim)).normalize()

  mixColor(sampled.sunColor, a.sunColor, b.sunColor, t)
  mixColor(sampled.hemiSky, a.hemiSky, b.hemiSky, t)
  mixColor(sampled.hemiGround, a.hemiGround, b.hemiGround, t)
  mixColor(sampled.fog, a.fog, b.fog, t)
  mixColor(sampled.water, a.water, b.water, t)
  mixColor(sampled.shallows, a.shallows, b.shallows, t)
  sampled.sunIntensity = lerp(a.sunIntensity, b.sunIntensity)
  sampled.hemiIntensity = lerp(a.hemiIntensity, b.hemiIntensity)
  mixColor(sampled.zenith, a.zenith, b.zenith, t)
  mixColor(sampled.horizon, a.horizon, b.horizon, t)
  mixColor(sampled.horizonSun, a.horizonSun, b.horizonSun, t)
  mixColor(sampled.sunGlow, a.sunGlow, b.sunGlow, t)
  sampled.glowStrength = lerp(a.glowStrength, b.glowStrength)
  sampled.envIntensity = lerp(a.envIntensity, b.envIntensity)
  sampled.exposure = lerp(a.exposure, b.exposure)
  sampled.bloom = lerp(a.bloom, b.bloom)
  return sampled
}

sampleAtmosphere()
