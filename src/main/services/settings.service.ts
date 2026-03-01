import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import type { AppSettings } from '../../types/workflow.types'

const DATA_DIR = app.getPath('userData')
const SETTINGS_FILE = join(DATA_DIR, 'settings.json')

const DEFAULT_SETTINGS: AppSettings = {
  backgroundMode: false,
  otpProfiles: []
}

export function loadSettings(): AppSettings {
  try {
    if (!existsSync(SETTINGS_FILE)) return { ...DEFAULT_SETTINGS }
    const raw = readFileSync(SETTINGS_FILE, 'utf-8')
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: AppSettings): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8')
}
