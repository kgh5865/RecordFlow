import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, dialog } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { loadStorage, saveStorage } from './services/storage.service'
import { startCodegen, stopCodegen } from './services/codegen.service'
import { runWorkflow } from './services/runner.service'
import { isChromiumInstalled, installChromium } from './services/setup.service'
import { loadSettings, saveSettings } from './services/settings.service'
import {
  initScheduler,
  registerSchedule,
  unregisterSchedule,
  stopAllSchedules,
  calcNextRunAt,
  isValidCron,
  getScheduleLogs,
  setMainWindow
} from './services/scheduler.service'
import type { StorageData, WorkflowStep, Schedule } from '../types/workflow.types'
import { randomUUID } from 'crypto'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

// --- Tray ---

function createTrayIcon() {
  // Try resources/tray-icon.png, fall back to icon.ico, then empty
  const pngPath = join(__dirname, '../../resources/tray-icon.png')
  const icoPath = join(__dirname, '../../resources/icon.ico')
  if (existsSync(pngPath)) return nativeImage.createFromPath(pngPath)
  if (existsSync(icoPath)) return nativeImage.createFromPath(icoPath)
  return nativeImage.createEmpty()
}

function setupTray(): void {
  if (tray) return
  tray = new Tray(createTrayIcon())
  const menu = Menu.buildFromTemplate([
    {
      label: 'RecordFlow 열기',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
  tray.setToolTip('RecordFlow')
  tray.on('click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function destroyTray(): void {
  tray?.destroy()
  tray = null
}

// --- Windows ---

function createSetupWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 220,
    resizable: false,
    center: true,
    frame: false,
    alwaysOnTop: true,
    title: 'RecordFlow - 설정 중...',
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  })

  win.loadURL(
    `data:text/html;charset=utf-8,` +
    encodeURIComponent(`<!DOCTYPE html>
<html>
<body style="margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;
             display:flex;align-items:center;justify-content:center;height:100vh;">
  <div style="text-align:center;padding:32px">
    <div style="font-size:24px;font-weight:700;margin-bottom:8px">RecordFlow</div>
    <div style="font-size:14px;margin-bottom:4px">Playwright Chromium 설치 중...</div>
    <div style="font-size:12px;opacity:0.5">처음 실행 시 한 번만 진행됩니다 (~170 MB)</div>
  </div>
</body>
</html>`)
  )

  return win
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'RecordFlow',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 개발: Vite dev server / 프로덕션: 빌드된 파일
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 외부 링크는 기본 브라우저로 열기
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 창 닫기 처리: backgroundMode에 따라 트레이로 최소화 또는 종료
  mainWindow.on('close', (event) => {
    const settings = loadSettings()
    if (settings.backgroundMode) {
      event.preventDefault()
      mainWindow?.hide()
    }
    // backgroundMode=false → 기본 종료 동작 (Renderer에서 경고 처리)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    setMainWindow(null)
  })

  setMainWindow(mainWindow)
}

// --- Storage IPC ---

ipcMain.handle('storage:load', () => loadStorage())

ipcMain.handle('storage:save', (_event, data: StorageData) => {
  // Merge: preserve schedules if not provided by caller
  const existing = loadStorage()
  saveStorage({ ...existing, ...data, schedules: data.schedules ?? existing.schedules ?? [] })
})

// --- Codegen IPC ---

ipcMain.handle('codegen:start', (_event, url: string) => {
  if (!mainWindow) return
  startCodegen(mainWindow, url)
})

ipcMain.handle('codegen:stop', () => stopCodegen())

// --- Runner IPC ---

ipcMain.handle('runner:start', async (_event, steps: WorkflowStep[]) => {
  if (!mainWindow) return
  await runWorkflow(mainWindow, steps)
})

// --- Schedule IPC ---

ipcMain.handle('schedule:list', () => {
  return loadStorage().schedules
})

ipcMain.handle('schedule:create', (_event, data: Omit<Schedule, 'id' | 'createdAt' | 'nextRunAt'>) => {
  const storage = loadStorage()
  const now = new Date().toISOString()

  const schedule: Schedule = {
    ...data,
    id: randomUUID(),
    createdAt: now,
    nextRunAt: data.type === 'cron' && data.cronExpression ? calcNextRunAt(data.cronExpression) : undefined
  }

  storage.schedules.push(schedule)
  saveStorage(storage)

  if (schedule.enabled) {
    registerSchedule(schedule)
  }

  return schedule
})

ipcMain.handle('schedule:update', (_event, id: string, patch: Partial<Schedule>) => {
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
  saveStorage(storage)

  // Re-register job with updated settings
  unregisterSchedule(id)
  if (updated.enabled) registerSchedule(updated)

  return updated
})

ipcMain.handle('schedule:delete', (_event, id: string) => {
  const storage = loadStorage()
  unregisterSchedule(id)
  storage.schedules = storage.schedules.filter((s) => s.id !== id)
  saveStorage(storage)
})

ipcMain.handle('schedule:toggle', (_event, id: string, enabled: boolean) => {
  const storage = loadStorage()
  const idx = storage.schedules.findIndex((s) => s.id === id)
  if (idx === -1) throw new Error('Schedule not found')

  const updated: Schedule = { ...storage.schedules[idx], enabled }
  storage.schedules[idx] = updated
  saveStorage(storage)

  if (enabled) {
    registerSchedule(updated)
  } else {
    unregisterSchedule(id)
  }

  return updated
})

ipcMain.handle('schedule:logs', (_event, scheduleId: string, limit?: number) => {
  return getScheduleLogs(scheduleId, limit)
})

ipcMain.handle('schedule:validate-cron', (_event, expression: string) => {
  return isValidCron(expression)
})

// --- Settings IPC ---

ipcMain.handle('settings:get', () => loadSettings())

ipcMain.handle('settings:save', (_event, settings) => {
  saveSettings(settings)
  // Tray 조건부 생성/제거
  if (settings.backgroundMode) {
    setupTray()
  } else {
    destroyTray()
  }
})

// --- App lifecycle ---

app.whenReady().then(async () => {
  // Playwright Chromium 설치 확인
  const installed = await isChromiumInstalled()
  if (!installed) {
    const setupWin = createSetupWindow()
    try {
      await installChromium((msg) => process.stdout.write('[setup] ' + msg))
    } catch (err) {
      console.error('[setup] Chromium 설치 실패:', err)
    }
    setupWin.close()
  }

  createWindow()

  // 저장된 settings에 따라 트레이 초기화
  const settings = loadSettings()
  if (settings.backgroundMode) setupTray()

  // 스케줄러 초기화: 저장된 활성 스케줄 등록
  const storage = loadStorage()
  if (mainWindow) {
    initScheduler(mainWindow, storage.schedules)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopAllSchedules()
  if (process.platform !== 'darwin') {
    stopCodegen()
    app.quit()
  }
})

// backgroundMode=false + 활성 스케줄 있을 때 경고 (Renderer beforeunload로 처리)
// Electron: will-prevent-unload → show confirm dialog
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-prevent-unload', (event) => {
    const settings = loadSettings()
    const storage = loadStorage()
    const hasActive = storage.schedules.some((s) => s.enabled)

    if (!settings.backgroundMode && hasActive) {
      const choice = dialog.showMessageBoxSync({
        type: 'question',
        buttons: ['계속 종료', '취소'],
        defaultId: 1,
        title: 'RecordFlow',
        message: '활성 스케줄이 중단됩니다',
        detail: '백그라운드 실행이 꺼져 있어 앱 종료 시 예약된 스케줄이 실행되지 않습니다.'
      })
      if (choice === 0) event.preventDefault()
    } else {
      event.preventDefault()
    }
  })
})
