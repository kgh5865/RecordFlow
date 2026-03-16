import { app, BrowserWindow, shell, Tray, Menu, nativeImage, dialog, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { loadStorage, saveStorage } from './services/storage.service'
import { stopCodegen } from './services/codegen.service'
import { isChromiumInstalled, installChromium } from './services/setup.service'
import { loadSettings, saveSettings } from './services/settings.service'
import {
  initScheduler,
  stopAllSchedules,
  setMainWindow
} from './services/scheduler.service'
import { registerIpcHandlers } from './ipc-handlers'
import { initAutoUpdater } from './services/updater.service'

// --- Single Instance Lock ---
// 다중 인스턴스 실행 방지: 두 번째 앱 실행 시 기존 창을 포커스
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })
}

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
    <div id="msg" style="font-size:11px;opacity:0.4;margin-top:8px;max-width:360px;word-break:break-all"></div>
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

  // 외부 링크는 기본 브라우저로 열기 (http/https만 허용)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url)
      }
    } catch { /* 무효 URL 무시 */ }
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

// --- IPC Handlers ---

registerIpcHandlers(
  () => mainWindow,
  setupTray,
  destroyTray
)

// --- App lifecycle ---

app.whenReady().then(async () => {
  // Playwright Chromium 설치 확인
  const installed = await isChromiumInstalled()
  if (!installed) {
    const setupWin = createSetupWindow()
    try {
      await installChromium((msg) => {
        process.stdout.write('[setup] ' + msg)
        // 셋업 창에 진행 상황 표시
        if (setupWin && !setupWin.isDestroyed()) {
          // 특수문자 제거 후 길이 제한하여 안전하게 표시
          const sanitized = msg.trim().slice(0, 80).replace(/[<>"'&]/g, '')
          setupWin.webContents.executeJavaScript(
            `document.getElementById('msg').textContent = ${JSON.stringify(sanitized)}`
          ).catch(() => {})
        }
      })
    } catch (err) {
      console.error('[setup] Chromium 설치 실패:', err)
      await dialog.showMessageBox({
        type: 'error',
        title: 'Chromium 설치 실패',
        message: 'Playwright Chromium 브라우저 설치에 실패했습니다.\n네트워크 연결을 확인하고 앱을 다시 실행해 주세요.',
        detail: err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'
      })
    }
    if (!setupWin.isDestroyed()) setupWin.close()

    // 설치 후 재확인
    const nowInstalled = await isChromiumInstalled()
    if (!nowInstalled) {
      app.quit()
      return
    }
  }

  createWindow()

  // 저장된 settings에 따라 트레이 초기화
  const settings = loadSettings()
  if (settings.backgroundMode) setupTray()

  // 스케줄러 초기화: 저장된 활성 스케줄 등록
  const storage = loadStorage()

  // 평문 → 암호화 자동 마이그레이션 (safeStorage 사용 가능 시)
  if (safeStorage.isEncryptionAvailable()) {
    await saveStorage(storage)
    await saveSettings(settings)
  } else {
    console.warn('[Security] safeStorage 암호화를 사용할 수 없습니다. 데이터가 평문으로 저장됩니다.')
  }
  if (mainWindow) {
    initScheduler(mainWindow, storage.schedules)
    initAutoUpdater(mainWindow)
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
