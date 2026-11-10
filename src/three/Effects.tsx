import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { useFrame } from '@react-three/fiber'
import type { BloomEffect } from 'postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useRef } from 'react'
import { useExplorerStore } from '../store/useExplorerStore'
import { sampleAtmosphere } from './atmosphere.ts'

/** The bit of n8ao's (untyped) post pass we drive per frame. */
type N8AOPass = { configuration: { intensity: number } }

/**
 * Post-processing tuned per quality tier:
 *  - high:   ambient occlusion · HDR bloom · ACES filmic · grade · MSAA
 *  - medium: half-res ambient occlusion · bloom · ACES · grade · SMAA
 *  - low:    composer skipped; the renderer's own ACES tone mapping is used.
 */
export function Effects() {
  const quality = useExplorerStore((s) => s.quality)
  const bloom = useRef<BloomEffect>(null)
  const ao = useRef<N8AOPass>(null)

  useFrame(() => {
    const a = sampleAtmosphere()
    if (bloom.current) bloom.current.intensity = a.bloom
    if (ao.current) ao.current.configuration.intensity = a.ao
  })

  if (quality === 'low') return null
  const high = quality === 'high'

  return (
    <EffectComposer multisampling={high ? 4 : 0} enableNormalPass={false}>
      <N8AO
        ref={ao}
        aoRadius={2.0}
        distanceFalloff={1.8}
        intensity={1.0}
        quality={high ? 'medium' : 'performance'}
        halfRes={!high}
        depthAwareUpsampling
        color="#08101a"
      />
      <Bloom ref={bloom} mipmapBlur luminanceThreshold={0.92} luminanceSmoothing={0.25} intensity={0.24} radius={0.7} levels={high ? 8 : 6} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <HueSaturation saturation={0.03} />
      <BrightnessContrast brightness={0.015} contrast={0.04} />
      <Vignette offset={0.35} darkness={high ? 0.25 : 0.18} />
      {!high && <SMAA />}
    </EffectComposer>
  )
}
