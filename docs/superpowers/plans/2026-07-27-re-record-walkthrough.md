# Re-record 워크스루 방식 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 Re-record 기능을 "자동 재생 워크스루 → 지정 지점부터 녹화 → 남은 스텝 개별 리뷰(포함/건너뛰기)" 방식으로 재설계 구현.

**Architecture:** main 프로세스에 신규 `re-record.service.ts`가 Playwright 브라우저 세션을 소유(단일 세션). Playwright 내부 API `_enableRecorder`/`_disableRecorder`로 같은 컨텍스트에서 recorder attach/detach. runner.service.ts의 `executeStep`을 export하여 재사용. 렌더러는 Phase 라우팅 상태 머신 기반 다이얼로그로 재작성, 서브 패널 파일들로 분리(300줄 규약 준수).

**Tech Stack:** Electron 33 + React 18 + TypeScript + Zustand + Playwright 1.58.2 (`_enableRecorder` private API)

**Spec:** [2026-07-27-re-record-walkthrough-design.md](../specs/2026-07-27-re-record-walkthrough-design.md)

**Verification:** 프로젝트에 자동 테스트 인프라 없음. 각 task는 `npm run build`(TS 타입체크)로 정적 검증하고, UI/통합은 `npm run dev` + 수동 시나리오로 확인.

---

## Task 1: Playwright 버전 정확 고정

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (npm install로 자동 갱신)

**Rationale (spec R1):** 현재 `^1.49.0` caret이나 실제 설치는 1.58.2. `_enableRecorder` API 시그니처는 1.58.2 기준으로 검증됐으므로 정확 고정.

- [ ] **Step 1: package.json에서 caret 제거 및 1.58.2로 통일**

`package.json`에서 아래 3개 항목을 수정:
```json
"@playwright/test": "1.58.2",
"playwright": "1.58.2",
"playwright-core": "1.58.2",
```

- [ ] **Step 2: 의존성 재설치**

```bash
npm install
```

Expected: package-lock.json이 갱신되고 `node_modules/playwright/package.json`의 version이 `1.58.2` 그대로 유지됨.

- [ ] **Step 3: 확인**

```bash
grep '"version"' node_modules/playwright/package.json
```

Expected: `"version": "1.58.2"`

- [ ] **Step 4: 커밋**

```bash
git add package.json package-lock.json
git commit -m "chore: Playwright 관련 패키지 1.58.2 정확 고정 (_enableRecorder API 호환성)"
```

---

## Task 2: runner.service.ts에서 executeStep export

**Files:**
- Modify: `src/main/services/runner.service.ts`

**Rationale:** re-record.service.ts가 executeStep을 재사용해야 함. 현재 파일 내부에만 정의됨.

- [ ] **Step 1: executeStep과 resolveValue를 export**

`src/main/services/runner.service.ts:77` 근처, `async function executeStep(...)` 선언 앞에 `export` 추가:

```typescript
export async function executeStep(page: Page, step: WorkflowStep, folderVars: FolderVariable[]): Promise<void> {
```

같은 파일 `src/main/services/runner.service.ts:176` 근처의 `resolveValue`도 export:

```typescript
export async function resolveValue(value: string, folderVars: FolderVariable[] = []): Promise<string> {
```

`Page` 타입 import는 파일 최상단에 이미 있으므로 재사용. `Page` 타입을 외부에서도 사용할 수 있게 export하지 않아도 됨 (re-record.service.ts에서 자체 import).

- [ ] **Step 2: 타입체크**

```bash
npm run build
```

Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/main/services/runner.service.ts
git commit -m "refactor: runner.service.ts의 executeStep, resolveValue export"
```

---

## Task 3: workflow.types.ts에 Re-record 관련 타입 추가

**Files:**
- Modify: `src/types/workflow.types.ts`

**Rationale:** main-렌더러 IPC 데이터 계약을 명시. 렌더러에서 phase, session 응답 등을 타입 안전하게 사용.

- [ ] **Step 1: 파일 끝에 타입 정의 추가**

`src/types/workflow.types.ts` 파일 끝에 다음 추가:

```typescript
// --- Re-record ---
export type ReRecordPhase =
  | 'phase0-auto'
  | 'phase1'
  | 'recording'
  | 'phase2'
  | 'commit'
  | 'error'

export interface ReRecordStartRequest {
  workflowId: string
  url: string
  /** -1 = 자동 실행 스킵하고 바로 녹화, 0..N = 해당 인덱스까지(포함) 실행 */
  stopAtIndex: number
}

export interface ReRecordStepInfo {
  /** originalSteps 기준 인덱스 (Phase 1/2가 다음 처리할 스텝) */
  index: number
  step: WorkflowStep
}

export interface ReRecordStateResponse {
  phase: ReRecordPhase
  cursor: number
  totalOriginal: number
  nextStep?: WorkflowStep
  lastError?: { stepIndex: number; message: string }
}

export interface ReRecordStopRecordingResponse extends ReRecordStateResponse {
  newSteps: WorkflowStep[]
}

export interface ReRecordCommitResponse {
  /** _origin 표시가 붙은 최종 후보 스텝들 (렌더러가 Commit UI에서 필터링) */
  finalSteps: Array<WorkflowStep & { _origin: 'original' | 'recorded' }>
}

export interface ReRecordProgressEvent {
  current: number
  total: number
}

export interface ReRecordSessionEndedEvent {
  reason: 'browser-closed' | 'error' | 'cancelled'
  message?: string
}
```

- [ ] **Step 2: 타입체크**

```bash
npm run build
```

Expected: 에러 없음 (아직 참조 없으므로 통과).

- [ ] **Step 3: 커밋**

```bash
git add src/types/workflow.types.ts
git commit -m "types: Re-record 세션 관련 IPC 계약 타입 추가"
```

---

## Task 4: re-record.service.ts 뼈대 + 세션 시작/취소

**Files:**
- Create: `src/main/services/re-record.service.ts`

**Rationale:** 세션 라이프사이클(생성/취소/정리)과 기본 상태를 먼저 구축. 이후 task에서 Phase별 로직 추가.

- [ ] **Step 1: 파일 생성 (뼈대 + start + cancel)**

`src/main/services/re-record.service.ts` 생성:

```typescript
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

  // 원본 workflow 조회
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

  // 브라우저 강제 종료 감지
  browser.on('disconnected', () => {
    if (session) {
      pushSessionEnded(session.win, { reason: 'browser-closed' })
      cleanupSession().catch(() => { /* noop */ })
    }
  })

  // 첫 페이지 이동
  await page.goto(req.url)

  return stateResponse()
}

export async function cancelSession(): Promise<void> {
  await cleanupSession()
}

export function hasSession(): boolean {
  return session !== null
}
```

- [ ] **Step 2: 타입체크**

```bash
npm run build
```

Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/main/services/re-record.service.ts
git commit -m "feat: re-record.service.ts 뼈대 및 세션 시작/취소 구현"
```

---

## Task 5: Phase 0 자동 실행 로직

**Files:**
- Modify: `src/main/services/re-record.service.ts`

**Rationale:** startSession 이후 stopAtIndex까지 순차 실행. 진행률 push. 실패 시 error phase.

- [ ] **Step 1: startSession 함수 하단에 자동 실행 로직 추가**

`src/main/services/re-record.service.ts`의 `startSession` 내부 `return stateResponse()` 앞에 아래를 삽입 (page.goto 다음):

```typescript
  // Phase 0: stopAtIndex까지 자동 실행 (-1이면 스킵)
  if (req.stopAtIndex >= 0) {
    const folderVars = getWorkflowFolderVariables(req.workflowId)
    for (let i = 0; i <= req.stopAtIndex && i < workflow.steps.length; i++) {
      const step = workflow.steps[i]
      pushProgress(win, i + 1, req.stopAtIndex + 1)
      try {
        await executeStep(session.activePage, step, folderVars)
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
    // -1: 자동 실행 없이 바로 recording (Task 7에서 recording 진입 함수 호출로 대체됨. 여기서는 phase만 세팅)
    session.phase = 'phase1'
    // 렌더러가 phase1을 받으면 곧바로 startRecording을 호출하도록 UX 계층에서 처리
  }
```

- [ ] **Step 2: 헬퍼 함수 추가**

파일 상단(session 변수 선언 다음)에 헬퍼 추가:

```typescript
function pushProgress(win: BrowserWindow, current: number, total: number): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send('re-record:auto-progress', { current, total })
  }
}

function getWorkflowFolderVariables(_workflowId: string): import('../../types/workflow.types').FolderVariable[] {
  // Workflow는 스케줄 폴더의 변수를 사용하지 않으므로 빈 배열
  // (스케줄만 folderVariables를 참조. 재녹화는 워크플로우 대상이므로 no vars)
  return []
}
```

또한 import 라인에 `FolderVariable`이 필요하면 확장. (위 함수는 lazy import로 처리했으므로 불필요)

- [ ] **Step 3: 타입체크**

```bash
npm run build
```

Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/main/services/re-record.service.ts
git commit -m "feat: Phase 0 자동 실행 로직 및 진행률 push 이벤트"
```

---

## Task 6: Phase 1 next 함수

**Files:**
- Modify: `src/main/services/re-record.service.ts`

- [ ] **Step 1: nextStep 함수 추가**

파일 하단에 export:

```typescript
export async function nextStep(): Promise<ReRecordStateResponse> {
  if (!session) throw new Error('세션이 존재하지 않습니다')
  if (session.phase !== 'phase1' && session.phase !== 'error') {
    throw new Error(`nextStep은 phase1에서만 호출 가능 (현재: ${session.phase})`)
  }
  if (session.cursor >= session.originalSteps.length) {
    // 더 실행할 스텝 없음: commit phase로 전환
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
```

- [ ] **Step 2: 타입체크**

```bash
npm run build
```

Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/main/services/re-record.service.ts
git commit -m "feat: Phase 1 nextStep 함수 (한 스텝씩 실행)"
```

---

## Task 7: Recording — enable/disable + flush 폴링 + 파싱

**Files:**
- Modify: `src/main/services/re-record.service.ts`

**Rationale (spec P2):** `_enableRecorder`로 recorder attach, `_disableRecorder`로 flush 트리거, 파일 크기 폴링(2초)으로 flush 완료 대기 후 parse.

- [ ] **Step 1: startRecording 함수 추가**

파일 하단에 추가:

```typescript
export async function startRecording(): Promise<ReRecordStateResponse> {
  if (!session) throw new Error('세션이 존재하지 않습니다')
  if (session.phase !== 'phase1' && session.phase !== 'phase2' && session.phase !== 'error') {
    throw new Error(`startRecording은 phase1/phase2/error에서만 호출 가능 (현재: ${session.phase})`)
  }

  const outputFile = join(tmpdir(), `recordflow-rr-${randomUUID()}.ts`)
  session.recorderOutputFile = outputFile

  try {
    // Playwright private API: context._enableRecorder
    // 시그니처 참조: playwright-core 1.58.2 lib/client/browserContext.js:469
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
```

- [ ] **Step 2: stopRecording 함수 추가 (flush 폴링 + parse)**

```typescript
import { stat, readFile } from 'fs/promises'
import { parse as parseCodegen } from './parser.service'
import type { ReRecordStopRecordingResponse } from '../../types/workflow.types'
```

(import 라인은 파일 상단에 병합)

파일 하단에 함수 추가:

```typescript
async function waitForFileFlush(path: string, timeoutMs: number): Promise<void> {
  const start = Date.now()
  let lastSize = -1
  let stableCount = 0
  while (Date.now() - start < timeoutMs) {
    try {
      const st = await stat(path)
      if (st.size === lastSize && st.size > 0) {
        stableCount++
        if (stableCount >= 2) return // 200ms 동안 크기 안 바뀌면 안정
      } else {
        stableCount = 0
        lastSize = st.size
      }
    } catch {
      // 파일 아직 없음
    }
    await new Promise((r) => setTimeout(r, 100))
  }
}

export async function stopRecording(): Promise<ReRecordStopRecordingResponse> {
  if (!session) throw new Error('세션이 존재하지 않습니다')
  if (session.phase !== 'recording') {
    throw new Error(`stopRecording은 recording에서만 호출 가능 (현재: ${session.phase})`)
  }
  if (!session.recorderOutputFile) {
    throw new Error('recorderOutputFile이 설정되지 않음')
  }

  // Playwright private API: context._disableRecorder → dispose 경로에서 flush 트리거
  try {
    await (session.context as any)._disableRecorder()
  } catch (err) {
    // _disableRecorder가 없거나 실패해도 파일 폴링은 시도
    console.error('[re-record] _disableRecorder 실패:', err)
  }

  // 파일 flush 대기 (최대 2초)
  await waitForFileFlush(session.recorderOutputFile, 2000)

  let newSteps: WorkflowStep[] = []
  try {
    const code = await readFile(session.recorderOutputFile, 'utf-8')
    newSteps = parseCodegen(code)
  } catch (err) {
    // 파싱 실패: error phase로 전환
    session.phase = 'error'
    session.lastError = { stepIndex: session.cursor, message: `녹화 코드 파싱 실패: ${String(err)}` }
    return { ...stateResponse(), newSteps: [] } as ReRecordStopRecordingResponse
  }

  // 임시 파일 정리
  unlink(session.recorderOutputFile).catch(() => { /* noop */ })
  session.recorderOutputFile = undefined

  // finalSteps에 append
  for (const s of newSteps) {
    session.finalSteps.push({ ...s, _origin: 'recorded' })
  }

  // Phase 2로 전환 (남은 원본 스텝 리뷰). 남은 게 없으면 commit로.
  session.phase = session.cursor < session.originalSteps.length ? 'phase2' : 'commit'
  session.lastError = undefined

  return { ...stateResponse(), newSteps } as ReRecordStopRecordingResponse
}
```

- [ ] **Step 3: 타입체크**

```bash
npm run build
```

Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/main/services/re-record.service.ts
git commit -m "feat: Recording 시작/종료 (_enableRecorder + flush 폴링 + 파싱)"
```

---

## Task 8: Phase 2 include / include-all / skip

**Files:**
- Modify: `src/main/services/re-record.service.ts`

- [ ] **Step 1: includeStep / includeAll / skipStep 함수 추가**

파일 하단에 추가:

```typescript
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
```

- [ ] **Step 2: 타입체크**

```bash
npm run build
```

Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/main/services/re-record.service.ts
git commit -m "feat: Phase 2 include/includeAll/skip 함수"
```

---

## Task 9: retry + activePage 추적

**Files:**
- Modify: `src/main/services/re-record.service.ts`

- [ ] **Step 1: retryStep 함수 추가**

파일 하단에 추가:

```typescript
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
```

- [ ] **Step 2: activePage 추적 설정 (startSession에서 리스너 등록)**

`startSession` 함수의 `session = { ... }` 블록 뒤, `browser.on('disconnected')` 앞에 추가:

```typescript
  // 활성 페이지 추적: 새 페이지 열림 / 네비게이션 / 닫힘
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
```

- [ ] **Step 3: 타입체크**

```bash
npm run build
```

Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/main/services/re-record.service.ts
git commit -m "feat: retry 및 activePage 추적 (탭 이동/새 창 대응)"
```

---

## Task 10: commit 함수

**Files:**
- Modify: `src/main/services/re-record.service.ts`

**Rationale:** commit은 세션 상태를 렌더러에 반환만 함. 실제 workflow 저장은 렌더러의 workflowStore에서 처리(기존 패턴 유지). 그 후 세션 정리.

- [ ] **Step 1: getCommitCandidates + finalizeCommit 함수 추가**

```typescript
import type { ReRecordCommitResponse } from '../../types/workflow.types'
```
(import 라인 병합)

파일 하단에 추가:

```typescript
export function getCommitCandidates(): ReRecordCommitResponse {
  if (!session) throw new Error('세션이 존재하지 않습니다')
  return { finalSteps: session.finalSteps }
}

export async function finalizeCommit(): Promise<void> {
  await cleanupSession()
}
```

- [ ] **Step 2: 타입체크**

```bash
npm run build
```

Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/main/services/re-record.service.ts
git commit -m "feat: Commit 후보 조회 및 세션 종료 함수"
```

---

## Task 11: IPC 등록 (ipc-handlers + preload + ipc.service)

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/services/ipc.service.ts`

- [ ] **Step 1: ipc-handlers.ts에 re-record 핸들러 추가**

`src/main/ipc-handlers.ts` 상단 import에 추가:

```typescript
import * as reRecord from './services/re-record.service'
import type { ReRecordStartRequest } from '../types/workflow.types'
```

`registerIpcHandlers` 함수 안, 다른 handler 블록 뒤에 아래 섹션 추가:

```typescript
  // --- Re-record IPC ---

  ipcMain.handle('re-record:start', async (_event, req: ReRecordStartRequest) => {
    try {
      if (!req || typeof req.workflowId !== 'string' || typeof req.url !== 'string' || typeof req.stopAtIndex !== 'number') {
        throw new Error('Invalid re-record:start payload')
      }
      const win = getMainWindow()
      if (!win) throw new Error('Main window unavailable')
      return await reRecord.startSession(win, req)
    } catch (err) {
      console.error('[IPC] re-record:start error:', err)
      throw err
    }
  })

  ipcMain.handle('re-record:next', async () => {
    try { return await reRecord.nextStep() }
    catch (err) { console.error('[IPC] re-record:next error:', err); throw err }
  })

  ipcMain.handle('re-record:start-recording', async () => {
    try { return await reRecord.startRecording() }
    catch (err) { console.error('[IPC] re-record:start-recording error:', err); throw err }
  })

  ipcMain.handle('re-record:stop-recording', async () => {
    try { return await reRecord.stopRecording() }
    catch (err) { console.error('[IPC] re-record:stop-recording error:', err); throw err }
  })

  ipcMain.handle('re-record:include', async () => {
    try { return await reRecord.includeStep() }
    catch (err) { console.error('[IPC] re-record:include error:', err); throw err }
  })

  ipcMain.handle('re-record:include-all', async () => {
    try { return await reRecord.includeAllRemaining() }
    catch (err) { console.error('[IPC] re-record:include-all error:', err); throw err }
  })

  ipcMain.handle('re-record:skip', async () => {
    try { return await reRecord.skipStep() }
    catch (err) { console.error('[IPC] re-record:skip error:', err); throw err }
  })

  ipcMain.handle('re-record:retry', async () => {
    try { return await reRecord.retryStep() }
    catch (err) { console.error('[IPC] re-record:retry error:', err); throw err }
  })

  ipcMain.handle('re-record:commit-candidates', () => {
    try { return reRecord.getCommitCandidates() }
    catch (err) { console.error('[IPC] re-record:commit-candidates error:', err); throw err }
  })

  ipcMain.handle('re-record:finalize', async () => {
    try { await reRecord.finalizeCommit() }
    catch (err) { console.error('[IPC] re-record:finalize error:', err); throw err }
  })

  ipcMain.handle('re-record:cancel', async () => {
    try { await reRecord.cancelSession() }
    catch (err) { console.error('[IPC] re-record:cancel error:', err); throw err }
  })
```

- [ ] **Step 2: preload/index.ts 확장**

`src/preload/index.ts`의 `ALLOWED_LISTENER_CHANNELS` set에 항목 추가:

```typescript
  're-record:auto-progress',
  're-record:session-ended'
```

`contextBridge.exposeInMainWorld('electronAPI', { ... })` 객체에 이어서 (Updater 섹션 뒤) import 추가:

```typescript
import type {
  ReRecordStartRequest,
  ReRecordStateResponse,
  ReRecordStopRecordingResponse,
  ReRecordCommitResponse,
  ReRecordProgressEvent,
  ReRecordSessionEndedEvent
} from '../types/workflow.types'
```
(파일 상단 import에 병합)

객체 안에 추가 (Updater 섹션 뒤):

```typescript
  // Re-record
  reRecordStart: (req: ReRecordStartRequest): Promise<ReRecordStateResponse> =>
    ipcRenderer.invoke('re-record:start', req),

  reRecordNext: (): Promise<ReRecordStateResponse> =>
    ipcRenderer.invoke('re-record:next'),

  reRecordStartRecording: (): Promise<ReRecordStateResponse> =>
    ipcRenderer.invoke('re-record:start-recording'),

  reRecordStopRecording: (): Promise<ReRecordStopRecordingResponse> =>
    ipcRenderer.invoke('re-record:stop-recording'),

  reRecordInclude: (): Promise<ReRecordStateResponse> =>
    ipcRenderer.invoke('re-record:include'),

  reRecordIncludeAll: (): Promise<ReRecordStateResponse> =>
    ipcRenderer.invoke('re-record:include-all'),

  reRecordSkip: (): Promise<ReRecordStateResponse> =>
    ipcRenderer.invoke('re-record:skip'),

  reRecordRetry: (): Promise<ReRecordStateResponse> =>
    ipcRenderer.invoke('re-record:retry'),

  reRecordGetCommitCandidates: (): Promise<ReRecordCommitResponse> =>
    ipcRenderer.invoke('re-record:commit-candidates'),

  reRecordFinalize: (): Promise<void> =>
    ipcRenderer.invoke('re-record:finalize'),

  reRecordCancel: (): Promise<void> =>
    ipcRenderer.invoke('re-record:cancel'),

  onReRecordAutoProgress: (cb: (evt: ReRecordProgressEvent) => void): void => {
    ipcRenderer.removeAllListeners('re-record:auto-progress')
    ipcRenderer.on('re-record:auto-progress', (_e, evt) => cb(evt))
  },

  onReRecordSessionEnded: (cb: (evt: ReRecordSessionEndedEvent) => void): void => {
    ipcRenderer.removeAllListeners('re-record:session-ended')
    ipcRenderer.on('re-record:session-ended', (_e, evt) => cb(evt))
  },
```

- [ ] **Step 3: renderer/services/ipc.service.ts 확장**

파일 전체를 다음으로 교체:

```typescript
import type {
  WorkflowStep,
  ReRecordStartRequest,
  ReRecordStateResponse,
  ReRecordStopRecordingResponse,
  ReRecordCommitResponse
} from '../../types/workflow.types'

export const ipc = {
  startCodegen: (url: string) => window.electronAPI.startCodegen(url),
  stopCodegen: () => window.electronAPI.stopCodegen(),
  startRunner: (steps: WorkflowStep[]) => window.electronAPI.startRunner(steps),
  removeAllListeners: (channel: string) => window.electronAPI.removeAllListeners(channel),

  // Re-record
  rrStart: (req: ReRecordStartRequest): Promise<ReRecordStateResponse> =>
    window.electronAPI.reRecordStart(req),
  rrNext: (): Promise<ReRecordStateResponse> =>
    window.electronAPI.reRecordNext(),
  rrStartRecording: (): Promise<ReRecordStateResponse> =>
    window.electronAPI.reRecordStartRecording(),
  rrStopRecording: (): Promise<ReRecordStopRecordingResponse> =>
    window.electronAPI.reRecordStopRecording(),
  rrInclude: (): Promise<ReRecordStateResponse> =>
    window.electronAPI.reRecordInclude(),
  rrIncludeAll: (): Promise<ReRecordStateResponse> =>
    window.electronAPI.reRecordIncludeAll(),
  rrSkip: (): Promise<ReRecordStateResponse> =>
    window.electronAPI.reRecordSkip(),
  rrRetry: (): Promise<ReRecordStateResponse> =>
    window.electronAPI.reRecordRetry(),
  rrGetCommitCandidates: (): Promise<ReRecordCommitResponse> =>
    window.electronAPI.reRecordGetCommitCandidates(),
  rrFinalize: (): Promise<void> =>
    window.electronAPI.reRecordFinalize(),
  rrCancel: (): Promise<void> =>
    window.electronAPI.reRecordCancel(),
}
```

- [ ] **Step 4: electronAPI 타입 정의 확장**

`src/renderer/types/electron.d.ts` 또는 `src/preload/electron.d.ts` (프로젝트 컨벤션 확인 후) 있으면 위 electronAPI 필드들의 타입 시그니처를 추가. 파일이 없으면 `window.electronAPI` 접근 시 TS가 any로 인식하므로 스킵 가능. 이 프로젝트는 preload 타입이 별도 declaration 파일 없이 사용됨을 build 결과로 확인. 만약 build에서 타입 에러가 나면 별도 declaration 추가 필요.

- [ ] **Step 5: 타입체크**

```bash
npm run build
```

Expected: 에러 없음. 만약 `window.electronAPI` 관련 에러가 나면 `src/renderer/env.d.ts` 등에 declaration 추가.

- [ ] **Step 6: 커밋**

```bash
git add src/main/ipc-handlers.ts src/preload/index.ts src/renderer/services/ipc.service.ts
git commit -m "feat: Re-record IPC 채널 12개 등록 (main/preload/renderer)"
```

---

## Task 12: 렌더러 세션 훅 useReRecordSession

**Files:**
- Create: `src/renderer/components/dialogs/rerecord/useReRecordSession.ts`
- Create: `src/renderer/components/dialogs/rerecord/types.ts`

- [ ] **Step 1: types.ts 생성**

`src/renderer/components/dialogs/rerecord/types.ts`:

```typescript
import type { WorkflowStep, ReRecordStateResponse } from '../../../../types/workflow.types'

export type ViewState =
  | { view: 'phase0-select'; url: string; stopAtIndex: number }
  | { view: 'phase0-running'; current: number; total: number }
  | { view: 'phase1'; state: ReRecordStateResponse }
  | { view: 'recording' }
  | { view: 'phase2'; state: ReRecordStateResponse }
  | { view: 'commit'; candidates: Array<WorkflowStep & { _origin: 'original' | 'recorded' }>; excluded: Set<string> }
  | { view: 'error'; state: ReRecordStateResponse }
```

- [ ] **Step 2: useReRecordSession 훅 생성**

`src/renderer/components/dialogs/rerecord/useReRecordSession.ts`:

```typescript
import { useEffect, useState, useCallback } from 'react'
import { ipc } from '../../../services/ipc.service'
import type { ViewState } from './types'
import type { WorkflowStep } from '../../../../types/workflow.types'

export function useReRecordSession(originalSteps: WorkflowStep[]) {
  const [view, setView] = useState<ViewState>({
    view: 'phase0-select',
    url: originalSteps[0]?.action === 'navigate' && originalSteps[0].url ? originalSteps[0].url : 'https://',
    stopAtIndex: originalSteps.length - 1
  })

  // Phase 0 진행률 리스너
  useEffect(() => {
    window.electronAPI.onReRecordAutoProgress((evt) => {
      setView((v) => v.view === 'phase0-running' ? { view: 'phase0-running', current: evt.current, total: evt.total } : v)
    })
    window.electronAPI.onReRecordSessionEnded((evt) => {
      // 브라우저 강제 종료 등: 다이얼로그를 상위에서 닫도록 신호. 여기서는 view만 리셋.
      if (evt.reason !== 'cancelled') {
        setView({ view: 'error', state: { phase: 'error', cursor: 0, totalOriginal: originalSteps.length, lastError: { stepIndex: 0, message: evt.message ?? evt.reason } } })
      }
    })
    return () => {
      ipc.removeAllListeners('re-record:auto-progress')
      ipc.removeAllListeners('re-record:session-ended')
    }
  }, [originalSteps.length])

  const applyState = useCallback((state: import('../../../../types/workflow.types').ReRecordStateResponse) => {
    if (state.phase === 'phase1') setView({ view: 'phase1', state })
    else if (state.phase === 'phase2') setView({ view: 'phase2', state })
    else if (state.phase === 'commit') void loadCommit()
    else if (state.phase === 'error') setView({ view: 'error', state })
    else if (state.phase === 'recording') setView({ view: 'recording' })
  }, [])

  const loadCommit = useCallback(async () => {
    const { finalSteps } = await ipc.rrGetCommitCandidates()
    setView({ view: 'commit', candidates: finalSteps, excluded: new Set() })
  }, [])

  const start = useCallback(async (url: string, stopAtIndex: number, workflowId: string) => {
    setView({ view: 'phase0-running', current: 0, total: stopAtIndex + 1 })
    const state = await ipc.rrStart({ workflowId, url, stopAtIndex })
    // -1인 경우 즉시 recording 진입
    if (stopAtIndex === -1) {
      const recState = await ipc.rrStartRecording()
      applyState(recState)
    } else {
      applyState(state)
    }
  }, [applyState])

  const next = useCallback(async () => applyState(await ipc.rrNext()), [applyState])
  const startRec = useCallback(async () => applyState(await ipc.rrStartRecording()), [applyState])
  const stopRec = useCallback(async () => applyState(await ipc.rrStopRecording()), [applyState])
  const include = useCallback(async () => applyState(await ipc.rrInclude()), [applyState])
  const includeAll = useCallback(async () => applyState(await ipc.rrIncludeAll()), [applyState])
  const skip = useCallback(async () => applyState(await ipc.rrSkip()), [applyState])
  const retry = useCallback(async () => applyState(await ipc.rrRetry()), [applyState])
  const cancel = useCallback(async () => { await ipc.rrCancel() }, [])
  const finalize = useCallback(async () => { await ipc.rrFinalize() }, [])

  const toggleExcluded = useCallback((stepId: string) => {
    setView((v) => {
      if (v.view !== 'commit') return v
      const next = new Set(v.excluded)
      if (next.has(stepId)) next.delete(stepId); else next.add(stepId)
      return { ...v, excluded: next }
    })
  }, [])

  const updateSelectStopAt = useCallback((stopAtIndex: number) => {
    setView((v) => v.view === 'phase0-select' ? { ...v, stopAtIndex } : v)
  }, [])

  const updateSelectUrl = useCallback((url: string) => {
    setView((v) => v.view === 'phase0-select' ? { ...v, url } : v)
  }, [])

  return {
    view, setView,
    start, next, startRec, stopRec, include, includeAll, skip, retry, cancel, finalize,
    toggleExcluded, updateSelectStopAt, updateSelectUrl
  }
}
```

- [ ] **Step 3: 타입체크**

```bash
npm run build
```

Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/renderer/components/dialogs/rerecord/
git commit -m "feat: useReRecordSession 훅 및 ViewState 타입"
```

---

## Task 13: Phase0SelectPanel + Phase0RunningPanel

**Files:**
- Create: `src/renderer/components/dialogs/rerecord/Phase0SelectPanel.tsx`
- Create: `src/renderer/components/dialogs/rerecord/Phase0RunningPanel.tsx`

- [ ] **Step 1: Phase0SelectPanel.tsx 생성**

```typescript
import { Input } from '../../ui/Input'
import type { WorkflowStep } from '../../../../types/workflow.types'

interface Props {
  workflowName: string
  originalSteps: WorkflowStep[]
  url: string
  stopAtIndex: number
  onUrlChange: (url: string) => void
  onStopAtChange: (idx: number) => void
  onStart: () => void
  onCancel: () => void
}

export function Phase0SelectPanel(props: Props) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-[#aaa]">
        기존 워크플로우를 자동 재생한 뒤 지정 지점부터 새로 녹화합니다.
      </p>
      <div>
        <label className="block text-[11px] text-[#aaa] mb-1">시작 URL</label>
        <Input value={props.url} onChange={(e) => props.onUrlChange(e.target.value)} placeholder="https://example.com" />
      </div>
      <div>
        <label className="block text-[11px] text-[#aaa] mb-1">어디까지 자동 실행할까요?</label>
        <div className="max-h-56 overflow-y-auto border border-[#333] rounded p-1 flex flex-col gap-0.5">
          <label className="flex items-center gap-2 px-2 py-1 hover:bg-[#2a2a2a] cursor-pointer text-xs text-[#e8ab6a]">
            <input type="radio" name="rr-stopat" checked={props.stopAtIndex === -1} onChange={() => props.onStopAtChange(-1)} />
            🔴 자동 실행 없이 바로 녹화
          </label>
          {props.originalSteps.map((step, i) => (
            <label key={step.id} className="flex items-center gap-2 px-2 py-1 hover:bg-[#2a2a2a] cursor-pointer text-xs text-[#ccc]">
              <input type="radio" name="rr-stopat" checked={props.stopAtIndex === i} onChange={() => props.onStopAtChange(i)} />
              <span className="text-[#777] w-6 text-right">{i + 1}.</span>
              <span className="text-[#89b4fa] w-14">{step.action}</span>
              <span className="truncate flex-1">{step.selector ?? step.url ?? ''}</span>
              {step.value != null && <span className="text-[#a6e3a1] truncate">"{step.value}"</span>}
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={props.onCancel} className="px-3 py-1 text-xs rounded bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]">취소</button>
        <button onClick={props.onStart} disabled={!props.url.startsWith('http')} className="px-3 py-1 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white disabled:opacity-40">▶ 시작</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Phase0RunningPanel.tsx 생성**

```typescript
interface Props {
  current: number
  total: number
  onCancel: () => void
}

export function Phase0RunningPanel(props: Props) {
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-[#cccccc]">{props.current} / {props.total} 스텝 자동 실행 중...</p>
      <button onClick={props.onCancel} className="px-3 py-1 text-xs rounded bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]">취소</button>
    </div>
  )
}
```

- [ ] **Step 3: 타입체크**

```bash
npm run build
```

Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/renderer/components/dialogs/rerecord/Phase0SelectPanel.tsx src/renderer/components/dialogs/rerecord/Phase0RunningPanel.tsx
git commit -m "feat: Phase 0 선택/실행 중 패널"
```

---

## Task 14: Phase1Panel + RecordingPanel

**Files:**
- Create: `src/renderer/components/dialogs/rerecord/Phase1Panel.tsx`
- Create: `src/renderer/components/dialogs/rerecord/RecordingPanel.tsx`

- [ ] **Step 1: Phase1Panel.tsx**

```typescript
import type { ReRecordStateResponse } from '../../../../types/workflow.types'

interface Props {
  state: ReRecordStateResponse
  onNext: () => void
  onRecord: () => void
  onCancel: () => void
}

export function Phase1Panel(props: Props) {
  const { cursor, totalOriginal, nextStep } = props.state
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-[#aaa]">Phase 1: 자동 재생 조정 ({cursor} / {totalOriginal} 실행 완료)</p>
      {nextStep ? (
        <div className="px-3 py-2 bg-[#1e1e1e] border border-[#333] rounded text-xs">
          <div className="text-[#aaa] mb-1">다음 실행 예정:</div>
          <div className="flex items-center gap-2">
            <span className="text-[#777]">{cursor + 1}.</span>
            <span className="text-[#89b4fa]">{nextStep.action}</span>
            <span className="text-[#ccc] truncate">{nextStep.selector ?? nextStep.url ?? ''}</span>
            {nextStep.value != null && <span className="text-[#a6e3a1] truncate">"{nextStep.value}"</span>}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-[#e8ab6a]">모든 스텝 실행 완료. 저장으로 진행하세요.</p>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={props.onCancel} className="px-3 py-1 text-xs rounded bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]">취소</button>
        <button onClick={props.onRecord} className="px-3 py-1 text-xs rounded bg-[#c62828] hover:bg-[#e53935] text-white">● 여기서부터 녹화</button>
        <button onClick={props.onNext} disabled={!nextStep} className="px-3 py-1 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white disabled:opacity-40">다음 ▶</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: RecordingPanel.tsx**

```typescript
interface Props {
  onStop: () => void
  onCancel: () => void
}

export function RecordingPanel(props: Props) {
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="text-2xl">🔴</div>
      <p className="text-sm text-[#cccccc]">브라우저에서 동작을 기록하는 중...</p>
      <p className="text-xs text-[#777]">완료했으면 아래 [녹화 완료] 버튼을 눌러주세요.</p>
      <div className="flex gap-2 mt-2">
        <button onClick={props.onCancel} className="px-3 py-1 text-xs rounded bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]">취소</button>
        <button onClick={props.onStop} className="px-3 py-1 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white">■ 녹화 완료</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 타입체크**

```bash
npm run build
```

Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/renderer/components/dialogs/rerecord/Phase1Panel.tsx src/renderer/components/dialogs/rerecord/RecordingPanel.tsx
git commit -m "feat: Phase 1 조정 패널 및 Recording 패널"
```

---

## Task 15: Phase2Panel + ErrorPanel

**Files:**
- Create: `src/renderer/components/dialogs/rerecord/Phase2Panel.tsx`
- Create: `src/renderer/components/dialogs/rerecord/ErrorPanel.tsx`

- [ ] **Step 1: Phase2Panel.tsx**

```typescript
import type { ReRecordStateResponse } from '../../../../types/workflow.types'

interface Props {
  state: ReRecordStateResponse
  onInclude: () => void
  onIncludeAll: () => void
  onSkip: () => void
  onRecord: () => void
  onCancel: () => void
}

export function Phase2Panel(props: Props) {
  const { cursor, totalOriginal, nextStep } = props.state
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-[#aaa]">Phase 2: 남은 스텝 리뷰 ({cursor + 1} / {totalOriginal})</p>
      {nextStep && (
        <div className="px-3 py-2 bg-[#1e1e1e] border border-[#333] rounded text-xs">
          <div className="text-[#aaa] mb-1">리뷰 중인 스텝:</div>
          <div className="flex items-center gap-2">
            <span className="text-[#777]">{cursor + 1}.</span>
            <span className="text-[#89b4fa]">{nextStep.action}</span>
            <span className="text-[#ccc] truncate">{nextStep.selector ?? nextStep.url ?? ''}</span>
            {nextStep.value != null && <span className="text-[#a6e3a1] truncate">"{nextStep.value}"</span>}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={props.onInclude} className="px-3 py-1 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white">✓ 포함</button>
        <button onClick={props.onIncludeAll} className="px-3 py-1 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white">✓✓ 모두 포함</button>
        <button onClick={props.onSkip} className="px-3 py-1 text-xs rounded bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]">✗ 건너뛰기</button>
        <button onClick={props.onRecord} className="px-3 py-1 text-xs rounded bg-[#c62828] hover:bg-[#e53935] text-white">● 여기서부터 녹화</button>
      </div>
      <div className="flex justify-end">
        <button onClick={props.onCancel} className="px-3 py-1 text-xs rounded bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]">취소</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: ErrorPanel.tsx**

```typescript
import type { ReRecordStateResponse } from '../../../../types/workflow.types'

interface Props {
  state: ReRecordStateResponse
  onRetry: () => void
  onRecord: () => void
  onCancel: () => void
}

export function ErrorPanel(props: Props) {
  const err = props.state.lastError
  return (
    <div className="flex flex-col gap-3">
      <div className="px-3 py-2 bg-[#3d1e1e] border border-[#8a3a3a] rounded text-xs">
        <div className="text-red-400 mb-1">⚠ 스텝 {err ? err.stepIndex + 1 : '?'} 실행 실패</div>
        <div className="text-[#ccc] whitespace-pre-wrap break-all">{err?.message ?? '알 수 없는 오류'}</div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={props.onCancel} className="px-3 py-1 text-xs rounded bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]">취소</button>
        <button onClick={props.onRecord} className="px-3 py-1 text-xs rounded bg-[#c62828] hover:bg-[#e53935] text-white">● 여기서부터 녹화</button>
        <button onClick={props.onRetry} className="px-3 py-1 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white">재시도</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 타입체크**

```bash
npm run build
```

Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/renderer/components/dialogs/rerecord/Phase2Panel.tsx src/renderer/components/dialogs/rerecord/ErrorPanel.tsx
git commit -m "feat: Phase 2 리뷰 패널 및 공통 ErrorPanel"
```

---

## Task 16: CommitPanel (미리보기 + 제외)

**Files:**
- Create: `src/renderer/components/dialogs/rerecord/CommitPanel.tsx`

- [ ] **Step 1: CommitPanel.tsx**

```typescript
import type { WorkflowStep } from '../../../../types/workflow.types'

type Candidate = WorkflowStep & { _origin: 'original' | 'recorded' }

interface Props {
  candidates: Candidate[]
  excluded: Set<string>
  onToggle: (stepId: string) => void
  onSave: () => void
  onCancel: () => void
}

export function CommitPanel(props: Props) {
  const includedCount = props.candidates.length - props.excluded.size
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-[#aaa]">저장 미리보기 (총 {includedCount} 스텝)</p>
      <div className="max-h-72 overflow-y-auto border border-[#333] rounded p-1 flex flex-col gap-0.5">
        {props.candidates.map((step, i) => {
          const isExcluded = props.excluded.has(step.id)
          return (
            <div key={step.id} className={`flex items-center gap-2 px-2 py-1 text-xs ${isExcluded ? 'opacity-40' : ''}`}>
              <span className="text-[#777] w-6 text-right">{i + 1}.</span>
              {step._origin === 'recorded' && <span className="text-[#e8ab6a] text-[10px]">(신규)</span>}
              <span className="text-[#89b4fa] w-14">{step.action}</span>
              <span className="text-[#ccc] truncate flex-1">{step.selector ?? step.url ?? ''}</span>
              {step.value != null && <span className="text-[#a6e3a1] truncate max-w-24">"{step.value}"</span>}
              <button
                onClick={() => props.onToggle(step.id)}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]"
                title={isExcluded ? '되돌리기' : '제외'}
              >
                {isExcluded ? '↩' : '✗'}
              </button>
            </div>
          )
        })}
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={props.onCancel} className="px-3 py-1 text-xs rounded bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]">취소</button>
        <button onClick={props.onSave} disabled={includedCount === 0} className="px-3 py-1 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white disabled:opacity-40">저장</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 타입체크**

```bash
npm run build
```

Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/renderer/components/dialogs/rerecord/CommitPanel.tsx
git commit -m "feat: Commit 미리보기 패널 (스텝 제외 가능)"
```

---

## Task 17: ReRecordDialog.tsx 전면 재작성 (라우터)

**Files:**
- Modify: `src/renderer/components/dialogs/ReRecordDialog.tsx`

- [ ] **Step 1: ReRecordDialog.tsx 전체 교체**

```typescript
import { useMemo } from 'react'
import { useUiStore } from '../../stores/uiStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { Dialog } from './_Dialog'
import { useReRecordSession } from './rerecord/useReRecordSession'
import { Phase0SelectPanel } from './rerecord/Phase0SelectPanel'
import { Phase0RunningPanel } from './rerecord/Phase0RunningPanel'
import { Phase1Panel } from './rerecord/Phase1Panel'
import { RecordingPanel } from './rerecord/RecordingPanel'
import { Phase2Panel } from './rerecord/Phase2Panel'
import { ErrorPanel } from './rerecord/ErrorPanel'
import { CommitPanel } from './rerecord/CommitPanel'

export function ReRecordDialog() {
  const { dialog, closeDialog } = useUiStore()
  const workflows = useWorkflowStore((s) => s.workflows)
  const replaceWorkflowSteps = useWorkflowStore((s) => s.replaceWorkflowSteps)

  const workflow = useMemo(() => {
    if (dialog.type !== 're-record') return null
    return workflows.find((w) => w.id === dialog.targetWorkflowId) ?? null
  }, [dialog, workflows])

  const originalSteps = workflow?.steps ?? []
  const session = useReRecordSession(originalSteps)

  if (dialog.type !== 're-record') { closeDialog(); return null }
  if (!workflow) { closeDialog(); return null }

  const handleCancel = async () => {
    if (session.view.view !== 'phase0-select') {
      try { await session.cancel() } catch { /* noop */ }
    }
    closeDialog()
  }

  const handleSave = async () => {
    if (session.view.view !== 'commit') return
    const finalSteps = session.view.candidates
      .filter((s) => !session.view.view || session.view.view === 'commit' ? !(session.view as any).excluded.has(s.id) : true)
      .map((s, i) => {
        const { _origin, ...rest } = s
        return { ...rest, order: i }
      })
    replaceWorkflowSteps(workflow.id, finalSteps)
    try { await session.finalize() } catch { /* noop */ }
    closeDialog()
  }

  const v = session.view

  return (
    <Dialog title={`Re-record: ${dialog.workflowName}`} onClose={handleCancel}>
      {v.view === 'phase0-select' && (
        <Phase0SelectPanel
          workflowName={dialog.workflowName}
          originalSteps={originalSteps}
          url={v.url}
          stopAtIndex={v.stopAtIndex}
          onUrlChange={session.updateSelectUrl}
          onStopAtChange={session.updateSelectStopAt}
          onStart={() => session.start(v.url, v.stopAtIndex, workflow.id)}
          onCancel={handleCancel}
        />
      )}
      {v.view === 'phase0-running' && (
        <Phase0RunningPanel current={v.current} total={v.total} onCancel={handleCancel} />
      )}
      {v.view === 'phase1' && (
        <Phase1Panel state={v.state} onNext={session.next} onRecord={session.startRec} onCancel={handleCancel} />
      )}
      {v.view === 'recording' && (
        <RecordingPanel onStop={session.stopRec} onCancel={handleCancel} />
      )}
      {v.view === 'phase2' && (
        <Phase2Panel state={v.state} onInclude={session.include} onIncludeAll={session.includeAll} onSkip={session.skip} onRecord={session.startRec} onCancel={handleCancel} />
      )}
      {v.view === 'error' && (
        <ErrorPanel state={v.state} onRetry={session.retry} onRecord={session.startRec} onCancel={handleCancel} />
      )}
      {v.view === 'commit' && (
        <CommitPanel candidates={v.candidates} excluded={v.excluded} onToggle={session.toggleExcluded} onSave={handleSave} onCancel={handleCancel} />
      )}
    </Dialog>
  )
}
```

- [ ] **Step 2: 타입체크**

```bash
npm run build
```

Expected: `replaceWorkflowSteps`가 workflowStore에 없으면 에러 발생. 다음 태스크에서 추가하므로 임시로 실패 예상.

만약 에러가 나면 스킵하고 Task 18 진행 후 다시 검증.

- [ ] **Step 3: 커밋 (Task 18 후 함께 커밋 가능하지만 파일 단위로 분리)**

Task 18 완료 후 통합 커밋 (Task 18의 Step 3 참조).

---

## Task 18: workflowStore에 replaceWorkflowSteps 추가 + useIpc.ts 정리

**Files:**
- Modify: `src/renderer/stores/workflowStore.ts`
- Modify: `src/renderer/hooks/useIpc.ts`

- [ ] **Step 1: workflowStore.ts에 replaceWorkflowSteps 액션 추가**

`src/renderer/stores/workflowStore.ts`의 store 인터페이스 및 create 블록에 액션 추가. 파일을 열어 store shape에 아래 형태로 추가 (기존 create() 블록 안에):

```typescript
  replaceWorkflowSteps: (workflowId: string, steps: WorkflowStep[]) => {
    set((state) => ({
      workflows: state.workflows.map((w) =>
        w.id === workflowId
          ? { ...w, steps, updatedAt: new Date().toISOString() }
          : w
      )
    }))
    get().persistToStorage()
  },
```

인터페이스에도 시그니처 추가:
```typescript
replaceWorkflowSteps: (workflowId: string, steps: WorkflowStep[]) => void
```

- [ ] **Step 2: useIpc.ts에서 기존 're-record' 완료 핸들러 제거**

`src/renderer/hooks/useIpc.ts:22-38`의 `else if (dialog.type === 're-record' && dialog.targetWorkflowId) { ... }` 블록 제거. 최종 코드는:

```typescript
    window.electronAPI.onCodegenComplete((steps: WorkflowStep[]) => {
      if (dialog.type === 'new-workflow' && dialog.targetFolderId) {
        const name = dialog.currentName ?? 'New Workflow'
        const workflow = createWorkflow(name, dialog.targetFolderId, steps)
        useUiStore.getState().selectWorkflow(workflow.id)
        closeDialog()
      }
    })
```

- [ ] **Step 3: 타입체크 및 커밋 (Task 17과 함께)**

```bash
npm run build
```

Expected: 에러 없음.

```bash
git add src/renderer/components/dialogs/ReRecordDialog.tsx src/renderer/components/dialogs/rerecord/ src/renderer/stores/workflowStore.ts src/renderer/hooks/useIpc.ts
git commit -m "feat: Re-record 다이얼로그 워크스루 방식으로 재작성"
```

---

## Task 19: 수동 QA 시나리오

**Files:**
- 없음 (실행 검증만)

**Rationale:** 자동 테스트 없으므로 각 시나리오를 실제 워크플로우로 재현.

- [ ] **Step 1: dev 서버 실행**

```bash
npm run dev
```

- [ ] **Step 2: 시나리오 A — 정상 흐름 (Phase 0 → Phase 1 다음 → Recording → Phase 2 스킵/포함 → Commit)**

1. 스텝 5개 이상인 워크플로우 준비 (없으면 간단한 것 하나 새로 녹화: 예 example.com → click, fill 등)
2. StepPanel의 [Re-record] 버튼 클릭
3. Phase 0 다이얼로그에서 시작 URL 확인, "여기까지" 3번째 스텝 선택 → [▶ 시작]
4. 브라우저가 열리고 3스텝까지 자동 실행되는지 확인
5. Phase 1 컨트롤 패널 표시 확인 → [다음 ▶] 한 번 클릭 (4번째 실행)
6. [● 여기서부터 녹화] 클릭 → RecordingPanel 표시
7. 브라우저에서 클릭/입력 2~3개 수행
8. [■ 녹화 완료] 클릭 → Phase 2 진입 확인
9. 남은 스텝을 [✗ 건너뛰기] 1번, [✓ 포함] 1번 실행
10. [✓✓ 모두 포함] 클릭 → Commit UI 진입 확인
11. 미리보기에 원래 4스텝(original) + 새 녹화 스텝(신규 라벨) + 포함된 나머지 확인
12. [✗] 버튼으로 하나 제외 → 카운트 감소 확인
13. [저장] 클릭 → 다이얼로그 닫히고 워크플로우 스텝이 갱신됨을 StepPanel에서 확인

- [ ] **Step 3: 시나리오 B — 즉시 녹화 옵션**

1. 워크플로우 선택 → Re-record
2. Phase 0에서 "🔴 자동 실행 없이 바로 녹화" 라디오 선택 → 시작
3. 브라우저가 URL로 이동만 하고 곧바로 Recording 상태 진입 확인
4. 몇 개 조작 후 완료 → Phase 2 진입 (원본 전체가 리뷰 대상)
5. [✓✓ 모두 포함] 또는 [✗ 건너뛰기 반복]으로 Commit
6. 결과: 기존 Re-record와 동등 동작 (모두 건너뛴 경우 새 녹화만 저장)

- [ ] **Step 4: 시나리오 C — Phase 1 실행 실패 → 여기서부터 녹화 폴백**

1. 워크플로우에 존재하지 않는 셀렉터 삽입해 실패 유도 (또는 사이트 UI 임의 변경)
2. Re-record → Phase 0에서 실패 지점 앞까지 선택 → 시작
3. Phase 1 [다음 ▶] 클릭해서 실패 유도
4. ErrorPanel 표시 확인, 에러 메시지 정확 표시
5. [● 여기서부터 녹화] 클릭 → Recording 진입
6. 대체 동작 녹화 후 완료 → Phase 2 → Commit
7. 결과: 실패 스텝은 finalSteps에 없고, 새 녹화가 대체됨

- [ ] **Step 5: 시나리오 D — 브라우저를 사용자가 X로 닫음**

1. Re-record 진행 중 브라우저 창을 직접 닫음
2. ErrorPanel 또는 다이얼로그 자동 닫힘 확인
3. 원본 워크플로우가 변경되지 않았음을 StepPanel에서 확인

- [ ] **Step 6: 시나리오 E — Phase 2에서 여기서부터 녹화 재진입**

1. 정상 시나리오 진행 중 Phase 2에서 [● 여기서부터 녹화] 클릭
2. Recording 진입 → 조작 → 완료
3. Phase 2 재개되어 나머지 원본 스텝 리뷰 계속 가능한지 확인
4. Commit 시 최종 = [Phase 0/1 실행분] + [1차 녹화] + [Phase 2에서 포함된 것들] + [2차 녹화] 순서 확인

- [ ] **Step 7: 이슈 발견 시 대응**

각 시나리오에서 발견된 버그는 별도 fix commit으로 처리. 근본 원인 파악 후 spec을 위배하지 않는 범위에서 수정. QA 통과 후 최종 커밋:

```bash
git commit --allow-empty -m "test: Re-record 워크스루 수동 QA 5개 시나리오 통과"
git push
```

---

## Self-Review (계획 작성 후)

**Spec 커버리지 체크**:
- Phase 0 다이얼로그 (즉시 녹화 옵션 포함): Task 13 ✓
- Phase 0 자동 실행 + 진행률: Task 5 ✓
- Phase 1 컨트롤 + [다음][여기서부터 녹화]: Task 6, 14 ✓
- Recording (enable/disable/flush/parse): Task 7 ✓
- Phase 2 (include/includeAll/skip/여기서부터 녹화 재진입): Task 8, 15 ✓
- ErrorPanel (retry/여기서부터 녹화/취소): Task 9, 15 ✓
- Commit 미리보기 + 제외: Task 10, 16 ✓
- activePage 추적: Task 9 ✓
- 세션 정리 (browser.close, unlink, disconnected 핸들러): Task 4, 9 ✓
- 단일 세션 정책 (기존 세션 자동 정리): Task 4 (`if (session) await cleanupSession()`) ✓
- Playwright 버전 고정: Task 1 ✓
- IPC 계약 12채널: Task 11 ✓
- 렌더러 상태 머신: Task 12 ✓

**타입 일관성 체크**:
- `ReRecordStateResponse.phase`는 `ReRecordPhase` union과 일치 ✓
- ipc.service의 함수 시그니처는 preload와 일치 ✓
- `_origin` 필드는 Task 3 타입에 정의, Task 4에서 push, Task 16 UI에서 필터 사용 ✓
- `replaceWorkflowSteps` 시그니처 (workflowId, steps) — Task 17에서 호출, Task 18에서 정의 ✓

**Placeholder 스캔**: 모든 step에 실제 코드 포함. TBD/추후/유사하게 없음. ✓
