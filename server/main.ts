import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname } from 'node:path'
import { isLocalHost, parsePath } from './api.ts'
import { getApp } from './app.ts'
import { parsePort } from './env.ts'
import { resolveStatic } from './static.ts'

const DIST = 'dist'
const PORT = parsePort(process.env.PORT)

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

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; frame-ancestors 'none'",
}

const api = getApp()

const serveStatic = (req: IncomingMessage, res: ServerResponse) => {
  const pathname = parsePath(req.url)
  if (pathname === null) {
    res.writeHead(400, SECURITY_HEADERS).end('Bad request')
    return
  }
  const file = resolveStatic(DIST, pathname)
  if (!file) {
    res.writeHead(404, SECURITY_HEADERS).end('Not found')
    return
  }
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
}

createServer((req, res) => {
  if (!isLocalHost(req.headers.host, PORT)) {
    res.writeHead(403, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8' })
      .end(JSON.stringify({ error: 'Недопустимый Host' }))
    return
  }
  api(req, res, () => serveStatic(req, res))
}).listen(PORT, '127.0.0.1', () => console.log(`API: http://127.0.0.1:${PORT}`))
