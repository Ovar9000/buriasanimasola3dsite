import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three'

/**
 * Art-directable sky: zenith → horizon blend whose horizon warms toward the
 * sun, a soft HDR sun disc and halo, drifting cumulus lit from the sun side
 * with silver linings, and a faint high cirrus layer. Unlike a physical sky it
 * never blows out, and its horizon can match the fog colour exactly.
 *
 * The same material is rendered into the environment map (see Atmosphere), so
 * reflections and fill light always match what's on screen.
 */
export function createSkyDome(radius = 4000) {
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new Color() },
      horizon: { value: new Color() },
      horizonSun: { value: new Color() },
      sunGlow: { value: new Color() },
      sunDirection: { value: new Vector3(0, 1, 0) },
      glowStrength: { value: 0.5 },
      cloudLit: { value: new Color() },
      cloudShade: { value: new Color() },
      cloudCover: { value: 0.5 },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 horizonSun;
      uniform vec3 sunGlow;
      uniform vec3 sunDirection;
      uniform float glowStrength;
      uniform vec3 cloudLit;
      uniform vec3 cloudShade;
      uniform float cloudCover;
      uniform float time;
      varying vec3 vDir;

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      #ifndef CLOUD_OCTAVES
      #define CLOUD_OCTAVES 5
      #endif
      float fbm(vec2 p) {
        float s = 0.0;
        float a = 0.5;
        mat2 r = mat2(1.6, 1.2, -1.2, 1.6);
        for (int i = 0; i < CLOUD_OCTAVES; i++) {
          s += vnoise(p) * a;
          p = r * p;
          a *= 0.5;
        }
        return s;
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 sun = normalize(sunDirection);

        // How much this direction faces the sun around the horizon.
        float facing = dot(normalize(d.xz + 1e-5), normalize(sun.xz + 1e-5)) * 0.5 + 0.5;
        vec3 hor = mix(horizon, horizonSun, pow(facing, 3.0));

        float up = pow(clamp(h, 0.0, 1.0), 0.45);
        vec3 col = mix(hor, zenith, up);
        // below the horizon, fade toward a darker sea-haze (mostly seen by reflections)
        col = mix(col, mix(hor, zenith * 0.35, 0.6), smoothstep(0.0, -0.25, h));

        float s = max(dot(d, sun), 0.0);
        col += sunGlow * glowStrength * (pow(s, 6.0) * 0.35 + pow(s, 64.0) * 0.6);

        // ---- clouds, projected onto a flat layer overhead
        float dens = 0.0;
        if (h > 0.0) {
          float k = 1.0 / (h + 0.08);
          vec2 p = d.xz * k * 0.75 + vec2(time * 0.006, time * 0.002);
          // domain warp for billowy shapes
          vec2 w = vec2(fbm(p * 0.7 + 3.1), fbm(p * 0.7 - 7.4));
          float n = fbm(p + w * 0.9);
          float cover = clamp(cloudCover, 0.0, 1.0);
          dens = smoothstep(1.0 - cover * 0.7, 1.0 - cover * 0.7 + 0.18, n);
          // fake self-shadowing: denser toward the sun = shaded
          float toward = fbm(p + w * 0.9 + sun.xz * 0.35);
          float lit = clamp(0.62 + (n - toward) * 5.0, 0.0, 1.0);
          vec3 cloud = mix(cloudShade, cloudLit, lit);
          // silver lining around the sun
          cloud += sunGlow * pow(s, 10.0) * (1.0 - dens) * 2.5;
          float fade = smoothstep(0.0, 0.14, h);
          dens *= fade;
          col = mix(col, cloud, dens * 0.96);

          // high cirrus streaks
          vec2 q = d.xz * k * 0.5 * vec2(1.0, 4.0) + vec2(time * 0.006, 0.0);
          float c = smoothstep(0.55, 0.9, fbm(q)) * smoothstep(0.05, 0.3, h) * (1.0 - dens);
          col = mix(col, cloudLit, c * 0.35);
        }

        // HDR sun disc, dimmed where a cloud passes in front of it
        col += sunGlow * smoothstep(0.99965, 0.99985, s) * 10.0 * (1.0 - dens * 0.85);

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
  const mesh = new Mesh(new SphereGeometry(radius, 64, 32), material)
  mesh.frustumCulled = false
  mesh.renderOrder = -10
  return mesh
}
