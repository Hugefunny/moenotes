/**
 * The shapes behind every page (src/components/shell/BackgroundPattern.astro), as MoeSekai draws them after the
 * official site's background: light shards, then three layers of rings, dots and triangles that gather at both sides
 * and leave the middle, where the content sits, nearly clear. Near shapes are small and sharp; far ones are big,
 * faint and blurred. Seeded, so every page and every build draws the same field.
 */

/** Tile size in SVG units; laid over `--mn-brand-pattern-tile`, cropped at the sides on narrow screens. */
export const PATTERN_TILE_W = 1600;
export const PATTERN_TILE_H = 1000;

export type PatternTone = "a" | "b";

export interface PatternShape {
  kind: "ring" | "dot" | "triangle" | "outline-triangle";
  x: number;
  y: number;
  /** Radius; for triangles, the distance from the center to the corners. */
  r: number;
  tone: PatternTone;
  alpha: number;
  /** Triangle corners, already rotated and jittered. */
  points?: string;
}

export interface PatternLayer {
  shapes: PatternShape[];
  /** Gaussian blur in tile units: the farther the layer, the softer, like depth of field. */
  blur: number;
  /** How far the layer moves per pixel scrolled: small outlines run ahead, big shards lag. */
  speed: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A slightly uneven triangle, like a shard rather than a road sign. */
function trianglePoints(rand: () => number, x: number, y: number, r: number): string {
  const turn = rand() * Math.PI * 2;
  return [0, 1, 2]
    .map((i) => {
      const angle = turn + (i * Math.PI * 2) / 3 + (rand() - 0.5) * 0.5;
      const radius = r * (0.8 + rand() * 0.4);
      return `${(x + Math.cos(angle) * radius).toFixed(1)},${(y + Math.sin(angle) * radius).toFixed(1)}`;
    })
    .join(" ");
}

interface LayerSpec {
  count: number;
  /** Closest two shapes of the layer may sit, in tile units. */
  spacing: number;
  blur: number;
  speed: number;
  /** Chance a shape may sit in the middle of the tile, where the page content is. */
  middle: number;
  /** Distance from the center (0 center, 1 side edge) where shapes reach full density. */
  sides: number;
  make: (rand: () => number, x: number, y: number, tone: PatternTone) => PatternShape;
}

const LAYERS: LayerSpec[] = [
  {
    count: 16,
    spacing: 150,
    blur: 0,
    speed: 1.2,
    middle: 0.15,
    sides: 0.75,
    make: (rand, x, y, tone) => {
      const pick = rand();
      if (pick < 0.45) return { kind: "ring", x, y, r: 7 + rand() * 5, tone, alpha: 0.6 };
      if (pick < 0.75) return { kind: "dot", x, y, r: 3.5 + rand() * 3, tone, alpha: 0.55 };
      const r = 9 + rand() * 5;
      return { kind: "outline-triangle", x, y, r, tone, alpha: 0.6, points: trianglePoints(rand, x, y, r) };
    },
  },
  {
    count: 9,
    spacing: 240,
    blur: 1.5,
    speed: 1,
    middle: 0.06,
    sides: 0.8,
    make: (rand, x, y, tone) => {
      const pick = rand();
      if (pick < 0.5) {
        const r = 16 + rand() * 8;
        return { kind: "triangle", x, y, r, tone, alpha: 0.42, points: trianglePoints(rand, x, y, r) };
      }
      if (pick < 0.75) return { kind: "dot", x, y, r: 8 + rand() * 5, tone, alpha: 0.35 };
      const r = 14 + rand() * 5;
      return { kind: "outline-triangle", x, y, r, tone, alpha: 0.5, points: trianglePoints(rand, x, y, r) };
    },
  },
  {
    count: 4,
    spacing: 420,
    blur: 7,
    speed: 0.4,
    middle: 0,
    sides: 0.9,
    make: (rand, x, y, tone) => {
      if (rand() < 0.3) return { kind: "dot", x, y, r: 26 + rand() * 10, tone, alpha: 0.24 };
      const r = 42 + rand() * 20;
      return { kind: "triangle", x, y, r, tone, alpha: 0.3, points: trianglePoints(rand, x, y, r) };
    },
  },
];

/** How likely a shape at x is kept: `middle` at the center, rising smoothly to 1 at `sides`. */
function sideWeight(x: number, middle: number, sides: number): number {
  const fromCenter = Math.abs(x - PATTERN_TILE_W / 2) / (PATTERN_TILE_W / 2);
  const t = Math.min(1, Math.max(0, fromCenter / sides));
  return middle + (1 - middle) * t * t * (3 - 2 * t);
}

/** Each layer's shapes, spread out and kept off the tile's top and bottom edges so tiles repeat seamlessly. */
export const PATTERN_LAYERS: PatternLayer[] = LAYERS.map((spec, index) => {
  const rand = mulberry32(0x5ec4a1 + index * 7919);
  const margin = 90;
  const shapes: PatternShape[] = [];
  for (let attempt = 0; shapes.length < spec.count && attempt < spec.count * 200; attempt++) {
    const x = rand() * PATTERN_TILE_W;
    const y = margin + rand() * (PATTERN_TILE_H - margin * 2);
    if (rand() > sideWeight(x, spec.middle, spec.sides)) continue;
    if (shapes.some((shape) => Math.hypot(shape.x - x, shape.y - y) < spec.spacing)) continue;
    shapes.push(spec.make(rand, x, y, shapes.length % 2 === 0 ? "a" : "b"));
  }
  return { shapes, blur: spec.blur, speed: spec.speed };
});
