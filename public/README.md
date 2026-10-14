# Static assets

The app expects exactly this structure. Every file is optional at runtime —
missing files fall back gracefully (procedural island, built-in lighting,
generated water normals, placeholder images) — but drop the real assets in
to get the full experience.

```text
public/
├── models/
│   └── animasola-island.glb        # Island mesh (Draco/meshopt OK). Auto-centred & scaled.
├── textures/
│   ├── env-day.hdr                 # Equirectangular HDRI for daytime lighting
│   ├── env-sunset.hdr              # Equirectangular HDRI for sunset lighting
│   └── water-normals.jpg           # Tileable ocean normal map (three.js "waternormals" style)
└── images/
    └── hotspots/
        ├── west-front-1.jpg
        ├── west-front-2.jpg
        ├── east-back-front-1.jpg
        ├── east-back-front-2.jpg
        ├── island-top-view.jpg
        ├── mermaids-lair-top.jpg
        ├── animasola-sign-sunset.jpg
        ├── east-front-wide.jpg
        └── classic-cliff-view.jpg
```

Paths are wired in `src/config/assets.ts`; model placement (scale, rotation,
water line) is tuned in `src/config/scene.ts`.
