import type { BrowserWindow } from 'electron'
import { createRequire } from 'module'
import type { WorkflowStep, RunnerResult, FolderVariable } from '../../types/workflow.types'
import { loadSettings } from './settings.service'

// createRequire로 런타임 require 생성 → Rollup이 추적하지 못해 번들에 포함 안 됨
const _require = createRequire(import.meta.url)
const { chromium } = _require('playwright')
const { expect } = _require('@playwright/test')

// playwright 타입만 import (빌드 시 제거됨)
type Page = import('playwright').Page
type Locator = import('playwright').Locator

// otplib v13: ESM-only, Rollup 번들링 우회를 위해 new Function 사용
const _import = new Function('specifier', 'return import(specifier)') as (s: string) => Promise<any>
let _generateSync: ((opts: { secret: string; guardrails: object }) => string) | null = null
let _guardrails: object | null = null
async function loadOtplib() {
  if (_generateSync) return _generateSync
  const [mod, core] = await Promise.all([_import('otplib'), _import('@otplib/core')])
  _generateSync = mod.generateSync
  // 일부 서비스가 10바이트(80비트) secret을 발급하므로 최소 제한을 1바이트로 완화
  _guardrails = core.createGuardrails({ MIN_SECRET_BYTES: 1 })
  return _generateSync
}

type RunOptions = { headless?: boolean; folderVariables?: FolderVariable[]; timeoutMs?: number }

// Playwright의 스텝별 타임아웃(기본 30s)은 chromium.launch()나 browser.close() 자체가
// 멈추는 경우를 못 잡는다. 그 경우 runWorkflow가 영원히 pending 상태로 남고,
// 스케줄러의 직렬 큐(동시성 1)가 통째로 막혀 이후 모든 스케줄이 조용히 죽는다.
// RECORDFLOW_RUN_TIMEOUT_MS 로 덮어쓸 수 있다 (watchdog 동작 확인용)
const RUN_TIMEOUT_MS = Number(process.env.RECORDFLOW_RUN_TIMEOUT_MS) || 10 * 60_000

export async function runWorkflow(
  win: BrowserWindow | null,
  steps: WorkflowStep[],
  options?: RunOptions
): Promise<RunnerResult> {
  const timeoutMs = options?.timeoutMs ?? RUN_TIMEOUT_MS
  const ctx: { browser: any; completedSteps: number } = { browser: null, completedSteps: 0 }
  let timer: ReturnType<typeof setTimeout> | undefined

  const watchdog = new Promise<RunnerResult>((resolve) => {
    timer = setTimeout(() => {
      // ponytail: launch() 자체가 멈춘 경우 ctx.browser가 없어 고아 chromium이 남을 수 있다.
      // 드물고 OS가 정리하므로 방치. 문제가 되면 launch를 pid 추적으로 감쌀 것.
      ctx.browser?.close().catch(() => {})
      resolve({
        success: false,
        error: `실행 시간 초과 (${Math.round(timeoutMs / 1000)}초) — 강제 종료`,
        completedSteps: ctx.completedSteps
      })
    }, timeoutMs)
  })

  try {
    return await Promise.race([runWorkflowInner(win, steps, options, ctx), watchdog])
  } finally {
    clearTimeout(timer)
  }
}

async function runWorkflowInner(
  win: BrowserWindow | null,
  steps: WorkflowStep[],
  options: RunOptions | undefined,
  ctx: { browser: any; completedSteps: number }
): Promise<RunnerResult> {
  const headless = options?.headless ?? false
  const folderVars = options?.folderVariables ?? []
  const browser = await chromium.launch({ headless })
  ctx.browser = browser
  const page = await browser.newPage()

  let completedSteps = 0

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      if (win && !win.isDestroyed()) {
        win.webContents.send('runner:step-update', i)
      }

      await executeStep(page, step, folderVars)
      completedSteps++
      ctx.completedSteps = completedSteps
    }

    // 마지막 스텝 완료 후 3초 대기 (결과 확인용)
    await page.waitForTimeout(3000)

    const result: RunnerResult = { success: true, completedSteps }
    if (win && !win.isDestroyed()) {
      win.webContents.send('runner:complete', result)
    }
    return result
  } catch (err) {
    // 에러 발생 시에도 3초 대기 (문제 확인용)
    await page.waitForTimeout(3000).catch(() => {})

    const result: RunnerResult = {
      success: false,
      error: String(err),
      completedSteps
    }
    if (win && !win.isDestroyed()) {
      win.webContents.send('runner:complete', result)
    }
    return result
  } finally {
    // close()도 멈출 수 있다. 30초 넘으면 그냥 포기 — 상위 watchdog이 결과를 이미 돌려줬거나 돌려줄 것이다.
    await Promise.race([
      browser.close().catch(() => {}),
      new Promise((r) => setTimeout(r, 30_000))
    ])
  }
}

export async function executeStep(page: Page, step: WorkflowStep, folderVars: FolderVariable[]): Promise<void> {
  switch (step.action) {
    case 'navigate':
      if (step.url) await page.goto(step.url)
      break

    case 'click': {
      const locator = resolveFromRaw(page, step.rawLine, /\.click\(/, step.selector)
      await locator.click()
      break
    }

    case 'fill': {
      const fillValue = step.value != null ? await resolveValue(step.value, folderVars) : ''
      const locator = resolveFromRaw(page, step.rawLine, /\.fill\(/, step.selector)
      await locator.fill(fillValue)
      break
    }

    case 'select': {
      const selectValue = step.value != null ? await resolveValue(step.value, folderVars) : ''
      const locator = resolveFromRaw(page, step.rawLine, /\.selectOption\(/, step.selector)
      await locator.selectOption(selectValue)
      break
    }

    case 'expect':
      if (step.url) {
        await expect(page).toHaveURL(step.url)
      }
      break

    case 'wait':
      if (step.selector) await page.waitForSelector(step.selector)
      break

    case 'press': {
      const key = step.value ?? 'Enter'
      if (step.selector) {
        const locator = resolveFromRaw(page, step.rawLine, /\.press\(/, step.selector)
        await locator.press(key)
      } else {
        await page.keyboard.press(key)
      }
      break
    }
  }
}

// locator 표현식에 허용되지 않는 패턴 (코드 인젝션 방지)
const LOCATOR_FORBIDDEN = [/\beval\b/, /\bFunction\b/, /\brequire\b/, /\bimport\b/, /\bprocess\b/, /\bglobal\b/, /\bconstructor\b/, /\b__proto__\b/, /\bprototype\b/, /\bthis\b/, /;/, /\n/]

// rawLine에서 locator 체인 부분을 추출하여 실행
// e.g. "page.getByRole('button', { name: '...' }).click()" → page.getByRole(...)
// e.g. "page.locator('a').filter({ hasText: '...' }).first().click()" → page.locator('a').filter(...).first()
// rawLine이 없는 경우(export 시 마스킹된 민감 스텝) selector 폴백 사용
function resolveFromRaw(page: Page, rawLine: string | undefined, actionPattern: RegExp, selectorFallback?: string): Locator {
  let locatorExpr: string

  if (rawLine) {
    // rawLine에서 action 부분(.click(), .fill('...') 등) 제거하여 locator 체인만 추출
    const actionIdx = rawLine.search(actionPattern)
    locatorExpr = actionIdx > 0 ? rawLine.substring(0, actionIdx) : rawLine
  } else if (selectorFallback) {
    // rawLine 없을 때: selector 앞에 page. 을 붙여 locator 표현식 구성
    locatorExpr = `page.${selectorFallback}`
  } else {
    throw new Error('rawLine이 없습니다. 워크플로우를 다시 녹화해주세요.')
  }

  // 허용 패턴 검증: page. 로 시작 + 금지 키워드 없음
  if (!locatorExpr.trimStart().startsWith('page.')) {
    throw new Error(`허용되지 않는 locator 표현식입니다. 워크플로우를 다시 녹화해주세요.`)
  }
  if (LOCATOR_FORBIDDEN.some((p) => p.test(locatorExpr))) {
    throw new Error(`허용되지 않는 locator 표현식입니다. 워크플로우를 다시 녹화해주세요.`)
  }

  const fn = new Function('page', `return ${locatorExpr}`)
  return fn(page) as Locator
}


// 날짜 포맷 헬퍼: YYYY, MM, DD, M, D 토큰을 치환
function formatDate(date: Date, format: string): string {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  return format
    .replace('YYYY', String(y))
    .replace('MM', String(m).padStart(2, '0'))
    .replace('DD', String(d).padStart(2, '0'))
    .replace('M', String(m))
    .replace('D', String(d))
}

// value 패턴 처리:
//   {{otp:프로필명}}              → OTP 프로필 secret으로 TOTP 코드 생성 (전체 값 매칭)
//   {{date:오프셋}} 또는 {{date:오프셋:포맷}} → 날짜 치환 (인라인, 텍스트와 혼합 가능)
export async function resolveValue(value: string, folderVars: FolderVariable[] = []): Promise<string> {
  // {{var:key}} 패턴 — 폴더 변수 치환 (인라인, 텍스트와 혼합 가능)
  let resolved = value.replace(
    /\{\{var:\s*(.+?)\s*\}\}/g,
    (_match, key) => {
      const v = folderVars.find((fv) => fv.key === key)
      if (!v) throw new Error(`폴더 변수 "${key}"을 찾을 수 없습니다. 폴더 변수 설정을 확인하세요.`)
      return v.value
    }
  )

  // 순환 참조 감지: 치환 결과에 {{var:...}} 패턴이 남아있으면 경고 (무한 루프 방지)
  if (/\{\{var:\s*.+?\s*\}\}/.test(resolved)) {
    console.warn(`[runner] 폴더 변수 순환 참조 감지: "${value}" → "${resolved}"`)
  }

  // {{otp:name}} 패턴 — 전체 값 매칭만 지원
  const otpMatch = resolved.match(/^\{\{otp:\s*(.+?)\s*\}\}$/)
  if (otpMatch) {
    const profileName = otpMatch[1]
    const settings = loadSettings()
    const profile = settings.otpProfiles.find((p) => p.name === profileName)
    if (!profile) throw new Error(`OTP 프로필 "${profileName}"을 찾을 수 없습니다. 설정에서 추가하세요.`)
    const generateSync = await loadOtplib()
    return generateSync!({ secret: profile.secret, guardrails: _guardrails! })
  }

  // {{date:offset}} 또는 {{date:offset:format}} 패턴 — 인라인 치환
  resolved = resolved.replace(
    /\{\{date:([+-]?\d+)(?::([^}]+))?\}\}/g,
    (_match, offsetStr, formatStr) => {
      const offset = parseInt(offsetStr, 10)
      const fmt = formatStr || 'YYYY-MM-DD'
      const d = new Date()
      d.setDate(d.getDate() + offset)
      return formatDate(d, fmt)
    }
  )

  return resolved
}

