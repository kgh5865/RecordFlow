import { existsSync } from 'fs'
import { spawn } from 'child_process'
import { app } from 'electron'
import { createRequire } from 'module'
import { join, dirname } from 'path'

// createRequire로 런타임 require 생성 → Rollup이 추적하지 못해 번들에 포함 안 됨
const _require = createRequire(import.meta.url)
const { chromium } = _require('playwright')

export async function isChromiumInstalled(): Promise<boolean> {
  try {
    const execPath = chromium.executablePath()
    return existsSync(execPath)
  } catch {
    return false
  }
}

export function installChromium(onLog: (msg: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    // playwright 1.58+에서 cli.js가 exports에 미등록 → 직접 경로 구성
    const playwrightDir = dirname(_require.resolve('playwright/package.json'))
    const playwrightCli = join(playwrightDir, 'cli.js')
    const proc = spawn(process.execPath, [playwrightCli, 'install', 'chromium'], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      shell: false
    })

    proc.stdout?.on('data', (d: Buffer) => onLog(d.toString()))
    proc.stderr?.on('data', (d: Buffer) => onLog(d.toString()))
    proc.on('close', (code: number | null) => {
      if (code === 0) resolve()
      else reject(new Error(`playwright install chromium 실패 (exit code: ${code})`))
    })
    proc.on('error', reject)
  })
}
