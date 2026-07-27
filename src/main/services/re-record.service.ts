import type { BrowserWindow } from 'electron'
import { createRequire } from 'module'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'
import { join } from 'path'
import { unlink } from 'fs/promises'
import type {
  WorkflowStep,
  ReRecordPhase,
  ReRecordStateResponse,
  ReRecordStartRequest,
  ReRecordSessionEndedEvent
} from '../../types/workflow.types'
import { executeStep } from './runner.service'
import { loadStorage } from './storage.service'

const _require = createRequire(import.meta.url)
const { chromium } = _require('playwright')

type Browser = import('playwright').Browser
type BrowserContext = import('playwright').BrowserContext
type Page = import('playwright').Page

interface Session {
  sessionId: string
  workflowId: string
  win: BrowserWindow
  browser: Browser
  context: BrowserContext
  activePage: Page
  originalSteps: WorkflowStep[]
  finalSteps: Array<WorkflowStep & { _origin: 'original' | 'recorded' }>
  cursor: number
  phase: ReRecordPhase
  lastError?: { stepIndex: number; message: string }
  recorderOutputFile?: string
}

let session: Session | null = null

function pushProgress(win: BrowserWindow, current: number, total: number): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send('re-record:auto-progress', { current, total })
  }
}

function isValidUrl(url: string): boolean {
  try {
    const p = new URL(url)
    return p.protocol === 'http:' || p.protocol === 'https:'
  } catch {
    return false
  }
}

async function cleanupSession(): Promise<void> {
  if (!session) return
  const s = session
  session = null
  try { await s.browser.close() } catch { /* noop */ }
  if (s.recorderOutputFile) {
    unlink(s.recorderOutputFile).catch(() => { /* noop */ })
  }
}

function pushSessionEnded(win: BrowserWindow, evt: ReRecordSessionEndedEvent): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send('re-record:session-ended', evt)
  }
}

function stateResponse(): ReRecordStateResponse {
  if (!session) throw new Error('세션이 존재하지 않습니다')
  return {
    phase: session.phase,
    cursor: session.cursor,
    totalOriginal: session.originalSteps.length,
    nextStep: session.originalSteps[session.cursor],
    lastError: session.lastError
  }
}

export async function startSession(
  win: BrowserWindow,
  req: ReRecordStartRequest
): Promise<ReRecordStateResponse> {
  if (!isValidUrl(req.url)) throw new Error(`올바르지 않은 URL입니다: ${req.url}`)
  if (session) await cleanupSession()

  const storage = loadStorage()
  const workflow = storage.workflows?.find((w) => w.id === req.workflowId)
  if (!workflow) throw new Error(`워크플로우를 찾을 수 없습니다: ${req.workflowId}`)

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  session = {
    sessionId: randomUUID(),
    workflowId: req.workflowId,
    win,
    browser,
    context,
    activePage: page,
    originalSteps: workflow.steps,
    finalSteps: [],
    cursor: 0,
    phase: 'phase0-auto'
  }

  browser.on('disconnected', () => {
    if (session) {
      pushSessionEnded(session.win, { reason: 'browser-closed' })
      cleanupSession().catch(() => { /* noop */ })
    }
  })

  await page.goto(req.url)

  // Phase 0: stopAtIndex까지 자동 실행 (-1이면 스킵)
  if (req.stopAtIndex >= 0) {
    for (let i = 0; i <= req.stopAtIndex && i < workflow.steps.length; i++) {
      const step = workflow.steps[i]
      pushProgress(win, i + 1, req.stopAtIndex + 1)
      try {
        await executeStep(session.activePage, step, [])
        session.finalSteps.push({ ...step, _origin: 'original' })
        session.cursor = i + 1
      } catch (err) {
        session.phase = 'error'
        session.lastError = { stepIndex: i, message: String(err) }
        return stateResponse()
      }
    }
    session.phase = 'phase1'
  } else {
    session.phase = 'phase1'
  }

  return stateResponse()
}

export async function cancelSession(): Promise<void> {
  await cleanupSession()
}

export function hasSession(): boolean {
  return session !== null
}

export async function nextStep(): Promise<ReRecordStateResponse> {
  if (!session) throw new Error('세션이 존재하지 않습니다')
  if (session.phase !== 'phase1' && session.phase !== 'error') {
    throw new Error(`nextStep은 phase1에서만 호출 가능 (현재: ${session.phase})`)
  }
  if (session.cursor >= session.originalSteps.length) {
    session.phase = 'commit'
    return stateResponse()
  }

  const step = session.originalSteps[session.cursor]
  try {
    await executeStep(session.activePage, step, [])
    session.finalSteps.push({ ...step, _origin: 'original' })
    session.cursor++
    session.phase = 'phase1'
    session.lastError = undefined
  } catch (err) {
    session.phase = 'error'
    session.lastError = { stepIndex: session.cursor, message: String(err) }
  }
  return stateResponse()
}
