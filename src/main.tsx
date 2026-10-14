import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!, {
  // Missing optional assets are caught by <AssetBoundary> and logged there.
  onCaughtError: () => {},
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
