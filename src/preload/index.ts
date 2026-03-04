import { contextBridge, ipcRenderer } from 'electron'
import type { StorageData, WorkflowStep, RunnerResult, Schedule, ScheduleLog, AppSettings, Workflow, WorkflowExportFile } from '../types/workflow.types'

contextBridge.exposeInMainWorld('electronAPI', {
  // Storage
  loadStorage: (): Promise<StorageData> =>
    ipcRenderer.invoke('storage:load'),

  saveStorage: (data: StorageData): Promise<void> =>
    ipcRenderer.invoke('storage:save', data),

  // Codegen
  startCodegen: (url: string): Promise<void> =>
    ipcRenderer.invoke('codegen:start', url),

  stopCodegen: (): Promise<void> =>
    ipcRenderer.invoke('codegen:stop'),

  onCodegenComplete: (cb: (steps: WorkflowStep[]) => void): void => {
    ipcRenderer.on('codegen:complete', (_event, steps) => cb(steps))
  },

  onCodegenError: (cb: (err: string) => void): void => {
    ipcRenderer.on('codegen:error', (_event, err) => cb(err))
  },

  // Runner
  startRunner: (steps: WorkflowStep[]): Promise<void> =>
    ipcRenderer.invoke('runner:start', steps),

  onRunnerStepUpdate: (cb: (index: number) => void): void => {
    ipcRenderer.on('runner:step-update', (_event, index) => cb(index))
  },

  onRunnerComplete: (cb: (result: RunnerResult) => void): void => {
    ipcRenderer.on('runner:complete', (_event, result) => cb(result))
  },

  removeAllListeners: (channel: string): void => {
    ipcRenderer.removeAllListeners(channel)
  },

  // Schedule CRUD
  listSchedules: (): Promise<Schedule[]> =>
    ipcRenderer.invoke('schedule:list'),

  createSchedule: (data: Omit<Schedule, 'id' | 'createdAt' | 'nextRunAt'>): Promise<Schedule> =>
    ipcRenderer.invoke('schedule:create', data),

  updateSchedule: (id: string, patch: Partial<Schedule>): Promise<Schedule> =>
    ipcRenderer.invoke('schedule:update', id, patch),

  deleteSchedule: (id: string): Promise<void> =>
    ipcRenderer.invoke('schedule:delete', id),

  toggleSchedule: (id: string, enabled: boolean): Promise<Schedule> =>
    ipcRenderer.invoke('schedule:toggle', id, enabled),

  getScheduleLogs: (scheduleId: string, limit?: number): Promise<ScheduleLog[]> =>
    ipcRenderer.invoke('schedule:logs', scheduleId, limit),

  runScheduleNow: (scheduleId: string): Promise<ScheduleLog | null> =>
    ipcRenderer.invoke('schedule:run-now', scheduleId),

  // Settings
  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:get'),

  saveSettings: (settings: AppSettings): Promise<void> =>
    ipcRenderer.invoke('settings:save', settings),

  // Scheduler push events
  onScheduleRunEvent: (cb: (log: ScheduleLog) => void): void => {
    ipcRenderer.on('schedule:run-event', (_event, log) => cb(log))
  },

  // Workflow File Sharing
  exportWorkflow: (workflow: Workflow): Promise<{ cancelled: boolean }> =>
    ipcRenderer.invoke('workflow:export', workflow),

  importWorkflow: (): Promise<{ cancelled: boolean; file?: WorkflowExportFile; error?: string }> =>
    ipcRenderer.invoke('workflow:import'),
})
