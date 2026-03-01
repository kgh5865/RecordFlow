# Design: Workflow Scheduler

**Feature ID**: workflow-scheduler
**Created**: 2026-02-28
**Status**: Design
**Plan Reference**: [workflow-scheduler.plan.md](../../01-plan/features/workflow-scheduler.plan.md)

---

## 1. 아키텍처 개요

기존 Main/Renderer 2-프로세스 구조에 SchedulerService와 SettingsService를 추가한다.
`node-cron`은 Node.js 환경(Main 프로세스)에서만 동작하므로 스케줄러 로직은 전적으로 Main에 위치한다.
Renderer는 IPC를 통해 스케줄 CRUD와 설정을 요청하며, Tray 상주는 backgroundMode 설정에 따라 조건부로 활성화된다.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Renderer Process (React + Zustand)                                 │
│  WorkflowPanel(탭)  SchedulePanel  ScheduleDialog  SettingsPanel    │
│         ↕ IPC (contextBridge + schedule:* / settings:* 채널)        │
├─────────────────────────────────────────────────────────────────────┤
│  Main Process (Node.js)                                             │
│  SchedulerService   SettingsService   RunnerService                 │
│       ↕                   ↕                ↕                        │
│  node-cron         settings.json      playwright                    │
│  schedules.json    (AppData)          (headless)                    │
│  schedule-logs.json                                                 │
│       ↕                                                             │
│  Electron Tray (backgroundMode=ON 시에만 생성)                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 디렉터리 구조 (신규/변경 파일)

```
RecordFlow/
├── src/
│   ├── types/
│   │   └── workflow.types.ts          # [수정] Schedule, ScheduleLog, AppSettings 추가
│   ├── main/
│   │   ├── index.ts                   # [수정] schedule/settings IPC 핸들러, Tray 로직 추가
│   │   └── services/
│   │       ├── scheduler.service.ts   # [신규] node-cron 기반 스케줄러 코어
│   │       └── settings.service.ts    # [신규] AppSettings (backgroundMode) 저장/로드
│   ├── preload/
│   │   └── index.ts                   # [수정] schedule:*/settings:* IPC 채널 노출
│   └── renderer/
│       ├── stores/
│       │   ├── scheduleStore.ts       # [신규] 스케줄 목록/선택 Zustand store
│       │   └── settingsStore.ts       # [신규] AppSettings Zustand store
│       └── components/
│           ├── layout/
│           │   └── WorkflowPanel.tsx  # [수정] 탭 전환 (Workflows / Schedules)
│           ├── schedule/
│           │   ├── SchedulePanel.tsx  # [신규] 스케줄 목록 좌측 패널
│           │   ├── ScheduleItem.tsx   # [신규] 스케줄 행 (토글, 다음 실행, 삭제)
│           │   ├── ScheduleDialog.tsx # [신규] 스케줄 생성/수정 다이얼로그
│           │   └── ScheduleDetail.tsx # [신규] 우측 패널: 선택 스케줄 정보 + 이력
│           └── settings/
│               └── SettingsPanel.tsx  # [신규] 설정 패널 (backgroundMode 토글)
```

---

## 3. 데이터 모델 확장

### 3-1. `workflow.types.ts` 추가 타입

```typescript
// --- Scheduler 타입 ---

export type ScheduleType = 'cron' | 'once'

export interface Schedule {
  id: string
  workflowId: string          // 대상 워크플로우 ID
  type: ScheduleType
  cronExpression?: string     // type='cron': "0 9 * * *"
  scheduledAt?: string        // type='once': ISO 8601 문자열
  enabled: boolean
  lastRunAt?: string
  nextRunAt?: string          // cron-parser로 계산한 다음 실행 시각
  createdAt: string
}

export interface ScheduleLog {
  id: string
  scheduleId: string
  workflowId: string
  workflowName: string
  startedAt: string
  finishedAt: string
  success: boolean
  completedSteps: number
  totalSteps: number
  error?: string
}

// --- Settings 타입 ---

export interface AppSettings {
  backgroundMode: boolean     // 기본값: false
}

// --- StorageData에 schedules 추가 ---

export interface StorageData {
  version: '1.0'
  folders: WorkflowFolder[]
  workflows: Workflow[]
  schedules: Schedule[]       // [추가]
}

// --- ElectronAPI 확장 ---

export interface ElectronAPI {
  // ... 기존 메서드 유지 ...

  // Schedule CRUD
  listSchedules: () => Promise<Schedule[]>
  createSchedule: (schedule: Omit<Schedule, 'id' | 'createdAt' | 'nextRunAt'>) => Promise<Schedule>
  updateSchedule: (id: string, patch: Partial<Schedule>) => Promise<Schedule>
  deleteSchedule: (id: string) => Promise<void>
  toggleSchedule: (id: string, enabled: boolean) => Promise<Schedule>
  getScheduleLogs: (scheduleId: string, limit?: number) => Promise<ScheduleLog[]>

  // Settings
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: AppSettings) => Promise<void>

  // Scheduler 이벤트 (Main → Renderer 푸시)
  onScheduleRun: (cb: (log: ScheduleLog) => void) => void
}
```

### 3-2. 저장 경로

| 데이터 | 파일 | 위치 |
|--------|------|------|
| Schedule 목록 | `workflows.json` (StorageData.schedules) | `%APPDATA%/RecordFlow/` |
| ScheduleLog | `schedule-logs.json` | `%APPDATA%/RecordFlow/` |
| AppSettings | `settings.json` | `%APPDATA%/RecordFlow/` |

---

## 4. IPC 채널 설계

| 채널 | 방향 | 핸들러 | 설명 |
|------|------|--------|------|
| `schedule:list` | Renderer→Main | `ipcMain.handle` | StorageData.schedules 반환 |
| `schedule:create` | Renderer→Main | `ipcMain.handle` | Schedule 신규 생성, nextRunAt 계산 |
| `schedule:update` | Renderer→Main | `ipcMain.handle` | 부분 수정 (cronExpression 변경 시 nextRunAt 재계산) |
| `schedule:delete` | Renderer→Main | `ipcMain.handle` | cron job 정지 후 삭제 |
| `schedule:toggle` | Renderer→Main | `ipcMain.handle` | enabled 토글, cron job 활성/비활성 |
| `schedule:logs` | Renderer→Main | `ipcMain.handle` | ScheduleLog 최근 N건 반환 |
| `settings:get` | Renderer→Main | `ipcMain.handle` | AppSettings 반환 |
| `settings:save` | Renderer→Main | `ipcMain.handle` | AppSettings 저장, Tray 조건부 생성/제거 |
| `schedule:run-event` | Main→Renderer | `win.webContents.send` | 스케줄 실행 완료 시 ScheduleLog 전달 |

---

## 5. SchedulerService 설계 (`scheduler.service.ts`)

```typescript
// 핵심 책임
// 1. 앱 시작 시 활성화된 모든 Schedule을 node-cron에 등록
// 2. CRUD 요청에 따라 cron job 동적 추가/제거/재등록
// 3. 실행 시 runWorkflow 호출 → ScheduleLog 기록
// 4. 'once' 타입은 실행 후 enabled=false로 자동 변경

interface SchedulerService {
  init(win: BrowserWindow, schedules: Schedule[]): void
  registerJob(win: BrowserWindow, schedule: Schedule): void
  unregisterJob(scheduleId: string): void
  restartJob(win: BrowserWindow, schedule: Schedule): void
  calcNextRunAt(cronExpression: string): string   // cron-parser 활용
  isValidCron(expression: string): boolean
}
```

**실행 흐름**:
```
app 시작
  → SchedulerService.init(win, StorageData.schedules)
    → enabled=true 스케줄 전체 node-cron 등록
      → cron 트리거 발생
        → runWorkflow(null, steps)  // headless=true 강제
          → ScheduleLog 생성 및 schedule-logs.json 저장
            → win.webContents.send('schedule:run-event', log)
              → lastRunAt / nextRunAt 업데이트 후 storage 저장
```

**큐 처리** (동시 실행 방지):
```typescript
// 실행 중인 스케줄 ID Set을 유지
const runningSet = new Set<string>()

// 실행 트리거 시
if (runningSet.has(schedule.id)) return   // 이전 실행이 완료되지 않으면 스킵
runningSet.add(schedule.id)
try { await runWorkflow(...) }
finally { runningSet.delete(schedule.id) }
```

---

## 6. SettingsService 설계 (`settings.service.ts`)

```typescript
// settings.json: { "backgroundMode": false }

export function loadSettings(): AppSettings
export function saveSettings(settings: AppSettings): void
```

---

## 7. Tray 조건부 상주 설계 (`main/index.ts` 수정)

```typescript
let tray: Tray | null = null

function setupTray(): void {
  if (tray) return   // 이미 생성됨
  tray = new Tray(join(__dirname, '../../resources/tray-icon.png'))
  const menu = Menu.buildFromTemplate([
    { label: 'RecordFlow 열기', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
  tray.setToolTip('RecordFlow')
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus() })
}

function destroyTray(): void {
  tray?.destroy()
  tray = null
}

// settings:save IPC 핸들러에서:
ipcMain.handle('settings:save', (_e, settings: AppSettings) => {
  saveSettings(settings)
  if (settings.backgroundMode) setupTray()
  else destroyTray()
})

// window close 이벤트 수정:
mainWindow.on('close', (event) => {
  const settings = loadSettings()
  if (settings.backgroundMode) {
    event.preventDefault()    // 창만 숨기고 앱은 유지
    mainWindow?.hide()
  }
  // backgroundMode=false면 기본 동작(종료) → Renderer에서 경고 처리
})
```

**트레이 아이콘**: `resources/tray-icon.png` (16×16 또는 32×32 PNG)

---

## 8. UI 컴포넌트 설계

### 8-1. WorkflowPanel.tsx 탭 전환 (수정)

```
┌──────────────────────────┐
│ [📂 Workflows] [⏰ Sched] │  ← 탭 헤더
├──────────────────────────┤
│ (탭에 따라 FolderTree     │
│  또는 SchedulePanel 표시) │
└──────────────────────────┘
```

- 탭 상태: `uiStore.activeLeftTab: 'workflows' | 'schedules'`

### 8-2. SchedulePanel.tsx (신규)

```
┌──────────────────────────┐
│ + 스케줄 추가             │  ← 버튼
├──────────────────────────┤
│ ◉ 매일 09:00             │  ← ScheduleItem
│   Login workflow          │
│   다음: 내일 09:00        │
├──────────────────────────┤
│ ○ 30분마다 (비활성)       │
│   Monitoring workflow     │
│   (비활성)                │
└──────────────────────────┘
```

### 8-3. ScheduleItem.tsx (신규)

| 요소 | 내용 |
|------|------|
| 토글 | enabled on/off (`schedule:toggle` IPC) |
| 타이틀 | cron 표현식 사람 표현 또는 예약 시각 |
| 서브텍스트 | 워크플로우 이름 + 다음 실행 시각 |
| 삭제 버튼 | 호버 시 표시, 확인 다이얼로그 포함 |

### 8-4. ScheduleDialog.tsx (신규)

**생성/수정 다이얼로그**:

```
┌─────────────────────────────────────┐
│ 스케줄 추가                          │
├─────────────────────────────────────┤
│ 워크플로우 [드롭다운]                │
│                                      │
│ 실행 유형  ● 반복  ○ 1회 예약        │
│                                      │
│ [반복 선택 시]                        │
│ 프리셋 [매 N분 ▼]                    │
│         매 N분 / 매시간 / 매일 HH:MM │
│         직접 입력                    │
│ Cron  [0 9 * * *      ]              │
│       → 다음 실행: 내일 09:00        │
│                                      │
│ [1회 예약 선택 시]                    │
│ 날짜/시간  [2026-03-01  09:00]       │
│                                      │
│              [취소] [저장]           │
└─────────────────────────────────────┘
```

**프리셋 목록**:

| 레이블 | cron 표현식 |
|--------|------------|
| 매 5분 | `*/5 * * * *` |
| 매 10분 | `*/10 * * * *` |
| 매 30분 | `*/30 * * * *` |
| 매시간 | `0 * * * *` |
| 매일 09:00 | `0 9 * * *` |
| 매일 자정 | `0 0 * * *` |
| 직접 입력 | (사용자 입력) |

### 8-5. ScheduleDetail.tsx (신규, 우측 패널)

- 선택된 스케줄의 워크플로우 step 표시 (기존 StepList 재활용)
- 하단: 최근 실행 이력 10건 표시

```
┌─────────────────────────────────────┐
│ Login workflow  ▶ 지금 실행          │
├─────────────────────────────────────┤
│ step 1: navigate ...                 │
│ step 2: fill ...                     │
├─────────────────────────────────────┤
│ 실행 이력                             │
│ ✅ 2026-02-28 09:00  3/3 steps  2.1s│
│ ✅ 2026-02-27 09:00  3/3 steps  1.9s│
│ ❌ 2026-02-26 09:00  1/3 steps  Err │
└─────────────────────────────────────┘
```

### 8-6. SettingsPanel.tsx (신규)

- Toolbar 또는 메뉴에서 접근 (⚙ 버튼)
- 우측 패널 영역에 인라인으로 표시

```
┌─────────────────────────────────────┐
│ 설정                                 │
├─────────────────────────────────────┤
│ 백그라운드 실행                       │
│ 창 닫기(X) 시 앱 종료 대신 트레이     │
│ 아이콘으로 최소화합니다               │
│                              [OFF ●] │
│                                      │
│ ※ OFF 상태에서 활성 스케줄이 있으면   │
│   창 닫기 시 경고가 표시됩니다        │
└─────────────────────────────────────┘
```

---

## 9. Zustand Store 설계

### scheduleStore.ts

```typescript
interface ScheduleState {
  schedules: Schedule[]
  selectedScheduleId: string | null
  logs: Record<string, ScheduleLog[]>   // scheduleId → logs

  setSchedules: (s: Schedule[]) => void
  addSchedule: (s: Schedule) => void
  updateSchedule: (id: string, patch: Partial<Schedule>) => void
  removeSchedule: (id: string) => void
  selectSchedule: (id: string | null) => void
  setLogs: (scheduleId: string, logs: ScheduleLog[]) => void
}
```

### settingsStore.ts

```typescript
interface SettingsState {
  settings: AppSettings
  setSettings: (s: AppSettings) => void
}
```

### uiStore.ts (기존 확장)

```typescript
// 추가 필드
activeLeftTab: 'workflows' | 'schedules'
setActiveLeftTab: (tab: 'workflows' | 'schedules') => void
settingsPanelOpen: boolean
setSettingsPanelOpen: (open: boolean) => void
```

---

## 10. 닫기 경고 처리 (backgroundMode=OFF)

Renderer에서 창 닫기 직전 경고를 표시하려면 `beforeunload` 이벤트를 활용한다.

```typescript
// App.tsx 또는 useEffect
window.addEventListener('beforeunload', (e) => {
  const { settings } = useSettingsStore.getState()
  const { schedules } = useScheduleStore.getState()
  const hasActive = schedules.some(s => s.enabled)

  if (!settings.backgroundMode && hasActive) {
    e.returnValue = ''   // 기본 브라우저 다이얼로그 발동
    // Electron에서는 커스텀 confirm 다이얼로그로 처리
  }
})
```

실제로는 Electron의 `will-prevent-unload` 이벤트를 Main에서 가로채 `dialog.showMessageBox`를 사용한다.

---

## 11. 의존성 추가

```json
// package.json dependencies
{
  "node-cron": "^3.0.3",
  "cron-parser": "^4.9.0"
}
```

---

## 12. 구현 순서 (Milestones)

| ID | 마일스톤 | 변경 파일 | 우선순위 |
|----|----------|-----------|----------|
| M0 | 스케줄러 코어 | `workflow.types.ts`, `scheduler.service.ts`, `settings.service.ts` | High |
| M1 | IPC + Storage | `main/index.ts` (IPC 핸들러), `storage.service.ts` (schedules 필드), `preload/index.ts` | High |
| M2 | 스케줄 UI | `scheduleStore.ts`, `SchedulePanel.tsx`, `ScheduleItem.tsx`, `WorkflowPanel.tsx` (탭), `ScheduleDialog.tsx` | High |
| M3 | 설정 + Tray | `settingsStore.ts`, `SettingsPanel.tsx`, `main/index.ts` (Tray + close 이벤트), Toolbar.tsx (⚙ 버튼) | High |
| M4 | 실행 이력 | `ScheduleDetail.tsx` (이력 표시), `schedule-logs.json` 읽기 IPC | Medium |
| M5 | 프리셋 & UX | `ScheduleDialog.tsx` 프리셋 UI, nextRunAt 표시, 토스트 알림 (`schedule:run-event`) | Medium |

---

## 13. 주요 설계 결정 사항

| 결정 | 이유 |
|------|------|
| schedules를 StorageData에 포함 | 기존 storage.service 재활용, 파일 수 최소화 |
| ScheduleLog는 별도 JSON | 이력은 대용량 가능성, 분리로 StorageData 비대화 방지 |
| RunnerService를 headless 모드로 재활용 | 별도 runner 불필요, `headless: true` 옵션 추가 |
| backgroundMode 기본값=false | 사용자 명시적 동의 후 활성화 (Plan US-05 요구사항) |
| Tray는 settings 변경 시 동적 생성/제거 | 앱 재시작 없이 설정 즉시 반영 |
| cron 동시 실행 방지를 Set으로 관리 | 장시간 실행 workflow 중복 방지, 단순 구현 |
