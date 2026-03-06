import { app } from 'electron'
import { join } from 'path'
import type { StorageData } from '../../types/workflow.types'
import { loadSecureSync, saveSecureAsync } from '../utils/secure-storage'

const DATA_FILE = join(app.getPath('userData'), 'workflows.json')

const DEFAULT_DATA: StorageData = {
  version: '1.0',
  folders: [],
  workflows: [],
  schedules: [],
  scheduleFolders: []
}

let _cache: StorageData | null = null
// 동시 IPC 요청으로 인한 race condition 방지용 쓰기 lock
let _writeLock: Promise<void> = Promise.resolve()

export function loadStorage(): StorageData {
  if (_cache) return _cache
  const parsed = loadSecureSync<StorageData>(DATA_FILE, DEFAULT_DATA)
  // Migration: ensure schedules/scheduleFolders fields exist in older data files
  _cache = { ...parsed, schedules: parsed.schedules ?? [], scheduleFolders: parsed.scheduleFolders ?? [] }
  return _cache
}

export async function saveStorage(data: StorageData): Promise<void> {
  // 이전 쓰기가 완료될 때까지 대기 (race condition 방지)
  const prev = _writeLock
  let resolve: () => void
  _writeLock = new Promise<void>((r) => { resolve = r })
  await prev
  try {
    _cache = data
    await saveSecureAsync(DATA_FILE, data)
  } finally {
    resolve!()
  }
}
