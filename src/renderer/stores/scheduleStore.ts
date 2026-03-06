import { create } from 'zustand'
import type { Schedule, ScheduleFolder, FolderVariable, ScheduleLog, WorkflowStep } from '../../types/workflow.types'
import { normalizeSelector, rebuildRawLine } from '../utils/selectorUtils'

interface ScheduleState {
  scheduleFolders: ScheduleFolder[]
  schedules: Schedule[]
  selectedScheduleId: string | null
  logs: Record<string, ScheduleLog[]>

  // Folder
  loadScheduleFolders: () => Promise<void>
  createScheduleFolder: (name: string, parentId?: string) => Promise<ScheduleFolder>
  deleteScheduleFolder: (id: string) => Promise<void>
  renameScheduleFolder: (id: string, name: string) => Promise<void>
  updateScheduleFolderVariables: (id: string, variables: FolderVariable[]) => Promise<void>

  // Schedule
  loadSchedules: () => Promise<void>
  createSchedule: (data: Omit<Schedule, 'id' | 'createdAt' | 'nextRunAt'>) => Promise<void>
  updateSchedule: (id: string, patch: Partial<Schedule>) => Promise<void>
  deleteSchedule: (id: string) => Promise<void>
  toggleSchedule: (id: string, enabled: boolean) => Promise<void>
  moveSchedule: (id: string, targetFolderId: string) => Promise<void>

  // Schedule Step 편집 (독립 복사본)
  updateScheduleStep: (scheduleId: string, stepId: string, patch: Partial<WorkflowStep>) => void
  updateScheduleStepSelector: (scheduleId: string, stepId: string, newValue: string) => void
  moveScheduleStepUp: (scheduleId: string, stepId: string) => void
  moveScheduleStepDown: (scheduleId: string, stepId: string) => void
  deleteScheduleStep: (scheduleId: string, stepId: string) => void
  saveScheduleSteps: (scheduleId: string) => Promise<void>

  loadLogs: (scheduleId: string) => Promise<void>
  selectSchedule: (id: string | null) => void
  applyRunEvent: (log: ScheduleLog) => void
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  scheduleFolders: [],
  schedules: [],
  selectedScheduleId: null,
  logs: {},

  // --- Folder ---

  loadScheduleFolders: async () => {
    const scheduleFolders = await window.electronAPI.listScheduleFolders()
    set({ scheduleFolders })
  },

  createScheduleFolder: async (name, parentId) => {
    const folder = await window.electronAPI.createScheduleFolder({
      name,
      ...(parentId ? { parentId } : {})
    })
    set((s) => ({ scheduleFolders: [...s.scheduleFolders, folder] }))
    return folder
  },

  deleteScheduleFolder: async (id) => {
    // 재귀적으로 하위 폴더 ID 수집 (UI 측에서도 로컬 상태 정리)
    const getAllDescendantIds = (rootId: string, folders: ScheduleFolder[]): string[] => {
      const children = folders.filter((f) => f.parentId === rootId)
      return [rootId, ...children.flatMap((c) => getAllDescendantIds(c.id, folders))]
    }
    const toDelete = new Set(getAllDescendantIds(id, get().scheduleFolders))
    await window.electronAPI.deleteScheduleFolder(id)
    set((s) => ({
      scheduleFolders: s.scheduleFolders.filter((f) => !toDelete.has(f.id)),
      schedules: s.schedules.filter((sc) => !toDelete.has(sc.folderId)),
      selectedScheduleId:
        s.selectedScheduleId && s.schedules.find((sc) => sc.id === s.selectedScheduleId && toDelete.has(sc.folderId))
          ? null
          : s.selectedScheduleId
    }))
  },

  renameScheduleFolder: async (id, name) => {
    const updated = await window.electronAPI.renameScheduleFolder(id, name)
    set((s) => ({
      scheduleFolders: s.scheduleFolders.map((f) => (f.id === id ? updated : f))
    }))
  },

  updateScheduleFolderVariables: async (id, variables) => {
    const updated = await window.electronAPI.updateScheduleFolderVariables(id, variables)
    set((s) => ({
      scheduleFolders: s.scheduleFolders.map((f) => (f.id === id ? updated : f))
    }))
  },

  // --- Schedule ---

  loadSchedules: async () => {
    const schedules = await window.electronAPI.listSchedules()
    set({ schedules })
  },

  createSchedule: async (data) => {
    const schedule = await window.electronAPI.createSchedule(data)
    set((s) => ({ schedules: [...s.schedules, schedule] }))
  },

  updateSchedule: async (id, patch) => {
    const updated = await window.electronAPI.updateSchedule(id, patch)
    set((s) => ({
      schedules: s.schedules.map((sc) => (sc.id === id ? updated : sc))
    }))
  },

  deleteSchedule: async (id) => {
    await window.electronAPI.deleteSchedule(id)
    set((s) => ({
      schedules: s.schedules.filter((sc) => sc.id !== id),
      selectedScheduleId: s.selectedScheduleId === id ? null : s.selectedScheduleId
    }))
  },

  toggleSchedule: async (id, enabled) => {
    const updated = await window.electronAPI.toggleSchedule(id, enabled)
    set((s) => ({
      schedules: s.schedules.map((sc) => (sc.id === id ? updated : sc))
    }))
  },

  moveSchedule: async (id, targetFolderId) => {
    const updated = await window.electronAPI.moveSchedule(id, targetFolderId)
    set((s) => ({
      schedules: s.schedules.map((sc) => (sc.id === id ? updated : sc))
    }))
  },

  // --- Schedule Step 편집 ---

  updateScheduleStep: (scheduleId, stepId, patch) => {
    set((s) => ({
      schedules: s.schedules.map((sc) => {
        if (sc.id !== scheduleId) return sc
        return { ...sc, steps: sc.steps.map((st) => st.id === stepId ? { ...st, ...patch } : st) }
      })
    }))
  },

  updateScheduleStepSelector: (scheduleId, stepId, newValue) => {
    set((s) => ({
      schedules: s.schedules.map((sc) => {
        if (sc.id !== scheduleId) return sc
        return {
          ...sc,
          steps: sc.steps.map((st) => {
            if (st.id !== stepId) return st
            if (st.action === 'navigate' || (st.action === 'expect' && st.url)) {
              return { ...st, url: newValue.trim(), rawLine: rebuildRawLine(st, undefined, newValue.trim()) }
            }
            const normalized = normalizeSelector(newValue)
            return { ...st, selector: normalized, rawLine: rebuildRawLine(st, normalized) }
          })
        }
      })
    }))
  },

  moveScheduleStepUp: (scheduleId, stepId) => {
    set((s) => ({
      schedules: s.schedules.map((sc) => {
        if (sc.id !== scheduleId) return sc
        const idx = sc.steps.findIndex((st) => st.id === stepId)
        if (idx <= 0) return sc
        const steps = [...sc.steps]
        ;[steps[idx - 1], steps[idx]] = [steps[idx], steps[idx - 1]]
        return { ...sc, steps: steps.map((st, i) => ({ ...st, order: i })) }
      })
    }))
  },

  moveScheduleStepDown: (scheduleId, stepId) => {
    set((s) => ({
      schedules: s.schedules.map((sc) => {
        if (sc.id !== scheduleId) return sc
        const idx = sc.steps.findIndex((st) => st.id === stepId)
        if (idx < 0 || idx >= sc.steps.length - 1) return sc
        const steps = [...sc.steps]
        ;[steps[idx], steps[idx + 1]] = [steps[idx + 1], steps[idx]]
        return { ...sc, steps: steps.map((st, i) => ({ ...st, order: i })) }
      })
    }))
  },

  deleteScheduleStep: (scheduleId, stepId) => {
    set((s) => ({
      schedules: s.schedules.map((sc) => {
        if (sc.id !== scheduleId) return sc
        const filtered = sc.steps.filter((st) => st.id !== stepId)
        return { ...sc, steps: filtered.map((st, i) => ({ ...st, order: i })) }
      })
    }))
  },

  saveScheduleSteps: async (scheduleId) => {
    const schedule = get().schedules.find((sc) => sc.id === scheduleId)
    if (!schedule) return
    await window.electronAPI.updateSchedule(scheduleId, { steps: schedule.steps })
  },

  loadLogs: async (scheduleId) => {
    const logs = await window.electronAPI.getScheduleLogs(scheduleId, 20)
    set((s) => ({ logs: { ...s.logs, [scheduleId]: logs } }))
  },

  selectSchedule: (id) => {
    set({ selectedScheduleId: id })
    if (id) get().loadLogs(id)
  },

  applyRunEvent: (log) => {
    set((s) => ({
      schedules: s.schedules.map((sc) => {
        if (sc.id !== log.scheduleId) return sc
        if (sc.type === 'once') return { ...sc, enabled: false, lastRunAt: log.finishedAt }
        return { ...sc, lastRunAt: log.finishedAt }
      }),
      logs: {
        ...s.logs,
        [log.scheduleId]: [log, ...(s.logs[log.scheduleId] ?? [])].slice(0, 20)
      }
    }))
  }
}))
