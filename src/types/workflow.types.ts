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
}

export interface StorageData {
  version: '1.0'
  folders: WorkflowFolder[]
  workflows: Workflow[]
  schedules: Schedule[]
}

export interface RunnerResult {
  success: boolean
  error?: string
  completedSteps: number
}

// --- Scheduler 타입 ---

export type ScheduleType = 'cron' | 'once'

export interface Schedule {
  id: string
  workflowId: string
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

  // Schedule CRUD
  listSchedules: () => Promise<Schedule[]>
  createSchedule: (data: Omit<Schedule, 'id' | 'createdAt' | 'nextRunAt'>) => Promise<Schedule>
  updateSchedule: (id: string, patch: Partial<Schedule>) => Promise<Schedule>
  deleteSchedule: (id: string) => Promise<void>
  toggleSchedule: (id: string, enabled: boolean) => Promise<Schedule>
  getScheduleLogs: (scheduleId: string, limit?: number) => Promise<ScheduleLog[]>

  // Settings
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: AppSettings) => Promise<void>

  // Scheduler push events
  onScheduleRunEvent: (cb: (log: ScheduleLog) => void) => void

  // Workflow File Sharing
  exportWorkflow: (workflow: Workflow) => Promise<{ cancelled: boolean }>
  importWorkflow: () => Promise<{ cancelled: boolean; file?: WorkflowExportFile; error?: string }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
