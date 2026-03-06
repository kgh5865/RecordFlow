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

export async function runWorkflow(
  win: BrowserWindow | null,
  steps: WorkflowStep[],
  options?: { headless?: boolean; folderVariables?: FolderVariable[] }
): Promise<RunnerResult> {
  const headless = options?.headless ?? false
  const folderVars = options?.folderVariables ?? []
  const browser = await chromium.launch({ headless })
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
    await browser.close()
  }
}

async function executeStep(page: Page, step: WorkflowStep, folderVars: FolderVariable[]): Promise<void> {
  switch (step.action) {
    case 'navigate':
      if (step.url) await page.goto(step.url)
      break

    case 'click': {
      const locator = resolveFromRaw(page, step.rawLine, /\.click\(/)
      await locator.click()
      break
    }

    case 'fill': {
      const fillValue = step.value != null ? await resolveValue(step.value, folderVars) : ''
      const locator = resolveFromRaw(page, step.rawLine, /\.fill\(/)
      await locator.fill(fillValue)
      break
    }

    case 'select': {
      const selectValue = step.value != null ? await resolveValue(step.value, folderVars) : ''
      const locator = resolveFromRaw(page, step.rawLine, /\.selectOption\(/)
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
        const locator = resolveFromRaw(page, step.rawLine, /\.press\(/)
        await locator.press(key)
      } else {
        await page.keyboard.press(key)
      }
      break
    }
  }
}

// locator 표현식에 허용되지 않는 패턴 (코드 인젝션 방지)
const LOCATOR_FORBIDDEN = [/\beval\b/, /\bFunction\b/, /\brequire\b/, /\bimport\b/, /\bprocess\b/, /\bglobal\b/, /;/, /\n/]

// rawLine에서 locator 체인 부분을 추출하여 실행
// e.g. "page.getByRole('button', { name: '...' }).click()" → page.getByRole(...)
// e.g. "page.locator('a').filter({ hasText: '...' }).first().click()" → page.locator('a').filter(...).first()
function resolveFromRaw(page: Page, rawLine: string | undefined, actionPattern: RegExp): Locator {
  if (!rawLine) throw new Error('rawLine이 없습니다. 워크플로우를 다시 녹화해주세요.')

  // rawLine에서 action 부분(.click(), .fill('...') 등) 제거하여 locator 체인만 추출
  const actionIdx = rawLine.search(actionPattern)
  const locatorExpr = actionIdx > 0 ? rawLine.substring(0, actionIdx) : rawLine

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
async function resolveValue(value: string, folderVars: FolderVariable[] = []): Promise<string> {
  // {{var:key}} 패턴 — 폴더 변수 치환 (인라인, 텍스트와 혼합 가능)
  let resolved = value.replace(
    /\{\{var:\s*(.+?)\s*\}\}/g,
    (_match, key) => {
      const v = folderVars.find((fv) => fv.key === key)
      if (!v) throw new Error(`폴더 변수 "${key}"을 찾을 수 없습니다. 폴더 변수 설정을 확인하세요.`)
      return v.value
    }
  )

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

