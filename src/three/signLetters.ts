import { BufferGeometry, ExtrudeGeometry, Path, Shape, Vector2 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Bold sans block letters for the ANIMASOLA beach sign, drawn as 2D shapes and
 * extruded with a small bevel. Built from code so the sign needs no font file.
 * Shape space: cap height 1, baseline at y = 0, each glyph starting at x = 0.
 */

const STROKE = 0.22

const poly = (pts: [number, number][]) => new Shape(pts.map(([x, y]) => new Vector2(x, y)))
const hole = (pts: [number, number][]) => new Path(pts.map(([x, y]) => new Vector2(x, y)))

function letterA() {
  const s = poly([[0, 0], [0.22, 0], [0.273, 0.22], [0.527, 0.22], [0.58, 0], [0.8, 0], [0.5, 1], [0.3, 1]])
  s.holes.push(hole([[0.316, 0.4], [0.4, 0.75], [0.484, 0.4]]))
  return { shapes: [s], width: 0.8 }
}

function letterN() {
  const s = poly([[0, 0], [0.22, 0], [0.22, 0.6], [0.5, 0], [0.72, 0], [0.72, 1], [0.5, 1], [0.5, 0.4], [0.22, 1], [0, 1]])
  return { shapes: [s], width: 0.72 }
}

function letterI() {
  return { shapes: [poly([[0, 0], [STROKE, 0], [STROKE, 1], [0, 1]])], width: STROKE }
}

function letterM() {
  const s = poly([[0, 0], [0.2, 0], [0.2, 0.62], [0.4, 0.22], [0.5, 0.22], [0.7, 0.62], [0.7, 0], [0.9, 0], [0.9, 1], [0.7, 1], [0.45, 0.5], [0.2, 1], [0, 1]])
  return { shapes: [s], width: 0.9 }
}

function letterL() {
  return { shapes: [poly([[0, 0], [0.6, 0], [0.6, STROKE], [STROKE, STROKE], [STROKE, 1], [0, 1]])], width: 0.6 }
}

function letterO() {
  const s = new Shape()
  s.absellipse(0.42, 0.5, 0.42, 0.5, 0, Math.PI * 2, false, 0)
  const h = new Path()
  h.absellipse(0.42, 0.5, 0.2, 0.28, 0, Math.PI * 2, true, 0)
  s.holes.push(h)
  return { shapes: [s], width: 0.84 }
}

/** An S stroked along two stacked arcs, offset either side of the centre line. */
function letterS() {
  const r = 0.25 - STROKE / 4
  const cx = 0.31
  const top = { y: 1 - STROKE / 2 - r }
  const bot = { y: STROKE / 2 + r }
  const centre: Vector2[] = []
  const N = 28
  // upper bowl: from the upper-right terminal, anticlockwise round the left to the middle
  for (let i = 0; i <= N; i++) {
    const a = MathPI(0.12) + (i / N) * MathPI(1.38)
    centre.push(new Vector2(cx + Math.cos(a) * r, top.y + Math.sin(a) * r))
  }
  // lower bowl: from the middle, clockwise round the right to the lower-left terminal
  for (let i = 1; i <= N; i++) {
    const a = MathPI(0.5) - (i / N) * MathPI(1.38)
    centre.push(new Vector2(cx + Math.cos(a) * r, bot.y + Math.sin(a) * r))
  }
  const left: Vector2[] = []
  const right: Vector2[] = []
  for (let i = 0; i < centre.length; i++) {
    const a = centre[Math.max(0, i - 1)]
    const b = centre[Math.min(centre.length - 1, i + 1)]
    const t = b.clone().sub(a).normalize()
    const n = new Vector2(-t.y, t.x).multiplyScalar(STROKE / 2)
    left.push(centre[i].clone().add(n))
    right.push(centre[i].clone().sub(n))
  }
  return { shapes: [new Shape([...left, ...right.reverse()])], width: 0.62 }
}

const MathPI = (k: number) => Math.PI * k

const GLYPHS: Record<string, () => { shapes: Shape[]; width: number }> = {
  A: letterA,
  N: letterN,
  I: letterI,
  M: letterM,
  S: letterS,
  O: letterO,
  L: letterL,
}

/**
 * Extruded, bevelled word centred on the origin: text runs along +X, letters
 * stand on y = 0 and face +Z. `height` is the cap height in world units.
 */
export function buildSignGeometry(word = 'ANIMASOLA', height = 0.95, depth = 0.22, spacing = 0.13): BufferGeometry {
  const parts: BufferGeometry[] = []
  let cursor = 0
  const bevel = 0.025
  for (const ch of word) {
    const glyph = GLYPHS[ch]?.()
    if (!glyph) {
      cursor += 0.4
      continue
    }
    const g = new ExtrudeGeometry(glyph.shapes, {
      depth: depth / height - (2 * bevel) / height,
      bevelEnabled: true,
      bevelThickness: bevel / height,
      bevelSize: bevel / height,
      bevelSegments: 2,
      curveSegments: 24,
    })
    g.translate(cursor, 0, 0)
    parts.push(g)
    cursor += glyph.width + spacing
  }
  const merged = mergeGeometries(parts, false)!
  parts.forEach((g) => g.dispose())
  const total = cursor - spacing
  merged.translate(-total / 2, 0, -depth / height / 2)
  merged.scale(height, height, height)
  merged.computeVertexNormals()
  return merged
}
