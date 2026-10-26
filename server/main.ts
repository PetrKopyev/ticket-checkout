import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { getApp } from './app.ts'

const DIST = 'dist'
const PORT = Number(process.env.PORT ?? 3001)

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}

const api = getApp()

const isFile = (path: string) => existsSync(path) && statSync(path).isFile()

createServer((req, res) => {
  api(req, res, () => {
    const path = join(DIST, normalize(new URL(req.url ?? '/', 'http://localhost').pathname))
    const file = isFile(path) ? path : join(DIST, 'index.html')
    if (!isFile(file)) {
      res.writeHead(404).end('Not found')
      return
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  })
}).listen(PORT, '127.0.0.1', () => console.log(`API: http://127.0.0.1:${PORT}`))
