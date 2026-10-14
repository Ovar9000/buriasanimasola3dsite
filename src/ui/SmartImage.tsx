import { ImageOff } from 'lucide-react'
import { useState, type ImgHTMLAttributes } from 'react'

interface SmartImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  src: string
  alt: string
  /** Shown on the placeholder when the file is missing. */
  label?: string
}

/**
 * Lazy image with a fade-in, and a tasteful placeholder if the file in
 * `public/images/hotspots/` hasn't been added yet.
 */
export function SmartImage({ src, alt, label, className = '', ...rest }: SmartImageProps) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [prevSrc, setPrevSrc] = useState(src)
  if (src !== prevSrc) {
    setPrevSrc(src)
    setState('loading')
  }

  const file = src.split('/').slice(-3).join('/')

  return (
    <div className={`relative overflow-hidden bg-deep-900 ${className}`}>
      {state !== 'error' && (
        <img
          {...rest}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
          className={`h-full w-full object-cover transition-opacity duration-500 ${state === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {state === 'loading' && <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/5 to-white/10" />}
      {state === 'error' && (
        <div
          role="img"
          aria-label={alt}
          className="absolute inset-0 grid place-items-center bg-[radial-gradient(120%_90%_at_20%_10%,#1fa5a4_0%,#0b3b4d_45%,#06141f_100%)] p-4 text-center"
        >
          <div className="flex flex-col items-center gap-2 text-white/80">
            <ImageOff size={22} aria-hidden />
            {label && <span className="font-display text-base text-white/90">{label}</span>}
            {import.meta.env.DEV && <code className="rounded bg-black/30 px-2 py-0.5 text-[10px] text-white/60">public/{file}</code>}
          </div>
        </div>
      )}
    </div>
  )
}
