import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { apiPlugin } from './server/vitePlugin.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), apiPlugin()],
  server: { cors: false },
  preview: { cors: false },
})
