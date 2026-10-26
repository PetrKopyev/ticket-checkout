import { existsSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

const isFile = (path: string) => existsSync(path) && statSync(path).isFile()

// Файл из dist; путь без расширения — маршрут SPA, отдаём index.html. Нет файла — null (404).
export const resolveStatic = (dist: string, pathname: string) => {
  const path = join(dist, pathname)
  if (isFile(path)) return path
  const index = join(dist, 'index.html')
  return !extname(pathname) && isFile(index) ? index : null
}
