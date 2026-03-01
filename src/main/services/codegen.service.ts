import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { readFileSync, existsSync, unlinkSync } from 'fs'
import type { BrowserWindow } from 'electron'
import { parse } from './parser.service'

let proc: ChildProcess | null = null

export function startCodegen(win: BrowserWindow, url: string): void {
  if (proc) {
    // 이미 실행 중이면 기존 프로세스 종료
    proc.kill()
    proc = null
  }

  const tmpFile = join(tmpdir(), `recordflow-${crypto.randomUUID()}.ts`)

  proc = spawn('npx', ['playwright', 'codegen', '--output', tmpFile, url], {
    env: { ...process.env, PWDEBUG: '0' },
    shell: true
  })

  proc.on('close', () => {
    proc = null

    if (existsSync(tmpFile)) {
      try {
        const tsCode = readFileSync(tmpFile, 'utf-8')
        const steps = parse(tsCode)
        unlinkSync(tmpFile)
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
