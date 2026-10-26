import type { Plugin } from 'vite'
import { getApp } from './app.ts'

export const apiPlugin = (): Plugin => ({
  name: 'organizer-api',
  apply: () => !process.env.VITEST,
  configureServer: (server) => {
    server.middlewares.use(getApp())
  },
  configurePreviewServer: (server) => {
    server.middlewares.use(getApp())
  },
})
