import { create } from 'zustand'
import type { Schedule, ScheduleLog } from '../../types/workflow.types'

interface ScheduleState {
  schedules: Schedule[]
  selectedScheduleId: string | null
  logs: Record<string, ScheduleLog[]>

  loadSchedules: () => Promise<void>
  createSchedule: (data: Omit<Schedule, 'id' | 'createdAt' | 'nextRunAt'>) => Promise<void>
  updateSchedule: (id: string, patch: Partial<Schedule>) => Promise<void>
  deleteSchedule: (id: string) => Promise<void>
  toggleSchedule: (id: string, enabled: boolean) => Promise<void>
  loadLogs: (scheduleId: string) => Promise<void>
  selectSchedule: (id: string | null) => void
  applyRunEvent: (log: ScheduleLog) => void
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  schedules: [],
  selectedScheduleId: null,
  logs: {},

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
      // Update schedule's lastRunAt in store
      schedules: s.schedules.map((sc) => {
        if (sc.id !== log.scheduleId) return sc
        if (sc.type === 'once') return { ...sc, enabled: false, lastRunAt: log.finishedAt }
        return { ...sc, lastRunAt: log.finishedAt }
      }),
      // Prepend log
      logs: {
        ...s.logs,
        [log.scheduleId]: [log, ...(s.logs[log.scheduleId] ?? [])].slice(0, 20)
      }
    }))
  }
}))
