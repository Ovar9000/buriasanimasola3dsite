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
  fogDensity: number
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
    sunAzimuth: 38,
    sunColor: '#fff1dc',
    sunIntensity: 2.65,
    hemiSky: '#b8dcff',
    hemiGround: '#82aba2',
    hemiIntensity: 0.9,
    fillColor: '#cce2ff',
    fillIntensity: 0.28,
    zenith: '#0d56b8',
    horizon: '#8fc9eb',
    horizonSun: '#cfeafa',
    sunGlow: '#fff4d8',
    glowStrength: 0.58,
    cloudLit: '#ffffff',
    cloudShade: '#849eb8',
    cloudCover: 0.46,
    fog: '#98c9eb',
    fogDensity: 0.00105,
    water: '#06426e',
    scatter: '#16c7ba',
    shallows: '#ffffff',
    lagoonGlow: 0.24,
    ao: 1.0,
    envIntensity: 0.92,
    exposure: 1.0,
    bloom: 0.22,
  },
  sunset: {
    sunElevation: 4.5,
    sunAzimuth: -104,
    sunColor: '#ffa858',
    sunIntensity: 4.15,
    hemiSky: '#c97e6a',
    hemiGround: '#1b2b3d',
    hemiIntensity: 0.82,
    fillColor: '#7a98c8',
    fillIntensity: 0.30,
    zenith: '#183468',
    horizon: '#db8b69',
    horizonSun: '#ffb05e',
    sunGlow: '#ffd584',
    glowStrength: 1.25,
    cloudLit: '#ffbe7e',
    cloudShade: '#574868',
    cloudCover: 0.52,
    fog: '#df916c',
    fogDensity: 0.00135,
    water: '#092a42',
    scatter: '#247f78',
    shallows: '#eed2b8',
    lagoonGlow: 0.28,
    ao: 0.9,
    envIntensity: 0.86,
    exposure: 1.03,
    bloom: 0.36,
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
  fogDensity: 0,
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
  sampled.fogDensity = lerp(a.fogDensity, b.fogDensity)
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
