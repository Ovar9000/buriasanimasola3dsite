import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Relative base so the static build works from any sub-path
// (GitHub Pages project sites, S3 folders, file shares, etc.).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    // The three.js / R3F / post-processing (incl. N8AO) chunk is ~1.6 MB raw, ~520 kB gzip.
    chunkSizeWarningLimit: 1700,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/](three|three-stdlib|@react-three|postprocessing|maath|troika-[\w-]+|n8ao)[\\/]/.test(id)) return '3d'
          if (/[\\/](gsap|framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) return 'motion'
          return 'vendor'
        },
      },
    },
  },
})
