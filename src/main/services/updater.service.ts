import { autoUpdater } from 'electron-updater'
import type { BrowserWindow } from 'electron'
import { app } from 'electron'

let mainWindow: BrowserWindow | null = null

export function initAutoUpdater(win: BrowserWindow): void {
  mainWindow = win

  // 자동 다운로드 비활성화 → 사용자 확인 후 다운로드
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // 로그
  autoUpdater.logger = {
    info: (msg: unknown) => console.log('[Updater]', msg),
    warn: (msg: unknown) => console.warn('[Updater]', msg),
    error: (msg: unknown) => console.error('[Updater]', msg),
    debug: (msg: unknown) => console.log('[Updater:debug]', msg)
  }

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] 업데이트 발견:', info.version)
    mainWindow?.webContents.send('updater:update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate
    })
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[Updater] 최신 버전입니다.')
    mainWindow?.webContents.send('updater:update-not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater:download-progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', () => {
    console.log('[Updater] 다운로드 완료. 재시작 대기 중...')
    mainWindow?.webContents.send('updater:update-downloaded')
  })

  autoUpdater.on('error', (err) => {
    console.error('[Updater] 오류:', err.message)
    mainWindow?.webContents.send('updater:error', err.message)
  })

  // 앱 시작 시 업데이트 확인 (5초 후)
  setTimeout(() => {
    checkForUpdates()
  }, 5000)
}

export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[Updater] 업데이트 확인 실패:', err)
  })
}

export function downloadUpdate(): void {
  autoUpdater.downloadUpdate().catch((err) => {
    console.error('[Updater] 다운로드 실패:', err)
  })
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}

export function getCurrentVersion(): string {
  return app.getVersion()
}
