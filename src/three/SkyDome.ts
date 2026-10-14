import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three'

/**
 * Art-directable gradient sky: zenith → horizon blend whose horizon warms
 * toward the sun, plus a soft sun disc and halo. Unlike a physical sky it never
 * blows out, and its horizon can match the fog colour exactly.
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
      varying vec3 vDir;

      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 sun = normalize(sunDirection);

        // How much this direction faces the sun around the horizon.
        float facing = dot(normalize(d.xz + 1e-5), normalize(sun.xz + 1e-5)) * 0.5 + 0.5;
        vec3 hor = mix(horizon, horizonSun, pow(facing, 3.0));

        float up = pow(clamp(h, 0.0, 1.0), 0.45);
        vec3 col = mix(hor, zenith, up);

        float s = max(dot(d, sun), 0.0);
        col += sunGlow * glowStrength * (pow(s, 6.0) * 0.35 + pow(s, 64.0) * 0.6);
        col += sunGlow * smoothstep(0.9993, 0.9997, s) * 6.0;

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
  const mesh = new Mesh(new SphereGeometry(radius, 48, 24), material)
  mesh.frustumCulled = false
  mesh.renderOrder = -10
  return mesh
}
