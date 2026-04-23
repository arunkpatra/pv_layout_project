import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// Tauri expects the Vite dev server on a fixed port; matches tauri.conf.json.
const port = 1420

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port,
    strictPort: true,
    host: "127.0.0.1",
  },
  // Tauri injects TAURI_ENV_* at build/dev time; expose them alongside VITE_*.
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "esnext",
    minify: "esbuild",
    sourcemap: false,
    chunkSizeWarningLimit: 1024,
  },
})
