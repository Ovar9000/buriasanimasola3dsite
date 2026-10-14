/**
 * Single source of truth for every static asset the app loads from `public/`.
 * Paths are resolved against Vite's BASE_URL so the build works from any sub-path.
 */
const base = import.meta.env.BASE_URL

const asset = (path: string) => (base.endsWith('/') ? base : `${base}/`) + path

export const ASSETS = {
  model: {
    island: asset('models/animasola-island.glb'),
  },
  textures: {
    envDay: asset('textures/env-day.hdr'),
    envSunset: asset('textures/env-sunset.hdr'),
    waterNormals: asset('textures/water-normals.jpg'),
  },
  hotspots: {
    westFront1: asset('images/hotspots/west-front-1.jpg'),
    westFront2: asset('images/hotspots/west-front-2.jpg'),
    eastBackFront1: asset('images/hotspots/east-back-front-1.jpg'),
    eastBackFront2: asset('images/hotspots/east-back-front-2.jpg'),
    islandTopView: asset('images/hotspots/island-top-view.jpg'),
    mermaidsLairTop: asset('images/hotspots/mermaids-lair-top.jpg'),
    animasolaSignSunset: asset('images/hotspots/animasola-sign-sunset.jpg'),
    eastFrontWide: asset('images/hotspots/east-front-wide.jpg'),
    classicCliffView: asset('images/hotspots/classic-cliff-view.jpg'),
  },
} as const
