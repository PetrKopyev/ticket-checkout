import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveStatic } from './static.ts'

let dist: string

beforeEach(() => {
  dist = mkdtempSync(join(tmpdir(), 'sqoch-dist-'))
  mkdirSync(join(dist, 'assets'))
  writeFileSync(join(dist, 'index.html'), '<!doctype html>')
  writeFileSync(join(dist, 'assets', 'app.js'), '')
})

afterEach(() => {
  rmSync(dist, { recursive: true, force: true })
})

describe('resolveStatic', () => {
  it('отдаёт существующий файл', () => {
    expect(resolveStatic(dist, '/assets/app.js')).toBe(join(dist, 'assets', 'app.js'))
  })

  it('путь без расширения — index.html', () => {
    expect(resolveStatic(dist, '/')).toBe(join(dist, 'index.html'))
    expect(resolveStatic(dist, '/campaigns/5')).toBe(join(dist, 'index.html'))
  })

  it('нет файла с расширением — null, а не index.html', () => {
    expect(resolveStatic(dist, '/assets/old.js')).toBeNull()
    expect(resolveStatic(dist, '/favicon.ico')).toBeNull()
  })

  it('без index.html — null', () => {
    rmSync(join(dist, 'index.html'))
    expect(resolveStatic(dist, '/campaigns')).toBeNull()
  })
})
