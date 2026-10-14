import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Rendered when the children throw (e.g. an asset 404s or fails to parse). */
  fallback: ReactNode
  /** Label used in the console warning. */
  name: string
  children: ReactNode
}

interface State {
  failed: boolean
}

/**
 * Catches loader errors from Suspense-based asset hooks (useGLTF, useLoader, …)
 * so a missing file in `public/` degrades to a fallback instead of a blank canvas.
 */
export class AssetBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.warn(`[assets] "${this.props.name}" unavailable — using fallback.`, error, info.componentStack)
    } else {
      console.warn(`[assets] "${this.props.name}" unavailable — using fallback.`)
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
