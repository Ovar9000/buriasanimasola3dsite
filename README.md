# Animasola Island · 3D Explorer

A static, view-only 3D web app for exploring **Animasola Island** — the layered-rock mesa off Burias Island, San Pascual, Masbate (Philippines). Fly between waypoints, take a guided tour, flip between day and sunset lighting, and browse photos of each spot. No backend; the build is a folder of static files.

**Stack:** Vite · React 19 · TypeScript · three.js · @react-three/fiber · @react-three/drei · @react-three/postprocessing · GSAP · Framer Motion · Zustand · Tailwind CSS v4 · lucide-react

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build → dist/
npm run preview    # serve dist/ locally
```

`vite.config.ts` uses `base: './'`, so `dist/` works from any sub-path (GitHub Pages, S3, Netlify, a USB stick…).

## Assets

Drop your files into `public/` using exactly this structure (paths are wired in `src/config/assets.ts`):

```text
public/
├── models/animasola-island.glb
├── textures/env-day.hdr · env-sunset.hdr · water-normals.jpg
└── images/hotspots/
    west-front-1.jpg · west-front-2.jpg · east-back-front-1.jpg · east-back-front-2.jpg
    island-top-view.jpg · mermaids-lair-top.jpg · animasola-sign-sunset.jpg
    east-front-wide.jpg · classic-cliff-view.jpg
```

**Every asset is optional at runtime.** Anything missing falls back gracefully:

| Missing | Fallback |
| --- | --- |
| `animasola-island.glb` | Procedural island modelled on reference photos (layered mesa, grassy summit, slab tail, sign beach) |
| `env-*.hdr` | Lightformer studio tinted for the time of day |
| `water-normals.jpg` | Generated tileable normal map |
| hotspot `*.jpg` | Styled placeholder (shows the expected path in dev) |

### Fitting your GLB

The model is auto-centred and scaled to `ISLAND.targetSize` in `src/config/scene.ts`; `rotationY` turns it so it runs north–south with the sign beach facing +X, and `submergedFraction` sets the water line. Hotspot markers are ray-cast onto the loaded surface. In dev, **Alt/Option-click** the island to log a world position for `src/data/hotspots.ts`.

With `ISLAND.dressing: true` (default) the app measures the model's waterline outline at load and wraps it with features the scan lacks — the pale beach (widest on the east front), the reef flat, the southern slab tail, and the ANIMASOLA letters / kiosk / canopy. Set it to `false` to show the model alone.

**Keep the GLB web-sized.** The current model was optimised from the 72 MB Meshy export (2.2 M triangles) to 4.3 MB (549 k triangles, meshopt geometry, WebP textures) with:

```bash
npx @gltf-transform/cli optimize original.glb public/models/animasola-island.glb \
  --compress meshopt --texture-compress webp --texture-size 2048 \
  --simplify-ratio 0.25 --simplify-error 0.001
```

## How it's organised

```text
src/
├── config/        assets.ts (paths) · scene.ts (island fit, camera, tour timing)
├── data/          hotspots.ts — titles, copy, facts, images, anchors, camera views
├── store/         useExplorerStore.ts — zustand: active hotspot, tour, time of day, quality…
├── three/         Canvas content
│   ├── Experience.tsx      Canvas, adaptive quality (PerformanceMonitor), scene graph
│   ├── Island.tsx          GLB loader + procedural fallback (proceduralIsland.ts)
│   ├── Ocean.tsx           three.js Water + reef-flat shallows
│   ├── Atmosphere.tsx      gradient sky dome, sun, fog, HDR / fallback IBL
│   ├── atmosphere.ts       day ↔ sunset presets, GSAP-blended every frame
│   ├── CameraRig.tsx       OrbitControls + GSAP intro & arcing waypoint flights
│   ├── Hotspots.tsx        surface-snapped HTML markers
│   └── Effects.tsx         bloom · tone mapping · vignette (per quality tier)
├── ui/            TopBar · WaypointRail/Chips · DetailPanel (desktop) · BottomSheet (mobile)
│                  ImageCarousel · Lightbox · TourIndicator · LoadingScreen · AboutDialog
└── hooks/         tour director · URL hash sync · keyboard shortcuts · media queries
```

## Features

- **Cinematic camera**: GSAP intro fly-in; waypoint flights arc around the island instead of through it. The projection shifts so the subject stays visible beside the desktop panel or above the mobile sheet. The camera auto-orbits when idle.
- **Guided tour**: auto-advances through every waypoint (dwell time in `TOUR.dwell`) and pauses as soon as you grab the camera.
- **Day / sunset**: sky, sun, fog, water, reef tint, bloom and IBL all cross-fade. On the overview the camera swings round to face the setting sun.
- **Responsive**: side panel and waypoint rail on desktop; draggable bottom sheet (peek ↔ expanded) and swipeable chips on mobile; safe-area aware.
- **Adaptive quality**: the initial tier comes from the device type. `PerformanceMonitor` then steps DPR, shadow resolution, reflection resolution and post-processing up or down at runtime.
- **Shareable views**: `#/<hotspot-id>` deep links (e.g. `#/mermaids-lair`).
- **Keyboard**: `←`/`→` waypoints · `T` tour · `L` lighting · `H` overview · `Esc` close.
- Honours `prefers-reduced-motion`, and shows a no-WebGL fallback.

> Hotspot copy and positions are a starting point based on reference photos. Check names, facts and placement against your own knowledge of the island and your final model.
