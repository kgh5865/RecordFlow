export interface WorkflowFolder {
  id: string
  name: string
  parentId?: string
  createdAt: string
}

export interface Workflow {
  id: string
  name: string
  folderId: string
  createdAt: string
  updatedAt: string
  steps: WorkflowStep[]
}

export type ActionType = 'navigate' | 'click' | 'fill' | 'select' | 'expect' | 'wait' | 'press'

export interface WorkflowStep {
  id: string
  order: number
  action: ActionType
  selector?: string   // 표시용: locator 표현식 전체 (e.g. getByRole('button', { name: 'Login' }))
  value?: string      // fill, select 값
  url?: string        // navigate, expect(url) 전용
  rawLine?: string    // runner 실행용: 원본 codegen 라인 (e.g. await page.click(...))
  isSensitive?: boolean  // 민감 정보(비밀번호 등) 여부 — UI 마스킹용
}

export interface StorageData {
  version: '1.0'
  folders: WorkflowFolder[]
  workflows: Workflow[]
  schedules: Schedule[]
  scheduleFolders: ScheduleFolder[]
}

export interface RunnerResult {
  success: boolean
  error?: string
  completedSteps: number
}

// --- Scheduler 타입 ---

export interface FolderVariable {
  key: string
  value: string
  isSensitive: boolean
}

export interface ScheduleFolder {
  id: string
  name: string
  parentId?: string
  createdAt: string
  variables?: FolderVariable[]
  passwordHash?: string
  passwordSalt?: string
}

export type ScheduleType = 'cron' | 'once'

export interface Schedule {
  id: string
  workflowId: string        // 원본 워크플로우 템플릿 참조 (이름 표시용)
  folderId: string
  steps: WorkflowStep[]     // 독립 복사본 — 개인별 편집 가능
  type: ScheduleType
  cronExpression?: string   // type='cron': "0 9 * * *"
  scheduledAt?: string      // type='once': ISO 8601
  enabled: boolean
  lastRunAt?: string
  nextRunAt?: string
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

export interface OtpProfile {
  id: string
  name: string    // 참조용 이름 (e.g. "gmail", "github")
  secret: string  // TOTP secret key (Base32)
}

export interface AppSettings {
  backgroundMode: boolean
  otpProfiles: OtpProfile[]
}

// --- Workflow File Sharing 타입 ---

export interface WorkflowStepExport {
  order: number
  action: ActionType
  selector?: string
  value?: string
  url?: string
  rawLine?: string
  _masked?: true
  _sensitiveType?: string
}

export interface WorkflowExportFile {
  rfworkflowVersion: '1.0'
  exportedAt: string
  workflow: {
    name: string
    steps: WorkflowStepExport[]
  }
}

// Renderer 측 window.electronAPI 타입
export interface ElectronAPI {
  loadStorage: () => Promise<StorageData>
  saveStorage: (data: StorageData) => Promise<void>
  startCodegen: (url: string) => Promise<void>
  stopCodegen: () => Promise<void>
  onCodegenComplete: (cb: (steps: WorkflowStep[]) => void) => void
  onCodegenError: (cb: (err: string) => void) => void
  startRunner: (steps: WorkflowStep[]) => Promise<void>
  onRunnerStepUpdate: (cb: (index: number) => void) => void
  onRunnerComplete: (cb: (result: RunnerResult) => void) => void
  removeAllListeners: (channel: string) => void

  // Schedule Folder CRUD
  listScheduleFolders: () => Promise<ScheduleFolder[]>
  createScheduleFolder: (data: Omit<ScheduleFolder, 'id' | 'createdAt'>) => Promise<ScheduleFolder>
  deleteScheduleFolder: (id: string) => Promise<void>
  renameScheduleFolder: (id: string, name: string) => Promise<ScheduleFolder>
  updateScheduleFolderVariables: (id: string, variables: FolderVariable[]) => Promise<ScheduleFolder>
  setFolderPassword: (id: string, password: string) => Promise<void>
  removeFolderPassword: (id: string) => Promise<void>
  verifyFolderPassword: (id: string, password: string) => Promise<boolean>

  // Schedule CRUD
  listSchedules: () => Promise<Schedule[]>
  createSchedule: (data: Omit<Schedule, 'id' | 'createdAt' | 'nextRunAt'>) => Promise<Schedule>
  updateSchedule: (id: string, patch: Partial<Schedule>) => Promise<Schedule>
  deleteSchedule: (id: string) => Promise<void>
  toggleSchedule: (id: string, enabled: boolean) => Promise<Schedule>
  getScheduleLogs: (scheduleId: string, limit?: number) => Promise<ScheduleLog[]>
  runScheduleNow: (scheduleId: string) => Promise<ScheduleLog | null>
  moveSchedule: (id: string, targetFolderId: string) => Promise<Schedule>

  // Settings
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: AppSettings) => Promise<void>

  // Scheduler push events
  onScheduleRunEvent: (cb: (log: ScheduleLog) => void) => void

  // Workflow File Sharing
  exportWorkflow: (workflow: Workflow) => Promise<{ cancelled: boolean }>
  importWorkflow: () => Promise<{ cancelled: boolean; file?: WorkflowExportFile; error?: string }>

  // Re-record
  reRecordStart: (req: ReRecordStartRequest) => Promise<ReRecordStateResponse>
  reRecordNext: () => Promise<ReRecordStateResponse>
  reRecordStartRecording: () => Promise<ReRecordStateResponse>
  reRecordStopRecording: () => Promise<ReRecordStopRecordingResponse>
  reRecordInclude: () => Promise<ReRecordStateResponse>
  reRecordIncludeAll: () => Promise<ReRecordStateResponse>
  reRecordSkip: () => Promise<ReRecordStateResponse>
  reRecordRetry: () => Promise<ReRecordStateResponse>
  reRecordGetCommitCandidates: () => Promise<ReRecordCommitResponse>
  reRecordFinalize: () => Promise<void>
  reRecordCancel: () => Promise<void>
  onReRecordAutoProgress: (cb: (evt: ReRecordProgressEvent) => void) => void
  onReRecordSessionEnded: (cb: (evt: ReRecordSessionEndedEvent) => void) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

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
