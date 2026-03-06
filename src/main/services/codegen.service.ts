import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { readFile, unlink } from 'fs/promises'
import { createRequire } from 'module'
import type { BrowserWindow } from 'electron'
import { parse } from './parser.service'

const _require = createRequire(import.meta.url)

/** playwright CLI 경로: exports에 cli.js가 없는 버전 대응 */
function resolvePlaywrightCli(): string {
  // package.json은 exports에 포함되어 있으므로 항상 resolve 가능
  const pkgPath = _require.resolve('playwright/package.json')
  return join(dirname(pkgPath), 'cli.js')
}

let proc: ChildProcess | null = null

/** http(s):// URL 형식인지 검증 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function startCodegen(win: BrowserWindow, url: string): void {
  if (!isValidUrl(url)) {
    win.webContents.send('codegen:error', `올바르지 않은 URL입니다: ${url}`)
    return
  }

  if (proc) {
    proc.kill()
    proc = null
  }

  const tmpFile = join(tmpdir(), `recordflow-${crypto.randomUUID()}.ts`)
  const playwrightCli = resolvePlaywrightCli()

  proc = spawn(process.execPath, [playwrightCli, 'codegen', '--output', tmpFile, url], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PWDEBUG: '0' },
    shell: false
  })

  proc.on('close', async () => {
    proc = null

    if (existsSync(tmpFile)) {
      try {
        const tsCode = await readFile(tmpFile, 'utf-8')
        const steps = parse(tsCode)
        unlink(tmpFile).catch(() => { /* 임시파일 삭제 실패는 무시 */ })
        win.webContents.send('codegen:complete', steps)
      } catch (err) {
        win.webContents.send('codegen:error', `Parse error: ${String(err)}`)
      }
    } else {
      // 파일 없음 = 아무 동작도 기록 안 함 → 빈 배열 전송
      win.webContents.send('codegen:complete', [])
    }
  })

  proc.on('error', (err) => {
    proc = null
    win.webContents.send('codegen:error', `Spawn error: ${err.message}`)
  })
}

export function stopCodegen(): void {
  if (proc) {
    proc.kill()
    proc = null
  }
}
