import type { BrowserWindow } from 'electron'
import { createRequire } from 'module'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'
import { join } from 'path'
import { unlink, stat, readFile } from 'fs/promises'
import type {
  WorkflowStep,
  ReRecordPhase,
  ReRecordStateResponse,
  ReRecordStartRequest,
  ReRecordSessionEndedEvent,
  ReRecordStopRecordingResponse,
  ReRecordCommitResponse
} from '../../types/workflow.types'
import { executeStep } from './runner.service'
import { loadStorage } from './storage.service'
import { parse as parseCodegen } from './parser.service'

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

const MAX_URL_LENGTH = 4096

let session: Session | null = null

function pushProgress(win: BrowserWindow, current: number, total: number): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send('re-record:auto-progress', { current, total })
  }
}

function isValidUrl(url: string): boolean {
  if (url.length > MAX_URL_LENGTH) return false
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

/**
 * 브라우저 조작이 끝나 사용자가 앱에서 다음 동작을 골라야 하는 시점에 앱 창을 앞으로 올린다.
 * Windows는 백그라운드 앱의 focus() 요청을 무시하는 경우가 있어 잠깐 always-on-top으로 띄운다.
 */
function focusApp(win: BrowserWindow): void {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.setAlwaysOnTop(true)
  win.show()
  win.setAlwaysOnTop(false)
  win.focus()
}

function stateResponse(): ReRecordStateResponse {
  if (!session) throw new Error('세션이 존재하지 않습니다')
  // recording 중에는 사용자가 브라우저에서 조작해야 하므로 앱을 올리지 않는다
  if (session.phase !== 'recording') focusApp(session.win)
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
    originalSteps: [...workflow.steps],
    finalSteps: [],
    cursor: 0,
    phase: 'phase0-auto'
  }

  const attachPageListeners = (p: Page): void => {
    p.on('framenavigated', () => { if (session) session.activePage = p })
    p.on('load', () => { if (session) session.activePage = p })
    p.on('close', () => {
      if (session && session.activePage === p) {
        const pages = session.context.pages()
        if (pages.length > 0) session.activePage = pages[pages.length - 1]
      }
    })
  }
  context.on('page', (newPage) => {
    if (session) session.activePage = newPage
    attachPageListeners(newPage)
  })
  attachPageListeners(page)

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
  if (session.phase !== 'phase1') {
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

export async function startRecording(): Promise<ReRecordStateResponse> {
  if (!session) throw new Error('세션이 존재하지 않습니다')
  if (session.phase !== 'phase1' && session.phase !== 'phase2' && session.phase !== 'error') {
    throw new Error(`startRecording은 phase1/phase2/error에서만 호출 가능 (현재: ${session.phase})`)
  }

  const outputFile = join(tmpdir(), `recordflow-rr-${randomUUID()}.ts`)
  session.recorderOutputFile = outputFile

  try {
    await (session.context as any)._enableRecorder({
      language: 'javascript',
      mode: 'recording',
      outputFile
    })
  } catch (err) {
    throw new Error(`Recorder 시작 실패 (Playwright 버전 호환성 문제일 수 있습니다): ${String(err)}`)
  }

  session.phase = 'recording'
  return stateResponse()
}

async function waitForFileFlush(path: string, timeoutMs: number): Promise<void> {
  const start = Date.now()
  let lastSize = -1
  let stableCount = 0
  while (Date.now() - start < timeoutMs) {
    try {
      const st = await stat(path)
      if (st.size === lastSize && st.size > 0) {
        stableCount++
        if (stableCount >= 2) return
      } else {
        stableCount = 0
        lastSize = st.size
      }
    } catch {
      // 파일 아직 없음
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  console.warn(`[re-record] waitForFileFlush 타임아웃 (${timeoutMs}ms), 마지막 크기: ${lastSize}`)
}

export async function stopRecording(): Promise<ReRecordStopRecordingResponse> {
  if (!session) throw new Error('세션이 존재하지 않습니다')
  if (session.phase !== 'recording') {
    throw new Error(`stopRecording은 recording에서만 호출 가능 (현재: ${session.phase})`)
  }
  if (!session.recorderOutputFile) {
    throw new Error('recorderOutputFile이 설정되지 않음')
  }

  try {
    await (session.context as any)._disableRecorder()
  } catch (err) {
    console.error('[re-record] _disableRecorder 실패:', err)
  }

  await waitForFileFlush(session.recorderOutputFile, 2000)

  let newSteps: WorkflowStep[] = []
  try {
    const code = await readFile(session.recorderOutputFile, 'utf-8')
    newSteps = parseCodegen(code)
  } catch (err) {
    session.phase = 'error'
    session.lastError = { stepIndex: session.cursor, message: `녹화 코드 파싱 실패: ${String(err)}` }
    return { ...stateResponse(), newSteps: [] } as ReRecordStopRecordingResponse
  }

  unlink(session.recorderOutputFile).catch(() => { /* noop */ })
  session.recorderOutputFile = undefined

  for (const s of newSteps) {
    session.finalSteps.push({ ...s, _origin: 'recorded' })
  }

  session.phase = session.cursor < session.originalSteps.length ? 'phase2' : 'commit'
  session.lastError = undefined

  return { ...stateResponse(), newSteps } as ReRecordStopRecordingResponse
}

export async function includeStep(): Promise<ReRecordStateResponse> {
  if (!session) throw new Error('세션이 존재하지 않습니다')
  if (session.phase !== 'phase2' && session.phase !== 'error') {
    throw new Error(`includeStep은 phase2에서만 호출 가능 (현재: ${session.phase})`)
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
    session.phase = session.cursor >= session.originalSteps.length ? 'commit' : 'phase2'
    session.lastError = undefined
  } catch (err) {
    session.phase = 'error'
    session.lastError = { stepIndex: session.cursor, message: String(err) }
  }
  return stateResponse()
}

export async function includeAllRemaining(): Promise<ReRecordStateResponse> {
  if (!session) throw new Error('세션이 존재하지 않습니다')
  if (session.phase !== 'phase2' && session.phase !== 'error') {
    throw new Error(`includeAll은 phase2에서만 호출 가능 (현재: ${session.phase})`)
  }

  while (session.cursor < session.originalSteps.length) {
    const step = session.originalSteps[session.cursor]
    try {
      await executeStep(session.activePage, step, [])
      session.finalSteps.push({ ...step, _origin: 'original' })
      session.cursor++
    } catch (err) {
      session.phase = 'error'
      session.lastError = { stepIndex: session.cursor, message: String(err) }
      return stateResponse()
    }
  }
  session.phase = 'commit'
  session.lastError = undefined
  return stateResponse()
}

export async function skipStep(): Promise<ReRecordStateResponse> {
  if (!session) throw new Error('세션이 존재하지 않습니다')
  if (session.phase !== 'phase2') {
    throw new Error(`skipStep은 phase2에서만 호출 가능 (현재: ${session.phase})`)
  }
  session.cursor++
  session.phase = session.cursor >= session.originalSteps.length ? 'commit' : 'phase2'
  return stateResponse()
}

export async function retryStep(): Promise<ReRecordStateResponse> {
  if (!session) throw new Error('세션이 존재하지 않습니다')
  if (session.phase !== 'error' || !session.lastError) {
    throw new Error(`retryStep은 error 상태에서만 호출 가능`)
  }

  const step = session.originalSteps[session.lastError.stepIndex]
  if (!step) {
    session.phase = 'phase2'
    session.lastError = undefined
    return stateResponse()
  }

  try {
    await executeStep(session.activePage, step, [])
    session.finalSteps.push({ ...step, _origin: 'original' })
    session.cursor = session.lastError.stepIndex + 1
    session.phase = session.cursor >= session.originalSteps.length ? 'commit'
      : (session.finalSteps.some((s) => s._origin === 'recorded') ? 'phase2' : 'phase1')
    session.lastError = undefined
  } catch (err) {
    session.lastError = { stepIndex: session.lastError.stepIndex, message: String(err) }
  }
  return stateResponse()
}

export function getCommitCandidates(): ReRecordCommitResponse {
  if (!session) throw new Error('세션이 존재하지 않습니다')
  return { finalSteps: session.finalSteps }
}

export async function finalizeCommit(): Promise<void> {
  await cleanupSession()
}
