/**
 * Procedural stand-in for `public/models/animasola-island.glb`, modelled on
 * reference photos of Animasola:
 *  - one flat-topped mesa, elongated north–south, with sheer cliffs of
 *    horizontally banded brown rock and a grassy summit (with a bare patch);
 *  - a narrow pale sand / pebble beach around the base, widest on the east
 *    front where the ANIMASOLA letters stand;
 *  - a tail of flat, cracked rock slabs running from the southern tip out
 *    across the reef flat.
 * Layout matches the hotspot anchors in `src/data/hotspots.ts`.
 */
import { BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, PlaneGeometry, Vector3 } from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js'
import { mulberry32, smoothstep } from '../lib/math'

const SEED = 1771
const simplex = new SimplexNoise({ random: mulberry32(SEED) })

const fbm2 = (x: number, z: number, octaves = 4) => {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += simplex.noise(x * freq, z * freq) * amp
    norm += amp
    amp *= 0.5
    freq *= 2.03
  }
  return sum / norm
}

// ---------------------------------------------------------------------------
// Footprint
// ---------------------------------------------------------------------------

/** Mesa half-extents (x = east–west, z = north–south), squareness and summit height. */
const MESA = { a: 9, b: 15, n: 2.6, height: 11 }

/** Polar radius of the mesa outline at angle φ (= atan2(z, x)). */
export function mesaRadius(phi: number) {
  const c = Math.abs(Math.cos(phi)) / MESA.a
  const s = Math.abs(Math.sin(phi)) / MESA.b
  const r = Math.pow(Math.pow(c, MESA.n) + Math.pow(s, MESA.n), -1 / MESA.n)
  // irregular bays and headlands
  const lobes = fbm2(Math.cos(phi) * 1.3 + 4, Math.sin(phi) * 1.3 - 2, 3) * 0.1
  return r * (1 + lobes)
}

/** Normalised distance from the mesa centre: 1 = cliff foot. */
export function mesaRho(x: number, z: number) {
  return Math.hypot(x, z) / mesaRadius(Math.atan2(z, x))
}

/** The slab tail: a polyline running south-south-west from the southern tip. */
export const TAIL: [number, number][] = [
  [-0.5, 13.5],
  [-3, 22],
  [-6.5, 30],
  [-10, 38],
]

const TAIL_LENGTH = TAIL.slice(1).reduce((acc, [x, z], i) => acc + Math.hypot(x - TAIL[i][0], z - TAIL[i][1]), 0)

/** Distance to the tail polyline and how far along it (0..1) the closest point lies. */
export function tailDistance(x: number, z: number) {
  let best = Infinity
  let along = 0
  let acc = 0
  for (let i = 0; i < TAIL.length - 1; i++) {
    const [ax, az] = TAIL[i]
    const [bx, bz] = TAIL[i + 1]
    const dx = bx - ax
    const dz = bz - az
    const len2 = dx * dx + dz * dz
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2))
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t))
    const len = Math.sqrt(len2)
    if (d < best) {
      best = d
      along = (acc + t * len) / TAIL_LENGTH
    }
    acc += len
  }
  return { d: best, along }
}

// ---------------------------------------------------------------------------
// Beach / seabed terrain
// ---------------------------------------------------------------------------

/** Terrain height (sea level = 0). Exported for prop placement. */
export function terrainHeight(x: number, z: number) {
  const phi = Math.atan2(z, x)
  const rho = mesaRho(x, z)
  // beach is widest on the east front, narrow on the west
  const east = Math.max(0, Math.cos(phi))
  const edge = 1.16 + 0.2 * east * east + fbm2(x * 0.15, z * 0.15, 2) * 0.05
  let h = 0.55 - 1.6 * smoothstep(edge - 0.05, edge + 0.12, rho)
  // reef flat, then the drop-off
  h -= 2.5 * smoothstep(edge + 0.1, 2.6, rho)
  // sand spit leading into the slab tail
  const tail = tailDistance(x, z)
  const spit = (1 - smoothstep(1.2, 3.4, tail.d)) * (1 - smoothstep(0.12, 0.38, tail.along))
  h = Math.max(h, 0.4 * spit - 0.4 * (1 - spit))
  h += fbm2(x * 0.4, z * 0.4, 2) * 0.08
  return h
}

const SAND = new Color('#d6ccb6')
const PEBBLE = new Color('#b9ab92')
const SAND_WET = new Color('#9f8f74')
const SEABED = new Color('#8fb3a6')

function buildTerrain() {
  const size = 110
  const segs = 260
  const geo = new PlaneGeometry(size, size, segs, segs)
  geo.rotateX(-Math.PI / 2)
  geo.translate(-2, 0, 8)
  geo.deleteAttribute('uv')
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const c = new Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const h = terrainHeight(x, z)
    pos.setY(i, h)
    if (h < -0.1) c.copy(SEABED).lerp(SAND_WET, smoothstep(-1.5, -0.1, h))
    else c.copy(SAND_WET).lerp(SAND, smoothstep(-0.1, 0.3, h))
    // pebbly patches
    c.lerp(PEBBLE, smoothstep(0.1, 0.6, fbm2(x * 0.5, z * 0.5, 3)) * 0.7)
    c.offsetHSL(0, 0, (simplex.noise(x * 3.1, z * 3.1) * 0.5 + 0.5) * 0.05 - 0.025)
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return geo
}

// ---------------------------------------------------------------------------
// The mesa: banded cliff wall + grassy summit, as one wrapped grid
// ---------------------------------------------------------------------------

const ROCK_DARK = new Color('#5c4a3a')
const ROCK_MID = new Color('#80694f')
const ROCK_LIGHT = new Color('#a68b6b')
const ROCK_WET = new Color('#3a312a')
const SHRUB = new Color('#3e5a25')
const LEAF = new Color('#5f7f2e')
const GRASS = new Color('#a3ae4c')
const GRASS_DRY = new Color('#b9b062')
const BARE = new Color('#9a7655')

/** Strata thickness. */
const LAYER = 0.62
/** Summit inset from the cliff line (the rounded brow). */
const BROW = 0.09

/** Summit height above sea level (gently tilted down toward the south). */
const summitHeight = (x: number, z: number) => MESA.height - 0.055 * z + fbm2(x * 0.08, z * 0.08, 2) * 0.6

function buildMesa() {
  const N = 384 // around
  const M = 96 // up the wall
  const K = 28 // across the summit
  const base = -2
  const rows = M + K + 1
  const positions = new Float32Array(N * rows * 3)
  const colors = new Float32Array(N * rows * 3)
  const c = new Color()

  for (let i = 0; i < N; i++) {
    const phi = (i / N) * Math.PI * 2
    const r0 = mesaRadius(phi)
    const cx = Math.cos(phi)
    const sz = Math.sin(phi)
    const top = summitHeight(cx * r0, sz * r0)
    const layerJitter = fbm2(phi * 2.2, 7.7, 2) * 0.6

    for (let j = 0; j <= M + K; j++) {
      let x: number
      let y: number
      let z: number
      if (j <= M) {
        // --- cliff wall
        y = base + ((top - base) * j) / M
        const layer = y / LAYER + layerJitter
        const idx = Math.floor(layer)
        const f = layer - idx
        // each band juts out a different amount, with notches between bands
        let m = 1 + simplex.noise(idx * 3.7, phi * 1.6) * 0.022 - 0.016 * smoothstep(0.7, 0.98, f)
        // vertical erosion runnels
        m += fbm2(phi * 14, y * 0.18, 3) * 0.035
        // wave-cut undercut at the waterline
        m -= 0.045 * (1 - smoothstep(0.1, 1.6, y)) * smoothstep(-1.2, 0.1, y)
        // rounded, vegetated brow
        m -= BROW * Math.pow(smoothstep(top - 1.6, top, y), 2)
        x = cx * r0 * m
        z = sz * r0 * m
        // colour: banded rock, wet foot, plants clinging to ledges and the brow
        const band = simplex.noise(idx * 1.71, phi * 0.6) * 0.5 + 0.5
        c.copy(ROCK_DARK).lerp(ROCK_MID, band)
        c.lerp(ROCK_LIGHT, smoothstep(0.55, 0.95, band) * 0.55)
        c.lerp(ROCK_DARK, smoothstep(0.75, 1, f) * 0.45)
        c.offsetHSL(0, 0, simplex.noise(phi * 60, y * 1.5) * 0.025)
        c.lerp(ROCK_WET, 1 - smoothstep(0.3, 1.4, y))
        const ledgeVeg = smoothstep(0.35, 0.7, fbm2(phi * 9 + 3, y * 0.25, 3)) * smoothstep(2.5, 6, y)
        c.lerp(LEAF, ledgeVeg * 0.8)
        c.lerp(SHRUB, smoothstep(top - 2.2, top - 0.6, y) * (0.6 + 0.4 * smoothstep(-0.2, 0.3, fbm2(phi * 20, 1, 2))))
      } else {
        // --- grassy summit: rings shrinking to the centre
        const s = 1 - (j - M) / K
        const rr = r0 * (1 - BROW) * s
        x = cx * rr
        z = sz * rr
        y = summitHeight(x, z) + 0.9 * (1 - s * s) + fbm2(x * 0.35, z * 0.35, 2) * 0.12
        const bare = smoothstep(0.15, 0.55, 1 - Math.hypot(x - 2.5, z + 4) / 4.5 + fbm2(x * 0.4, z * 0.4, 2) * 0.35)
        c.copy(GRASS).lerp(GRASS_DRY, smoothstep(-0.2, 0.6, fbm2(x * 0.2 + 9, z * 0.2, 3)))
        c.lerp(SHRUB, smoothstep(0.82, 1, s) * 0.85)
        c.lerp(BARE, bare * 0.9)
      }
      const v = (j * N + i) * 3
      positions[v] = x
      positions[v + 1] = y
      positions[v + 2] = z
      colors.set([c.r, c.g, c.b], v)
    }
  }

  const index: number[] = []
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * N + i
      const b = j * N + ((i + 1) % N)
      const d = (j + 1) * N + i
      const e = (j + 1) * N + ((i + 1) % N)
      index.push(a, d, b, b, d, e)
    }
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

// ---------------------------------------------------------------------------
// Flat rock slabs (the tail) + rubble at the cliff foot
// ---------------------------------------------------------------------------

const SLAB_COLORS = ['#7b5f47', '#8a6c52', '#6d5644', '#94785b'].map((h) => new Color(h))
const RUBBLE = new Color('#6f5a47')

function slab(x: number, z: number, length: number, width: number, height: number, yaw: number, rand: () => number) {
  const g = new CylinderGeometry(1, 1, 1, 10, 1)
  g.deleteAttribute('uv')
  const pos = g.attributes.position
  const jitter = Array.from({ length: 10 }, () => 0.78 + rand() * 0.3)
  const tiltX = (rand() - 0.5) * 0.08
  const tiltZ = (rand() - 0.5) * 0.08
  const v = new Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    if (Math.hypot(v.x, v.z) > 0.01) {
      const a = (Math.atan2(v.z, v.x) / (Math.PI * 2) + 1) % 1
      const k = jitter[Math.round(a * 10) % 10]
      v.x *= k
      v.z *= k
    }
    v.x *= length / 2
    v.z *= width / 2
    v.y = (v.y + 0.5) * height + v.x * tiltX + v.z * tiltZ
    const rx = v.x * Math.cos(yaw) - v.z * Math.sin(yaw)
    const rz = v.x * Math.sin(yaw) + v.z * Math.cos(yaw)
    pos.setXYZ(i, x + rx, v.y - height * 0.55, z + rz)
  }
  g.computeVertexNormals()
  const col = SLAB_COLORS[Math.floor(rand() * SLAB_COLORS.length)]
  const nrm = g.attributes.normal
  const colors = new Float32Array(pos.count * 3)
  const cc = new Color()
  for (let i = 0; i < pos.count; i++) {
    cc.copy(col).offsetHSL(0, 0, nrm.getY(i) > 0.7 ? 0.06 : -0.06)
    colors.set([cc.r, cc.g, cc.b], i * 3)
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return g
}

function boulder(x: number, z: number, r: number, rand: () => number) {
  let g: BufferGeometry = new IcosahedronGeometry(r, 2)
  g.deleteAttribute('uv')
  g.deleteAttribute('normal')
  g = mergeVertices(g)
  const pos = g.attributes.position
  const v = new Vector3()
  const seed = rand() * 100
  const y0 = terrainHeight(x, z)
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const k = 1 + simplex.noise3d(v.x * 1.4 + seed, v.y * 1.4, v.z * 1.4) * 0.22
    pos.setXYZ(i, x + v.x * k, y0 + v.y * k * 0.75, z + v.z * k)
  }
  g.computeVertexNormals()
  const cc = RUBBLE.clone().offsetHSL(0, 0, (rand() - 0.5) * 0.08)
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) colors.set([cc.r, cc.g, cc.b], i * 3)
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return g
}

function buildRocks() {
  const rand = mulberry32(SEED + 7)
  const parts: BufferGeometry[] = []

  // Tail of slabs: big near the island, smaller and sparser out on the reef.
  for (let i = 0; i < 46; i++) {
    const t = Math.pow(i / 45, 0.9)
    const seg = Math.min(TAIL.length - 2, Math.floor(t * (TAIL.length - 1)))
    const lt = t * (TAIL.length - 1) - seg
    const [ax, az] = TAIL[seg]
    const [bx, bz] = TAIL[seg + 1]
    const dirx = bx - ax
    const dirz = bz - az
    const len = Math.hypot(dirx, dirz)
    const off = (rand() - 0.5) * 2 * (1.6 + t * 3)
    const x = ax + dirx * lt - (dirz / len) * off
    const z = az + dirz * lt + (dirx / len) * off
    const size = (1 - t * 0.55) * (1.6 + rand() * 2.4)
    if (t < 0.12 && rand() < 0.5) continue // keep the spit sandy
    const yaw = Math.atan2(dirz, dirx) + (rand() - 0.5) * 1.2
    parts.push(slab(x, z, size * (1.2 + rand() * 0.6), size * (0.7 + rand() * 0.4), 0.55 + rand() * 0.7, yaw, rand))
  }

  // Cracked tile field off the south-east beach.
  for (let gx = 0; gx < 5; gx++) {
    for (let gz = 0; gz < 4; gz++) {
      if (rand() < 0.2) continue
      const x = 4.5 + gx * 1.25 + (rand() - 0.5) * 0.3
      const z = 13 + gz * 1.1 + (rand() - 0.5) * 0.3
      parts.push(slab(x, z, 1.05 + rand() * 0.3, 0.9 + rand() * 0.3, 0.5 + rand() * 0.3, 0.35 + (rand() - 0.5) * 0.2, rand))
    }
  }

  // Scattered slabs on the reef flat.
  const scatter: [number, number][] = [
    [-13.5, -8], [-14.5, -2], [-13, 6], [-11.5, 11], [-8, -15], [-3, -18.5], [4, -18], [12.5, -9], [13.5, 12], [9, 17],
  ]
  for (const [x, z] of scatter) {
    parts.push(slab(x + (rand() - 0.5) * 2, z + (rand() - 0.5) * 2, 1.5 + rand() * 2, 1 + rand() * 1.2, 0.5 + rand() * 0.5, rand() * Math.PI, rand))
  }

  // Rubble and fallen blocks at the cliff foot, heaviest on the west face.
  for (let i = 0; i < 70; i++) {
    const phi = rand() * Math.PI * 2
    if (Math.cos(phi) > 0.3 && rand() < 0.6) continue
    const r = mesaRadius(phi) * (1.02 + rand() * 0.12)
    parts.push(boulder(Math.cos(phi) * r, Math.sin(phi) * r, 0.35 + rand() * 0.9, rand))
  }

  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g))
  const merged = mergeGeometries(flat, false)
  new Set([...parts, ...flat]).forEach((g) => g.dispose())
  if (!merged) throw new Error('Failed to merge rock geometry')
  return merged
}

// ---------------------------------------------------------------------------
// East-front props: the ANIMASOLA letters, a kiosk and a red canopy
// ---------------------------------------------------------------------------

export const SIGN_POSITION = { x: 11.4, z: 0.5 }

function coloured(g: BufferGeometry, hex: string) {
  g.deleteAttribute('uv')
  const n = g.index ? g.toNonIndexed() : g
  const c = new Color(hex)
  const colors = new Float32Array(n.attributes.position.count * 3)
  for (let i = 0; i < n.attributes.position.count; i++) colors.set([c.r, c.g, c.b], i * 3)
  n.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return n
}

function buildProps() {
  const parts: BufferGeometry[] = []
  // Nine white block letters facing east (+X).
  const { x: sx, z: sz } = SIGN_POSITION
  const y0 = terrainHeight(sx, sz)
  const widths = [0.5, 0.5, 0.2, 0.62, 0.5, 0.42, 0.5, 0.36, 0.5] // A N I M A S O L A
  const total = widths.reduce((a, w) => a + w + 0.1, -0.1)
  let cursor = -total / 2
  for (const w of widths) {
    parts.push(coloured(new BoxGeometry(0.16, 0.85, w).translate(sx, y0 + 0.42, sz + cursor + w / 2), '#f4f1ea'))
    cursor += w + 0.1
  }
  // Small white kiosk.
  const [kx, kz] = [11.6, 4]
  parts.push(coloured(new BoxGeometry(0.8, 1.4, 0.8).translate(kx, terrainHeight(kx, kz) + 0.7, kz), '#e9e6df'))
  // Red canopy on four poles.
  const [tx, tz] = [11.2, 7]
  const ty = terrainHeight(tx, tz)
  for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
    parts.push(coloured(new CylinderGeometry(0.04, 0.04, 1.5, 5).translate(tx + dx, ty + 0.75, tz + dz), '#d7d3cc'))
  }
  parts.push(coloured(new ConeGeometry(1.25, 0.55, 4).rotateY(Math.PI / 4).translate(tx, ty + 1.75, tz), '#d83a2c'))
  const merged = mergeGeometries(parts, false)!
  parts.forEach((g) => g.dispose())
  merged.computeVertexNormals()
  return merged
}

export interface ProceduralIslandGeometry {
  terrain: BufferGeometry
  mesa: BufferGeometry
  rocks: BufferGeometry
  props: BufferGeometry
}

let cache: ProceduralIslandGeometry | null = null

export function getProceduralIsland(): ProceduralIslandGeometry {
  if (!cache) cache = { terrain: buildTerrain(), mesa: buildMesa(), rocks: buildRocks(), props: buildProps() }
  return cache
}
