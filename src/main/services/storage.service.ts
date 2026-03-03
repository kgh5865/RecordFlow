import { app } from 'electron'
import { join } from 'path'
import type { StorageData } from '../../types/workflow.types'
import { loadSecureSync, saveSecureAsync } from '../utils/secure-storage'

const DATA_FILE = join(app.getPath('userData'), 'workflows.json')

const DEFAULT_DATA: StorageData = {
  version: '1.0',
  folders: [],
  workflows: [],
  schedules: []
}

let _cache: StorageData | null = null

export function loadStorage(): StorageData {
  if (_cache) return _cache
  const parsed = loadSecureSync<StorageData>(DATA_FILE, DEFAULT_DATA)
  // Migration: ensure schedules field exists in older data files
  _cache = { ...parsed, schedules: parsed.schedules ?? [] }
  return _cache
}

export async function saveStorage(data: StorageData): Promise<void> {
  _cache = data
  await saveSecureAsync(DATA_FILE, data)
}
