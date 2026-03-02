import { app } from 'electron'
import { join } from 'path'
import type { AppSettings } from '../../types/workflow.types'
import { loadJSONSync, saveJSONAsync } from '../utils/json-storage'

const SETTINGS_FILE = join(app.getPath('userData'), 'settings.json')

const DEFAULT_SETTINGS: AppSettings = {
  backgroundMode: false,
  otpProfiles: []
}

export function loadSettings(): AppSettings {
  return loadJSONSync<AppSettings>(SETTINGS_FILE, DEFAULT_SETTINGS)
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await saveJSONAsync(SETTINGS_FILE, settings)
}
