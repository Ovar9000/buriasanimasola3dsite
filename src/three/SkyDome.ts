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
      fogColor: { value: new Color() },
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
      uniform vec3 fogColor;
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
        float facingDot = clamp(dot(normalize(d.xz + 1e-5), normalize(sun.xz + 1e-5)), -1.0, 1.0);
        float facing = max(facingDot * 0.5 + 0.5, 1e-4);
        float horizonBand = exp(-max(h, 0.0) * 6.5);
        vec3 hor = mix(horizon, horizonSun, pow(facing, 2.2));

        float up = pow(clamp(h, 1e-4, 1.0), 0.42);
        vec3 col = mix(hor, zenith, up);
        // Subtle warm scattering belt right along the solar horizon
        col += horizonSun * horizonBand * pow(facing, 3.0) * glowStrength * 0.20;
        // Below the horizon, fade toward a darker sea-haze (mostly seen by reflections)
        col = mix(col, mix(hor, zenith * 0.35, 0.6), 1.0 - smoothstep(-0.25, 0.0, h));

        // Mie solar aureole + warm broad haze
        float s = max(dot(d, sun), 1e-4);
        col += sunGlow * glowStrength * (pow(s, 3.5) * 0.22 + pow(s, 18.0) * 0.42 + pow(s, 96.0) * 0.8);

        // Faint twilight stars overhead when the sun sits low near sunset
        float twilight = (1.0 - smoothstep(0.06, 0.24, sun.y)) * smoothstep(0.08, 0.42, h) * (1.0 - smoothstep(0.25, 0.75, s));
        if (twilight > 0.001) {
          vec2 starUv = d.xz / (h + 0.35) * 68.0;
          vec2 sid = floor(starUv);
          vec2 sf = fract(starUv) - 0.5;
          float rnd = hash12(sid);
          if (rnd > 0.962) {
            float star = (1.0 - smoothstep(0.02, 0.18, length(sf))) * smoothstep(0.962, 1.0, rnd);
            col += vec3(0.95, 0.96, 1.0) * star * twilight * 1.1;
          }
        }

        // ---- clouds, projected onto a flat layer overhead
        float dens = 0.0;
        if (h > 0.0) {
          float k = 1.0 / (h + 0.09);
          vec2 p = d.xz * k * 0.72 + vec2(time * 0.006, time * 0.002);
          // domain warp for billowy shapes
          vec2 w = vec2(fbm(p * 0.7 + 3.1), fbm(p * 0.7 - 7.4));
          float n = fbm(p + w * 0.92);
          float cover = clamp(cloudCover, 0.0, 1.0);
          dens = smoothstep(1.0 - cover * 0.72, 1.0 - cover * 0.72 + 0.2, n);
          // fake self-shadowing: denser toward the sun = shaded, with warm backlit edges
          float toward = fbm(p + w * 0.92 + sun.xz * 0.36);
          float lit = clamp(0.58 + (n - toward) * 5.2, 0.0, 1.0);
          vec3 cloud = mix(cloudShade, cloudLit, lit);
          // silver/golden lining around the sun
          cloud += sunGlow * (pow(s, 8.0) * 1.8 + pow(s, 28.0) * 1.4) * (1.0 - dens * 0.75);
          float fade = smoothstep(0.0, 0.14, h);
          dens *= fade;
          col = mix(col, cloud, dens * 0.96);

          // high cirrus streaks
          vec2 q = d.xz * k * 0.5 * vec2(1.0, 4.0) + vec2(time * 0.006, 0.0);
          float c = smoothstep(0.55, 0.9, fbm(q)) * smoothstep(0.05, 0.3, h) * (1.0 - dens);
          col = mix(col, mix(cloudLit, sunGlow, pow(s, 3.0) * 0.45), c * 0.38);
        }

        // HDR sun disc, dimmed where a cloud passes in front of it
        col += sunGlow * smoothstep(0.9996, 0.99985, s) * 11.0 * (1.0 - dens * 0.85);

        // Seamless sea-horizon aerial haze transition so distant ocean fog meets the sky smoothly
        float hFog = 1.0 - smoothstep(-0.02, 0.026, h);
        col = mix(col, fogColor, hFog * 0.88);

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
