import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { useFrame } from '@react-three/fiber'
import type { BloomEffect } from 'postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useRef } from 'react'
import { useExplorerStore } from '../store/useExplorerStore'
import { sampleAtmosphere } from './atmosphere'

/**
 * Post-processing tuned per quality tier. On "low" the composer is skipped
 * entirely and the renderer's own Neutral tone mapping is used.
 */
export function Effects() {
  const quality = useExplorerStore((s) => s.quality)
  const bloom = useRef<BloomEffect>(null)

  useFrame(() => {
    if (bloom.current) bloom.current.intensity = sampleAtmosphere().bloom
  })

  if (quality === 'low') return null

  return (
    <EffectComposer multisampling={quality === 'high' ? 4 : 0} enableNormalPass={false}>
      <Bloom ref={bloom} mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={0.4} radius={0.7} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.25} darkness={quality === 'high' ? 0.5 : 0.4} />
    </EffectComposer>
  )
}
