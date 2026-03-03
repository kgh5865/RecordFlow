import { app } from 'electron'
import { join } from 'path'
import type { AppSettings } from '../../types/workflow.types'
import { loadSecureSync, saveSecureAsync } from '../utils/secure-storage'

const SETTINGS_FILE = join(app.getPath('userData'), 'settings.json')

const DEFAULT_SETTINGS: AppSettings = {
  backgroundMode: false,
  otpProfiles: []
}

export function loadSettings(): AppSettings {
  return loadSecureSync<AppSettings>(SETTINGS_FILE, DEFAULT_SETTINGS)
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await saveSecureAsync(SETTINGS_FILE, settings)
}
