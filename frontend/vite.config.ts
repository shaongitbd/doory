/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_TARGET = process.env.VITE_API_PROXY ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Loaded with import() when a video is made: listed so the dev server bundles them at start instead of discovering them
  // mid-session, which reloads the page under a running test.
  optimizeDeps: { include: ['mp4-muxer', 'webm-muxer', 'gifenc'] },
  server: {
    port: 5173,
    // Same-origin in dev so session + CSRF cookies just work.
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/media': { target: API_TARGET, changeOrigin: true },
      '/admin': { target: API_TARGET, changeOrigin: true },
      '/static': { target: API_TARGET, changeOrigin: true },
      // Real-time co-editing: the Django dev server (daphne) upgrades the connection.
      '/ws': { target: API_TARGET, changeOrigin: true, ws: true },
    },
  },
  build: {
    // dist/.vite/manifest.json: the chunk graph that scripts/bundleReport.mjs measures against the budgets.
    manifest: true,
    rollupOptions: {
      // The other pages of the app: the presenter view window that "Present with notes" opens (a plain page, no router)
      // and the headless page the server draws design pages on for image export (no UI).
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        'presenter-view': fileURLToPath(new URL('./presenter-view.html', import.meta.url)),
        render: fileURLToPath(new URL('./render.html', import.meta.url)),
      },
      output: {
        // The editor's entry module gets a recognisable file name: scripts/bundleReport.mjs finds the chunk by it.
        chunkFileNames: (chunk) => (chunk.moduleIds.some((id) => id.endsWith('/src/editor/index.tsx')) ? 'assets/editor-[hash].js' : 'assets/[name]-[hash].js'),
        // Fabric is the editor's one large dependency (about 300 kB): in its own chunk it is cached across releases
        // of the app and only downloaded together with the editor.
        manualChunks: (id) => (id.includes('/node_modules/fabric/') ? 'fabric' : undefined),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
