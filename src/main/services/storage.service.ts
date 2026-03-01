import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import type { StorageData } from '../../types/workflow.types'

const DATA_DIR = app.getPath('userData')
const DATA_FILE = join(DATA_DIR, 'workflows.json')

const DEFAULT_DATA: StorageData = {
  version: '1.0',
  folders: [],
  workflows: [],
  schedules: []
}

export function loadStorage(): StorageData {
  try {
    if (!existsSync(DATA_FILE)) return { ...DEFAULT_DATA }
    const raw = readFileSync(DATA_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as StorageData
    // Migration: ensure schedules field exists
    return { ...DEFAULT_DATA, ...parsed, schedules: parsed.schedules ?? [] }
  } catch {
    return { ...DEFAULT_DATA }
  }
}

export function saveStorage(data: StorageData): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
}
