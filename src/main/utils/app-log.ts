import { appendFileSync, existsSync, renameSync, statSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const LOG_FILE = join(app.getPath('userData'), 'app.log')
const MAX_BYTES = 2_000_000

/**
 * 파일 로그. 앱이 며칠씩 떠 있는 동안 스케줄러가 살아있었는지 사후에 확인할 유일한 수단이다.
 * (콘솔 출력은 패키징된 앱에서 아무 데도 남지 않는다.)
 */
export function logLine(tag: string, message: string): void {
  const line = `${new Date().toISOString()} [${tag}] ${message}\n`
  try {
    if (existsSync(LOG_FILE) && statSync(LOG_FILE).size > MAX_BYTES) {
      renameSync(LOG_FILE, `${LOG_FILE}.1`) // ponytail: 1세대만 보관. 더 필요하면 그때 늘린다
    }
    appendFileSync(LOG_FILE, line)
  } catch {
    /* 로깅 실패로 앱을 죽이지 않는다 */
  }
  console.log(line.trimEnd())
}

export function getLogFilePath(): string {
  return LOG_FILE
}
