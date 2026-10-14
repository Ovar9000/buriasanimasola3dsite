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
        aoRadius={2.2}
        distanceFalloff={1.2}
        intensity={2.2}
        quality={high ? 'medium' : 'performance'}
        halfRes={!high}
        depthAwareUpsampling
        color="#0d1622"
      />
      <Bloom ref={bloom} mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.25} intensity={0.35} radius={0.75} levels={high ? 8 : 6} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <HueSaturation saturation={0.12} />
      <BrightnessContrast brightness={0.01} contrast={0.08} />
      <Vignette offset={0.35} darkness={high ? 0.32 : 0.24} />
      {!high && <SMAA />}
    </EffectComposer>
  )
}
