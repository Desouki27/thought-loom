import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The Markdown editor is intentionally isolated behind a lazy route-level boundary.
  build: { chunkSizeWarningLimit: 1100 },
})
