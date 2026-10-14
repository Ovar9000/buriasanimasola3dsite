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
  /** Fill light from the camera side, so faces turned away from the sun keep their detail. */
  fillColor: string
  fillIntensity: number
  /** Sky dome gradient. */
  zenith: string
  /** Horizon colour facing away from the sun. */
  horizon: string
  /** Horizon colour beneath the sun. */
  horizonSun: string
  /** Sun disc + halo colour in the sky dome. */
  sunGlow: string
  glowStrength: number
  /** Lit and shaded sides of the clouds. */
  cloudLit: string
  cloudShade: string
  /** 0 = clear, 1 = overcast. */
  cloudCover: number
  fog: string
  /** Deep-water colour. */
  water: string
  /** Light scattered through sunlit wave flanks. */
  scatter: string
  /** Tint multiplied over the reef-flat texture. */
  shallows: string
  /** Turquoise light scattered up out of the shallows, independent of the sun angle. */
  lagoonGlow: number
  /** Strength of the screen-space ambient occlusion. */
  ao: number
  envIntensity: number
  exposure: number
  bloom: number
}

export const PRESETS: Record<'day' | 'sunset', Preset> = {
  day: {
    sunElevation: 52,
    sunAzimuth: 35,
    sunColor: '#fff0d8',
    sunIntensity: 2.7,
    hemiSky: '#b9d9ff',
    hemiGround: '#8fb2a8',
    hemiIntensity: 0.9,
    fillColor: '#d6e6ff',
    fillIntensity: 0.35,
    zenith: '#1561c9',
    horizon: '#9ccdee',
    horizonSun: '#d4ecfb',
    sunGlow: '#fff3d6',
    glowStrength: 0.45,
    cloudLit: '#ffffff',
    cloudShade: '#a3b6cc',
    cloudCover: 0.5,
    fog: '#a2cdec',
    water: '#06345a',
    scatter: '#1aa6a0',
    shallows: '#ffffff',
    lagoonGlow: 0.1,
    ao: 2.2,
    envIntensity: 0.9,
    exposure: 1,
    bloom: 0.35,
  },
  sunset: {
    sunElevation: 13,
    sunAzimuth: -62,
    sunColor: '#ffbf85',
    sunIntensity: 2.8,
    hemiSky: '#ff9e6d',
    hemiGround: '#2a3b4c',
    hemiIntensity: 1.2,
    fillColor: '#ffc29a',
    fillIntensity: 0.6,
    zenith: '#8a6f86',
    horizon: '#e9b898',
    horizonSun: '#ffc58c',
    sunGlow: '#ffd29a',
    glowStrength: 0.7,
    cloudLit: '#ffc89e',
    cloudShade: '#a07887',
    cloudCover: 0.42,
    fog: '#e6b497',
    water: '#0e3a52',
    scatter: '#2f8c86',
    shallows: '#f2ddc9',
    lagoonGlow: 0.3,
    ao: 1.6,
    envIntensity: 0.85,
    exposure: 1.0,
    bloom: 0.6,
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
  fillColor: new Color(),
  fillIntensity: 0,
  zenith: new Color(),
  horizon: new Color(),
  horizonSun: new Color(),
  sunGlow: new Color(),
  glowStrength: 0,
  cloudLit: new Color(),
  cloudShade: new Color(),
  cloudCover: 0,
  fog: new Color(),
  water: new Color(),
  scatter: new Color(),
  shallows: new Color(),
  lagoonGlow: 0,
  ao: 0,
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
  mixColor(sampled.scatter, a.scatter, b.scatter, t)
  mixColor(sampled.cloudLit, a.cloudLit, b.cloudLit, t)
  mixColor(sampled.cloudShade, a.cloudShade, b.cloudShade, t)
  sampled.cloudCover = lerp(a.cloudCover, b.cloudCover)
  sampled.ao = lerp(a.ao, b.ao)
  mixColor(sampled.fillColor, a.fillColor, b.fillColor, t)
  sampled.fillIntensity = lerp(a.fillIntensity, b.fillIntensity)
  sampled.lagoonGlow = lerp(a.lagoonGlow, b.lagoonGlow)
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
