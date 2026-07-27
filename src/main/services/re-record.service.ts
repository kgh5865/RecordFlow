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

  return stateResponse()
}

export async function cancelSession(): Promise<void> {
  await cleanupSession()
}

export function hasSession(): boolean {
  return session !== null
}
