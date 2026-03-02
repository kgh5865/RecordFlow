import { readFileSync, existsSync, mkdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import { dirname } from 'path'

/** 파일에서 JSON을 읽어 defaultValue와 merge하여 반환 (동기, 메인 프로세스 이벤트 핸들러에서 사용) */
export function loadJSONSync<T extends object>(filePath: string, defaultValue: T): T {
  try {
    if (!existsSync(filePath)) return { ...defaultValue }
    const raw = readFileSync(filePath, 'utf-8')
    return { ...defaultValue, ...JSON.parse(raw) } as T
  } catch {
    return { ...defaultValue }
  }
}

/** JSON을 파일에 비동기로 저장 */
export async function saveJSONAsync(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}
