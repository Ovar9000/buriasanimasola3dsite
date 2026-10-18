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

// ---------------------------------------------------------------------------
// Island outline: where the cliff meets the sea. Defaults to the procedural
// mesa; replaced by the real model's measured waterline when a GLB loads, so
// the beach, reef and sign wrap whichever island is shown.
// ---------------------------------------------------------------------------

let outline: Float32Array | null = null
let beach = true

/**
 * Use a measured waterline (radius per equal angle step from -π) or `null`
 * for the procedural mesa. `withBeach` says whether the procedural beach /
 * reef-flat terrain is shown around it (it shapes the seabed depth).
 */
export function setIslandOutline(samples: Float32Array | null, withBeach = true) {
  outline = samples
  beach = withBeach
  dressing = null
  full = null
}

/** Whether the procedural beach terrain surrounds the current island. */
export const islandHasBeach = () => beach

/** Waterline radius of the current island at angle φ (= atan2(z, x)). */
export function outlineRadius(phi: number) {
  if (!outline) return mesaRadius(phi)
  const n = outline.length
  const f = (((phi + Math.PI) / (Math.PI * 2)) * n + n) % n
  const i = Math.floor(f)
  const t = f - i
  return outline[i] * (1 - t) + outline[(i + 1) % n] * t
}

/** Horizontal distance outside the current island's waterline (negative = inside). */
export function shoreDistance(x: number, z: number) {
  return Math.hypot(x, z) - outlineRadius(Math.atan2(z, x))
}

/** A point `offset` units out from the east shore at a given Z (marches outward from the centre line). */
export function eastShorePoint(z: number, offset: number): [number, number] {
  let x = 0
  while (x < 60 && shoreDistance(x, z) < 0) x += 0.1
  return [x + offset, z]
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
  const dist = shoreDistance(x, z)
  // beach is widest on the east front, narrow elsewhere
  const east = Math.max(0, Math.cos(phi))
  const width = 1.1 + 2.9 * east * east + fbm2(x * 0.15, z * 0.15, 2) * 0.6
  let h = 0.55 - 1.6 * smoothstep(width - 0.5, width + 1.4, dist)
  // reef flat
  h -= 2.4 * smoothstep(width + 1.5, 12, dist)
  // sand spit leading into the slab tail
  const tail = tailDistance(x, z)
  const spit = (1 - smoothstep(1.2, 3.4, tail.d)) * (1 - smoothstep(0.12, 0.38, tail.along))
  h = Math.max(h, 0.8 * spit - 0.4 - 4 * Math.max(0, 0.5 - spit))
  h += fbm2(x * 0.4, z * 0.4, 2) * 0.08
  // Deep ocean drop-off: past the reef shelf and slab spine, plunge deep into the abyss
  // so the terrain mesh perimeter is completely swallowed by water absorption (>30m deep)
  const spineReef = tail.along < 1.05 ? (1 - smoothstep(2.0, 9.5, tail.d)) * (1 - smoothstep(0.9, 1.05, tail.along)) : 0
  const shelfEdge = Math.max(11.0, 26.0 * spineReef)
  const abyss = smoothstep(shelfEdge, shelfEdge + 14.0, dist)
  h -= abyss * 36.0
  return h
}

const SAND = new Color('#e8dcc4')
const PEBBLE = new Color('#cab99e')
const SAND_WET = new Color('#9e8a6f')
const SEABED = new Color('#74b2a5')

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

const SLAB_COLORS = ['#c4a47a', '#b8966c', '#c8ae86', '#ab8b62', '#d2b68c'].map((h) => new Color(h))
const RUBBLE = new Color('#a88b68')

const SLAB_WET = new Color('#524130')

function slab(x: number, z: number, length: number, width: number, height: number, yaw: number, rand: () => number, yOffset = 0) {
  const SIDES = 32
  const g = new CylinderGeometry(1, 1, 1, SIDES, 4)
  g.deleteAttribute('uv')
  const pos = g.attributes.position
  const seed = rand() * 100
  const tiltX = (rand() - 0.5) * 0.06
  const tiltZ = (rand() - 0.5) * 0.06
  const v = new Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const r = Math.hypot(v.x, v.z)
    if (r > 0.01) {
      // Angular fractured limestone outline with stepped wave-cut ledges
      const a = Math.atan2(v.z, v.x)
      const k =
        0.84 +
        simplex.noise(Math.cos(a) * 1.2 + seed, Math.sin(a) * 1.2) * 0.18 +
        simplex.noise(Math.cos(a) * 3.4 - seed, Math.sin(a) * 3.4) * 0.07 +
        simplex.noise(Math.cos(a) * 7.1 + seed, Math.sin(a) * 7.1) * 0.025
      const step = v.y > 0.48 ? 0.91 : v.y > 0.15 ? 0.96 : v.y < -0.15 ? 1.04 : 1
      v.x *= k * step
      v.z *= k * step
    }
    v.x *= length / 2
    v.z *= width / 2
    v.y = (v.y + 0.5) * height + v.x * tiltX + v.z * tiltZ
    const rx = v.x * Math.cos(yaw) - v.z * Math.sin(yaw)
    const rz = v.x * Math.sin(yaw) + v.z * Math.cos(yaw)
    pos.setXYZ(i, x + rx, v.y - height * 0.62 + yOffset, z + rz)
  }
  g.computeVertexNormals()
  const col = SLAB_COLORS[Math.floor(rand() * SLAB_COLORS.length)]
  const nrm = g.attributes.normal
  const colors = new Float32Array(pos.count * 3)
  const cc = new Color()
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i)
    const wy = pos.getY(i)
    const wz = pos.getZ(i)
    cc.copy(col).offsetHSL(0, 0, nrm.getY(i) > 0.7 ? 0.03 : -0.05)
    cc.offsetHSL(0, -0.02, simplex.noise(wx * 0.9 + seed, wz * 0.9) * 0.05)
    cc.lerp(SLAB_WET, (1 - smoothstep(-0.04, 0.24, wy)) * 0.8)
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

function mergeParts(parts: BufferGeometry[]) {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g))
  const merged = mergeGeometries(flat, false)
  new Set([...parts, ...flat]).forEach((g) => g.dispose())
  if (!merged) throw new Error('Failed to merge rock geometry')
  return merged
}

/** Flat slabs: the southern tail, coastal rock shelves and reef scatter. */
function buildSlabs() {
  const rand = mulberry32(SEED + 7)
  const parts: BufferGeometry[] = []

  // Tail of slabs (Mermaid's Lair): broad fractured rock shelves with clear tidal channels between them.
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
    const size = (1 - t * 0.52) * (1.65 + rand() * 2.35)
    if (t < 0.12 && rand() < 0.5) continue // keep the spit sandy
    const yaw = Math.atan2(dirz, dirx) + (rand() - 0.5) * 1.1
    const h = 0.45 + (1 - t * 0.4) * (0.2 + rand() * 0.45)
    parts.push(slab(x, z, size * (1.25 + rand() * 0.55), size * (0.72 + rand() * 0.4), h, yaw, rand, -t * 0.08))
  }

  // Natural low wave-cut rock shelves emerging through the sand at the south-east corner (replaces artificial 5x4 puck grid).
  const shelves: [number, number, number, number, number][] = [
    [eastShorePoint(11.6, 1.1)[0], 11.6, 2.8, 1.7, 0.35],
    [eastShorePoint(13.2, 1.8)[0], 13.2, 2.4, 1.5, 0.22],
    [eastShorePoint(14.5, 1.2)[0], 14.5, 2.1, 1.4, 0.48],
    [eastShorePoint(12.4, 3.3)[0], 12.4, 1.8, 1.2, 0.15],
  ]
  for (const [sx, sz, sl, sw, syaw] of shelves) {
    const th = Math.max(-0.15, terrainHeight(sx, sz))
    parts.push(slab(sx, sz, sl, sw, 0.38 + rand() * 0.18, syaw, rand, th * 0.5))
  }

  // Low tidal reef rocks around the perimeter, sitting naturally in the shallows.
  const scatter: [number, number][] = [
    [-11.5, -7], [-12.2, -1.5], [-11.2, 5.5], [-10.2, 10.5], [-6.5, -14.5], [3.5, -16.8], [10.8, -8.5], [11.5, 11.5],
  ]
  for (const [x, z] of scatter) {
    const sx = x + (rand() - 0.5) * 1.5
    const sz = z + (rand() - 0.5) * 1.5
    parts.push(slab(sx, sz, 1.6 + rand() * 1.8, 1.1 + rand() * 1.1, 0.38 + rand() * 0.32, rand() * Math.PI, rand, -0.08))
  }

  return mergeParts(parts)
}

/** Rubble and fallen blocks at the cliff foot, heaviest on the west face. */
function buildRubble() {
  const rand = mulberry32(SEED + 11)
  const parts: BufferGeometry[] = []
  for (let i = 0; i < 70; i++) {
    const phi = rand() * Math.PI * 2
    if (Math.cos(phi) > 0.3 && rand() < 0.6) continue
    const r = mesaRadius(phi) * (1.02 + rand() * 0.12)
    parts.push(boulder(Math.cos(phi) * r, Math.sin(phi) * r, 0.35 + rand() * 0.9, rand))
  }
  return mergeParts(parts)
}

// ---------------------------------------------------------------------------
// East-front props: authentic Philippine coastal nipa beach cottage
// ---------------------------------------------------------------------------

function coloured(g: BufferGeometry, hex: string, shadeTop = 0.04) {
  g.deleteAttribute('uv')
  const n = g.index ? g.toNonIndexed() : g
  n.computeVertexNormals()
  const c = new Color(hex)
  const cc = new Color()
  const pos = n.attributes.position
  const nrm = n.attributes.normal
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const ny = nrm.getY(i)
    const noise = simplex.noise(pos.getX(i) * 4.2, pos.getZ(i) * 4.2) * 0.03
    cc.copy(c).offsetHSL(0, 0, ny * shadeTop + noise)
    colors.set([cc.r, cc.g, cc.b], i * 3)
  }
  n.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return n
}

function buildProps() {
  const parts: BufferGeometry[] = []
  // Authentic Philippine coastal nipa hut / thatched beach cottage
  const [tx, tz] = eastShorePoint(6.5, 2.55)
  const ty = terrainHeight(tx, tz)

  const postColor = '#8a6f4d'
  const bambooLight = '#b89968'
  const thatchBase = '#6e5536'
  const thatchMid = '#7d6240'
  const thatchTop = '#8b6e49'
  const hw = 0.88
  const hd = 0.68

  // 4 main bamboo corner posts sunk firmly into the beach sand
  for (const [dx, dz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) {
    parts.push(coloured(new CylinderGeometry(0.05, 0.055, 1.85, 8).translate(tx + dx, ty + 0.68, tz + dz), postColor))
    // Footing stone / bamboo collar
    parts.push(coloured(new CylinderGeometry(0.075, 0.085, 0.22, 8).translate(tx + dx, ty + 0.02, tz + dz), '#6d6256'))
  }
  // Slatted bamboo bench deck + perimeter frame
  parts.push(coloured(new BoxGeometry(hw * 2 + 0.16, 0.07, hd * 2 + 0.16).translate(tx, ty + 0.42, tz), bambooLight))
  // Back & side bamboo backrest rails
  parts.push(coloured(new BoxGeometry(0.045, 0.045, hd * 2).translate(tx - hw, ty + 0.74, tz), bambooLight))
  parts.push(coloured(new BoxGeometry(hw * 2, 0.045, 0.045).translate(tx, ty + 0.74, tz - hd), bambooLight))
  parts.push(coloured(new BoxGeometry(hw * 2, 0.045, 0.045).translate(tx, ty + 0.74, tz + hd), bambooLight))

  // Roof tie-beams & purlins
  parts.push(coloured(new BoxGeometry(hw * 2 + 0.28, 0.065, 0.065).translate(tx, ty + 1.52, tz - hd), postColor))
  parts.push(coloured(new BoxGeometry(hw * 2 + 0.28, 0.065, 0.065).translate(tx, ty + 1.52, tz + hd), postColor))
  parts.push(coloured(new BoxGeometry(0.065, 0.065, hd * 2 + 0.28).translate(tx - hw, ty + 1.52, tz), postColor))
  parts.push(coloured(new BoxGeometry(0.065, 0.065, hd * 2 + 0.28).translate(tx + hw, ty + 1.52, tz), postColor))

  // Layered nipa palm thatch roof (3 overlapping tiers + ridge cap for realistic depth & overhang)
  const eave = new CylinderGeometry(0.92, 1.58, 0.36, 4, 1)
  eave.rotateY(Math.PI / 4)
  eave.scale(1.26, 1.0, 0.98)
  eave.translate(tx, ty + 1.68, tz)
  parts.push(coloured(eave, thatchBase, 0.06))

  const midRoof = new CylinderGeometry(0.42, 1.12, 0.38, 4, 1)
  midRoof.rotateY(Math.PI / 4)
  midRoof.scale(1.24, 1.0, 0.96)
  midRoof.translate(tx, ty + 1.96, tz)
  parts.push(coloured(midRoof, thatchMid, 0.06))

  const crown = new ConeGeometry(0.62, 0.34, 4)
  crown.rotateY(Math.PI / 4)
  crown.scale(1.28, 1.0, 0.94)
  crown.translate(tx, ty + 2.22, tz)
  parts.push(coloured(crown, thatchTop, 0.07))

  // Bamboo ridge pole cap
  parts.push(coloured(new BoxGeometry(0.72, 0.07, 0.12).translate(tx, ty + 2.34, tz), postColor))

  const merged = mergeGeometries(parts, false)!
  parts.forEach((g) => g.dispose())
  merged.computeVertexNormals()
  return merged
}

/** Beach, slab tail and east-front props — usable around a real GLB as well. */
export interface IslandDressingGeometry {
  terrain: BufferGeometry
  slabs: BufferGeometry
  props: BufferGeometry
}

export interface ProceduralIslandGeometry extends IslandDressingGeometry {
  mesa: BufferGeometry
  rubble: BufferGeometry
}

let dressing: IslandDressingGeometry | null = null
let full: ProceduralIslandGeometry | null = null

export function getIslandDressing(): IslandDressingGeometry {
  if (!dressing) dressing = { terrain: buildTerrain(), slabs: buildSlabs(), props: buildProps() }
  return dressing
}

export function getProceduralIsland(): ProceduralIslandGeometry {
  if (!full) full = { ...getIslandDressing(), mesa: buildMesa(), rubble: buildRubble() }
  return full
}
