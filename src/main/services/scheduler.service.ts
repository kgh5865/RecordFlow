import type { BrowserWindow } from 'electron'
import * as cron from 'node-cron'
import { parseExpression } from 'cron-parser'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import type { Schedule, ScheduleLog } from '../../types/workflow.types'
import { runWorkflow } from './runner.service'
import { loadStorage, saveStorage } from './storage.service'
import { saveJSONAsync } from '../utils/json-storage'
import { logLine } from '../utils/app-log'

const LOG_FILE = join(app.getPath('userData'), 'schedule-logs.json')

// Active cron tasks: scheduleId → cron.ScheduledTask
const cronTasks = new Map<string, cron.ScheduledTask>()

// Active once timers: scheduleId → NodeJS.Timeout
const onceTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Prevents concurrent execution of the same schedule
const runningSet = new Set<string>()

// 큐에 들어갔지만 아직 시작 못 한 스케줄. 큐가 막혀 있을 때 매 tick마다
// 같은 스케줄이 무한히 쌓이고, 막힘이 풀리는 순간 몰아서 터지는 것을 막는다.
const queuedSet = new Set<string>()

// 타이머 생존 확인용 하트비트 (스케줄이 하루 1회면 tick 로그만으로는 알 수 없다)
let heartbeat: ReturnType<typeof setInterval> | null = null

// Serial execution queue — prevents simultaneous Chromium launches
class ExecutionQueue {
  private running = 0
  private readonly maxConcurrency: number
  private readonly queue: Array<() => void> = []

  constructor(maxConcurrency = 1) {
    this.maxConcurrency = maxConcurrency
  }

  enqueue(task: () => Promise<void>): void {
    const run = async () => {
      this.running++
      try { await task() }
      catch (err) { logLine('Scheduler', `queue task error: ${String(err)}`) }
      finally { this.running--; this.drain() }
    }
    if (this.running < this.maxConcurrency) run()
    else this.queue.push(run)
  }

  private drain(): void {
    const next = this.queue.shift()
    if (next) next()
  }
}

const executionQueue = new ExecutionQueue(1)

let mainWin: BrowserWindow | null = null

export function initScheduler(win: BrowserWindow, schedules: Schedule[]): void {
  mainWin = win
  for (const schedule of schedules) {
    if (schedule.enabled) {
      registerSchedule(schedule)
    }
  }
  logLine('Scheduler', `init — 등록 cron ${cronTasks.size}, once ${onceTimers.size}`)

  if (!heartbeat) {
    heartbeat = setInterval(() => {
      logLine(
        'Scheduler',
        `heartbeat — cron ${cronTasks.size}, once ${onceTimers.size}, running [${[...runningSet].join(',')}], queued [${[...queuedSet].join(',')}]`
      )
    }, 60 * 60_000)
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
      if (runningSet.has(schedule.id) || queuedSet.has(schedule.id)) {
        logLine('Scheduler', `tick ${schedule.id} — 이전 실행이 아직 안 끝나 건너뜀`)
        return
      }
      logLine('Scheduler', `tick ${schedule.id} — 큐 등록`)
      queuedSet.add(schedule.id)
      executionQueue.enqueue(async () => {
        queuedSet.delete(schedule.id)
        await executeSchedule(schedule.id)
      })
    })
    cronTasks.set(schedule.id, task)

  } else if (schedule.type === 'once' && schedule.scheduledAt) {
    const delay = new Date(schedule.scheduledAt).getTime() - Date.now()
    if (delay <= 0) return
    // setTimeout max ~24.8 days; sufficient for typical scheduling use
    const timer = setTimeout(() => {
      queuedSet.add(schedule.id)
      executionQueue.enqueue(async () => {
        queuedSet.delete(schedule.id)
        await executeSchedule(schedule.id)
      })
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
  queuedSet.delete(scheduleId)
}

export function stopAllSchedules(): void {
  for (const task of cronTasks.values()) task.stop()
  cronTasks.clear()
  for (const timer of onceTimers.values()) clearTimeout(timer)
  onceTimers.clear()
  queuedSet.clear()
  logLine('Scheduler', 'stopAllSchedules')
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

  // 스케줄 자체 steps 사용 (독립 복사본)
  const steps = schedule.steps ?? []
  if (steps.length === 0) return

  const workflow = storage.workflows.find((w) => w.id === schedule.workflowId)
  const workflowName = workflow?.name ?? '(삭제된 워크플로우)'

  // 폴더 변수 조회
  const folder = storage.scheduleFolders.find((f) => f.id === schedule.folderId)
  const folderVariables = folder?.variables ?? []

  runningSet.add(scheduleId)
  const startedAt = new Date().toISOString()
  logLine('Scheduler', `run start ${scheduleId} (${workflowName}, ${steps.length} steps)`)

  try {
    const result = await runWorkflow(null, steps, { headless: true, folderVariables })
    const finishedAt = new Date().toISOString()
    logLine('Scheduler', `run end ${scheduleId} — success=${result.success} steps=${result.completedSteps}/${steps.length}${result.error ? ` error=${result.error}` : ''}`)

    const log: ScheduleLog = {
      id: randomUUID(),
      scheduleId,
      workflowId: schedule.workflowId,
      workflowName,
      startedAt,
      finishedAt,
      success: result.success,
      completedSteps: result.completedSteps,
      totalSteps: steps.length,
      error: result.error
    }

    await saveScheduleLog(log)

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
    await saveStorage({ ...freshStorage, schedules: updatedSchedules })

    // Notify renderer
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('schedule:run-event', log)
    }

    // Once schedule: unregister after execution
    if (schedule.type === 'once') {
      unregisterSchedule(scheduleId)
    }
  } catch (err) {
    logLine('Scheduler', `run error ${scheduleId}: ${String(err)}`)
    const failLog: ScheduleLog = {
      id: randomUUID(),
      scheduleId,
      workflowId: schedule.workflowId,
      workflowName,
      startedAt,
      finishedAt: new Date().toISOString(),
      success: false,
      completedSteps: 0,
      totalSteps: steps.length,
      error: String(err)
    }
    await saveScheduleLog(failLog).catch(console.error)
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('schedule:run-event', failLog)
    }
  } finally {
    runningSet.delete(scheduleId)
  }
}

// --- Log persistence ---

async function loadLogs(): Promise<ScheduleLog[]> {
  try {
    if (!existsSync(LOG_FILE)) return []
    return JSON.parse(await readFile(LOG_FILE, 'utf-8')) as ScheduleLog[]
  } catch {
    return []
  }
}

async function saveScheduleLog(log: ScheduleLog): Promise<void> {
  const logs = await loadLogs()
  logs.unshift(log)
  // Keep latest 500 entries
  await saveJSONAsync(LOG_FILE, logs.slice(0, 500))
}

export async function getScheduleLogs(scheduleId: string, limit = 20): Promise<ScheduleLog[]> {
  const logs = await loadLogs()
  return logs.filter((l) => l.scheduleId === scheduleId).slice(0, limit)
}

export async function runScheduleNow(scheduleId: string): Promise<ScheduleLog | null> {
  if (runningSet.has(scheduleId)) return null

  const storage = loadStorage()
  const schedule = storage.schedules.find((s) => s.id === scheduleId)
  if (!schedule) return null

  // 스케줄 자체 steps 사용 (독립 복사본)
  const steps = schedule.steps ?? []
  if (steps.length === 0) return null

  const workflow = storage.workflows.find((w) => w.id === schedule.workflowId)
  const workflowName = workflow?.name ?? '(삭제된 워크플로우)'

  // 폴더 변수 조회
  const folder = storage.scheduleFolders.find((f) => f.id === schedule.folderId)
  const folderVariables = folder?.variables ?? []

  runningSet.add(scheduleId)
  const startedAt = new Date().toISOString()

  try {
    const result = await runWorkflow(null, steps, { headless: true, folderVariables })
    const finishedAt = new Date().toISOString()

    const log: ScheduleLog = {
      id: randomUUID(),
      scheduleId,
      workflowId: schedule.workflowId,
      workflowName,
      startedAt,
      finishedAt,
      success: result.success,
      completedSteps: result.completedSteps,
      totalSteps: steps.length,
      error: result.error
    }

    await saveScheduleLog(log)

    // Notify renderer
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('schedule:run-event', log)
    }

    return log
  } catch (err) {
    logLine('Scheduler', `runScheduleNow error ${scheduleId}: ${String(err)}`)
    return null
  } finally {
    runningSet.delete(scheduleId)
  }
}
