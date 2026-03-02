import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { loadStorage, saveStorage } from './services/storage.service'
import { startCodegen, stopCodegen } from './services/codegen.service'
import { runWorkflow } from './services/runner.service'
import { loadSettings, saveSettings } from './services/settings.service'
import {
  registerSchedule,
  unregisterSchedule,
  calcNextRunAt,
  isValidCron,
  getScheduleLogs
} from './services/scheduler.service'
import type { StorageData, WorkflowStep, Schedule } from '../types/workflow.types'

export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  setupTray: () => void,
  destroyTray: () => void
): void {

  // --- Storage IPC ---

  ipcMain.handle('storage:load', () => {
    try {
      return loadStorage()
    } catch (err) {
      console.error('[IPC] storage:load error:', err)
      throw err
    }
  })

  ipcMain.handle('storage:save', async (_event, data: StorageData) => {
    try {
      const existing = loadStorage()
      await saveStorage({ ...existing, ...data, schedules: data.schedules ?? existing.schedules ?? [] })
    } catch (err) {
      console.error('[IPC] storage:save error:', err)
      throw err
    }
  })

  // --- Codegen IPC ---

  ipcMain.handle('codegen:start', (_event, url: string) => {
    try {
      if (typeof url !== 'string' || !url) throw new Error('Invalid url parameter')
      const win = getMainWindow()
      if (!win) return
      startCodegen(win, url)
    } catch (err) {
      console.error('[IPC] codegen:start error:', err)
      throw err
    }
  })

  ipcMain.handle('codegen:stop', () => {
    try {
      stopCodegen()
    } catch (err) {
      console.error('[IPC] codegen:stop error:', err)
      throw err
    }
  })

  // --- Runner IPC ---

  ipcMain.handle('runner:start', async (_event, steps: WorkflowStep[]) => {
    try {
      if (!Array.isArray(steps)) throw new Error('Invalid steps parameter')
      const win = getMainWindow()
      if (!win) return
      await runWorkflow(win, steps)
    } catch (err) {
      console.error('[IPC] runner:start error:', err)
      throw err
    }
  })

  // --- Schedule IPC ---

  ipcMain.handle('schedule:list', () => {
    try {
      return loadStorage().schedules
    } catch (err) {
      console.error('[IPC] schedule:list error:', err)
      throw err
    }
  })

  ipcMain.handle('schedule:create', async (_event, data: Omit<Schedule, 'id' | 'createdAt' | 'nextRunAt'>) => {
    try {
      const storage = loadStorage()
      const now = new Date().toISOString()

      const schedule: Schedule = {
        ...data,
        id: randomUUID(),
        createdAt: now,
        nextRunAt: data.type === 'cron' && data.cronExpression ? calcNextRunAt(data.cronExpression) : undefined
      }

      storage.schedules.push(schedule)
      await saveStorage(storage)

      if (schedule.enabled) {
        registerSchedule(schedule)
      }

      return schedule
    } catch (err) {
      console.error('[IPC] schedule:create error:', err)
      throw err
    }
  })

  ipcMain.handle('schedule:update', async (_event, id: string, patch: Partial<Schedule>) => {
    try {
      if (typeof id !== 'string' || !id) throw new Error('Invalid id parameter')
      const storage = loadStorage()
      const idx = storage.schedules.findIndex((s) => s.id === id)
      if (idx === -1) throw new Error('Schedule not found')

      const updated: Schedule = {
        ...storage.schedules[idx],
        ...patch,
        nextRunAt:
          patch.cronExpression
            ? calcNextRunAt(patch.cronExpression)
            : storage.schedules[idx].nextRunAt
      }
      storage.schedules[idx] = updated
      await saveStorage(storage)

      unregisterSchedule(id)
      if (updated.enabled) registerSchedule(updated)

      return updated
    } catch (err) {
      console.error('[IPC] schedule:update error:', err)
      throw err
    }
  })

  ipcMain.handle('schedule:delete', async (_event, id: string) => {
    try {
      if (typeof id !== 'string' || !id) throw new Error('Invalid id parameter')
      const storage = loadStorage()
      unregisterSchedule(id)
      storage.schedules = storage.schedules.filter((s) => s.id !== id)
      await saveStorage(storage)
    } catch (err) {
      console.error('[IPC] schedule:delete error:', err)
      throw err
    }
  })

  ipcMain.handle('schedule:toggle', async (_event, id: string, enabled: boolean) => {
    try {
      if (typeof id !== 'string' || !id) throw new Error('Invalid id parameter')
      if (typeof enabled !== 'boolean') throw new Error('Invalid enabled parameter')
      const storage = loadStorage()
      const idx = storage.schedules.findIndex((s) => s.id === id)
      if (idx === -1) throw new Error('Schedule not found')

      const updated: Schedule = { ...storage.schedules[idx], enabled }
      storage.schedules[idx] = updated
      await saveStorage(storage)

      if (enabled) {
        registerSchedule(updated)
      } else {
        unregisterSchedule(id)
      }

      return updated
    } catch (err) {
      console.error('[IPC] schedule:toggle error:', err)
      throw err
    }
  })

  ipcMain.handle('schedule:logs', async (_event, scheduleId: string, limit?: number) => {
    try {
      return await getScheduleLogs(scheduleId, limit)
    } catch (err) {
      console.error('[IPC] schedule:logs error:', err)
      throw err
    }
  })

  ipcMain.handle('schedule:validate-cron', (_event, expression: string) => {
    try {
      return isValidCron(expression)
    } catch (err) {
      console.error('[IPC] schedule:validate-cron error:', err)
      throw err
    }
  })

  // --- Settings IPC ---

  ipcMain.handle('settings:get', () => {
    try {
      return loadSettings()
    } catch (err) {
      console.error('[IPC] settings:get error:', err)
      throw err
    }
  })

  ipcMain.handle('settings:save', async (_event, settings) => {
    try {
      await saveSettings(settings)
      if (settings.backgroundMode) {
        setupTray()
      } else {
        destroyTray()
      }
    } catch (err) {
      console.error('[IPC] settings:save error:', err)
      throw err
    }
  })
}
