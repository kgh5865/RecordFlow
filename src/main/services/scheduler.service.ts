import type { BrowserWindow } from 'electron'
import * as cron from 'node-cron'
import { parseExpression } from 'cron-parser'
import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { Schedule, ScheduleLog } from '../../types/workflow.types'
import { runWorkflow } from './runner.service'
import { loadStorage, saveStorage } from './storage.service'

const DATA_DIR = app.getPath('userData')
const LOG_FILE = join(DATA_DIR, 'schedule-logs.json')

// Active cron tasks: scheduleId → cron.ScheduledTask
const cronTasks = new Map<string, cron.ScheduledTask>()

// Active once timers: scheduleId → NodeJS.Timeout
const onceTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Prevents concurrent execution of the same schedule
const runningSet = new Set<string>()

let mainWin: BrowserWindow | null = null

export function initScheduler(win: BrowserWindow, schedules: Schedule[]): void {
  mainWin = win
  for (const schedule of schedules) {
    if (schedule.enabled) {
      registerSchedule(schedule)
    }
  }
}

export function setMainWindow(win: BrowserWindow | null): void {
  mainWin = win
}

export function registerSchedule(schedule: Schedule): void {
  unregisterSchedule(schedule.id)
  if (!schedule.enabled) return

  if (schedule.type === 'cron' && schedule.cronExpression) {
    if (!cron.validate(schedule.cronExpression)) return
    const task = cron.schedule(schedule.cronExpression, () => {
      executeSchedule(schedule.id).catch(console.error)
    })
    cronTasks.set(schedule.id, task)

  } else if (schedule.type === 'once' && schedule.scheduledAt) {
    const delay = new Date(schedule.scheduledAt).getTime() - Date.now()
    if (delay <= 0) return
    // setTimeout max ~24.8 days; sufficient for typical scheduling use
    const timer = setTimeout(() => {
      executeSchedule(schedule.id).catch(console.error)
    }, Math.min(delay, 2_147_483_647))
    onceTimers.set(schedule.id, timer)
  }
}

export function unregisterSchedule(scheduleId: string): void {
  const task = cronTasks.get(scheduleId)
  if (task) {
    task.stop()
    cronTasks.delete(scheduleId)
  }
  const timer = onceTimers.get(scheduleId)
  if (timer !== undefined) {
    clearTimeout(timer)
    onceTimers.delete(scheduleId)
  }
}

export function stopAllSchedules(): void {
  for (const task of cronTasks.values()) task.stop()
  cronTasks.clear()
  for (const timer of onceTimers.values()) clearTimeout(timer)
  onceTimers.clear()
}

export function calcNextRunAt(cronExpression: string): string {
  try {
    const interval = parseExpression(cronExpression)
    return interval.next().toISOString()
  } catch {
    return ''
  }
}

export function isValidCron(expression: string): boolean {
  return cron.validate(expression)
}

async function executeSchedule(scheduleId: string): Promise<void> {
  if (runningSet.has(scheduleId)) return

  const storage = loadStorage()
  const schedule = storage.schedules.find((s) => s.id === scheduleId)
  if (!schedule || !schedule.enabled) return

  const workflow = storage.workflows.find((w) => w.id === schedule.workflowId)
  if (!workflow) return

  runningSet.add(scheduleId)
  const startedAt = new Date().toISOString()

  try {
    const result = await runWorkflow(mainWin, workflow.steps, { headless: true })
    const finishedAt = new Date().toISOString()

    const log: ScheduleLog = {
      id: randomUUID(),
      scheduleId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      startedAt,
      finishedAt,
      success: result.success,
      completedSteps: result.completedSteps,
      totalSteps: workflow.steps.length,
      error: result.error
    }

    saveScheduleLog(log)

    // Update schedule metadata
    const now = new Date().toISOString()
    const freshStorage = loadStorage()
    const updatedSchedules = freshStorage.schedules.map((s) => {
      if (s.id !== scheduleId) return s
      if (s.type === 'once') {
        return { ...s, enabled: false, lastRunAt: now }
      }
      return { ...s, lastRunAt: now, nextRunAt: s.cronExpression ? calcNextRunAt(s.cronExpression) : s.nextRunAt }
    })
    saveStorage({ ...freshStorage, schedules: updatedSchedules })

    // Notify renderer
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('schedule:run-event', log)
    }

    // Once schedule: unregister after execution
    if (schedule.type === 'once') {
      unregisterSchedule(scheduleId)
    }
  } catch (err) {
    console.error('[Scheduler] Execution error for schedule', scheduleId, err)
  } finally {
    runningSet.delete(scheduleId)
  }
}

// --- Log persistence ---

function loadLogs(): ScheduleLog[] {
  try {
    if (!existsSync(LOG_FILE)) return []
    return JSON.parse(readFileSync(LOG_FILE, 'utf-8')) as ScheduleLog[]
  } catch {
    return []
  }
}

function saveScheduleLog(log: ScheduleLog): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  const logs = loadLogs()
  logs.unshift(log)
  // Keep latest 500 entries
  const trimmed = logs.slice(0, 500)
  writeFileSync(LOG_FILE, JSON.stringify(trimmed, null, 2), 'utf-8')
}

export function getScheduleLogs(scheduleId: string, limit = 20): ScheduleLog[] {
  const logs = loadLogs()
  return logs.filter((l) => l.scheduleId === scheduleId).slice(0, limit)
}
