import { safeStorage } from 'electron'
import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { dirname } from 'path'

/** 암호화 파일 식별 매직 헤더 (6바이트) */
const ENCRYPTED_HEADER = Buffer.from('RFENC1')

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function isEncryptedFile(buf: Buffer): boolean {
  return (
    buf.length >= ENCRYPTED_HEADER.length &&
    buf.subarray(0, ENCRYPTED_HEADER.length).equals(ENCRYPTED_HEADER)
  )
}

function isPlaintextJSON(buf: Buffer): boolean {
  if (buf.length === 0) return false
  const first = buf[0] === 0xef ? buf[3] : buf[0] // UTF-8 BOM 스킵
  return first === 0x7b || first === 0x5b // '{' 또는 '['
}

/**
 * 암호화된 파일을 읽어 복호화 후 JSON 파싱.
 * 평문 JSON 파일(마이그레이션 전)도 자동 감지하여 정상 파싱.
 */
export function loadSecureSync<T extends object>(filePath: string, defaultValue: T): T {
  try {
    if (!existsSync(filePath)) return { ...defaultValue }

    const raw = readFileSync(filePath)

    if (isEncryptedFile(raw)) {
      const encryptedData = raw.subarray(ENCRYPTED_HEADER.length)
      const decrypted = safeStorage.decryptString(encryptedData)
      return { ...defaultValue, ...JSON.parse(decrypted) } as T
    }

    if (isPlaintextJSON(raw)) {
      return { ...defaultValue, ...JSON.parse(raw.toString('utf-8')) } as T
    }

    return { ...defaultValue }
  } catch {
    // 메인 파일 실패 시 백업 파일 시도
    try {
      const bakPath = filePath + '.bak'
      if (!existsSync(bakPath)) return { ...defaultValue }

      const bak = readFileSync(bakPath)
      if (isEncryptedFile(bak)) {
        const decrypted = safeStorage.decryptString(bak.subarray(ENCRYPTED_HEADER.length))
        return { ...defaultValue, ...JSON.parse(decrypted) } as T
      }
      if (isPlaintextJSON(bak)) {
        return { ...defaultValue, ...JSON.parse(bak.toString('utf-8')) } as T
      }
    } catch {
      /* 백업도 실패하면 기본값 반환 */
    }
    return { ...defaultValue }
  }
}

/** 데이터를 JSON 직렬화 후 safeStorage로 암호화하여 저장. 저장 전 .bak 백업 생성. */
export async function saveSecureAsync(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  // 기존 파일 백업
  if (existsSync(filePath)) {
    copyFileSync(filePath, filePath + '.bak')
  }

  const json = JSON.stringify(data, null, 2)

  if (!canEncrypt()) {
    // 암호화 불가 시 평문 폴백
    await writeFile(filePath, json, 'utf-8')
    return
  }

  const encrypted = safeStorage.encryptString(json)
  const output = Buffer.concat([ENCRYPTED_HEADER, encrypted])
  await writeFile(filePath, output)
}
