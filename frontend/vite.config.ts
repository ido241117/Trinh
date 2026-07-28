import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Dev test port — keep clear of prod (2411)
    port: 2413,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:2108',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
  },
})
