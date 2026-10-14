import { useMemo } from 'react'
import { useHashSync } from './hooks/useHashSync'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useTourDirector } from './hooks/useTourDirector'
import { DESKTOP_QUERY } from './lib/layout'
import { Experience } from './three/Experience'
import { AboutDialog } from './ui/AboutDialog'
import { BottomSheet } from './ui/BottomSheet'
import { DetailPanel } from './ui/DetailPanel'
import { GestureHint } from './ui/GestureHint'
import { Lightbox } from './ui/Lightbox'
import { LoadingScreen } from './ui/LoadingScreen'
import { TopBar } from './ui/TopBar'
import { TourIndicator } from './ui/TourIndicator'
import { WaypointChips, WaypointRail } from './ui/WaypointNav'

const hasWebGL = () => {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export default function App() {
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const webgl = useMemo(hasWebGL, [])

  useTourDirector()
  useHashSync()
  useKeyboardShortcuts()

  if (!webgl) return <NoWebGL />

  return (
    <main className="fixed inset-0 overflow-hidden">
      <Experience />

      <TopBar />
      <TourIndicator desktop={desktop} />
      {desktop ? (
        <>
          <WaypointRail />
          <DetailPanel />
        </>
      ) : (
        <>
          <WaypointChips />
          <BottomSheet />
        </>
      )}
      <GestureHint desktop={desktop} />
      <Lightbox />
      <AboutDialog />
      <LoadingScreen />
    </main>
  )
}

function NoWebGL() {
  return (
    <main className="grid h-full place-items-center bg-deep-950 p-8 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-4xl text-sand-50">Animasola Island</h1>
        <p className="mt-4 text-white/70">
          This 3D explorer needs WebGL, which isn’t available in this browser. Try a recent version of Chrome, Safari, Firefox or Edge, or
          enable hardware acceleration.
        </p>
      </div>
    </main>
  )
}
