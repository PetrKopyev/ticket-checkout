import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { isLocalHost, parsePath } from './api.ts'
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

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "frame-ancestors 'none'",
}

const api = getApp()

const isFile = (path: string) => existsSync(path) && statSync(path).isFile()

const serveStatic = (req: IncomingMessage, res: ServerResponse) => {
  const pathname = parsePath(req.url)
  if (pathname === null) {
    res.writeHead(400, SECURITY_HEADERS).end('Bad request')
    return
  }
  const path = join(DIST, normalize(pathname))
  const file = isFile(path) ? path : join(DIST, 'index.html')
  if (!isFile(file)) {
    res.writeHead(404, SECURITY_HEADERS).end('Not found')
    return
  }
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
}

createServer((req, res) => {
  if (!isLocalHost(req.headers.host, PORT)) {
    res.writeHead(403).end('Forbidden')
    return
  }
  api(req, res, () => serveStatic(req, res))
}).listen(PORT, '127.0.0.1', () => console.log(`API: http://127.0.0.1:${PORT}`))
