import { safeStorage } from 'electron'
import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { dirname } from 'path'
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto'
import { homedir, hostname } from 'os'

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

// ── Recovery Backup (AES-256-GCM + PBKDF2) ──

const RECOVERY_HEADER = Buffer.from('RFREC1')
const RECOVERY_VERSION = 0x01
const PBKDF2_ITERATIONS = 310_000
const KEY_LENGTH = 32
const IV_LENGTH = 12
const SALT_LENGTH = 32

function deriveRecoveryKey(salt: Buffer): Buffer {
  const material = `${homedir()}:${hostname()}`
  return pbkdf2Sync(material, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512')
}

export async function saveRecoveryBackup(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const salt = randomBytes(SALT_LENGTH)
  const iv = randomBytes(IV_LENGTH)
  const key = deriveRecoveryKey(salt)

  const json = JSON.stringify(data)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(json, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()

  const output = Buffer.concat([
    RECOVERY_HEADER,
    Buffer.from([RECOVERY_VERSION]),
    salt,
    iv,
    tag,
    encrypted
  ])
  await writeFile(filePath, output)
}

export function loadRecoveryBackup<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) return null

    const buf = readFileSync(filePath)
    const headerLen = RECOVERY_HEADER.length + 1 // header + version byte
    const minLen = headerLen + SALT_LENGTH + IV_LENGTH + 16 // 16 = auth tag
    if (buf.length < minLen) return null
    if (!buf.subarray(0, RECOVERY_HEADER.length).equals(RECOVERY_HEADER)) return null
    if (buf[RECOVERY_HEADER.length] !== RECOVERY_VERSION) return null

    let offset = headerLen
    const salt = buf.subarray(offset, offset + SALT_LENGTH); offset += SALT_LENGTH
    const iv = buf.subarray(offset, offset + IV_LENGTH); offset += IV_LENGTH
    const tag = buf.subarray(offset, offset + 16); offset += 16
    const encrypted = buf.subarray(offset)

    const key = deriveRecoveryKey(salt)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return JSON.parse(decrypted.toString('utf-8')) as T
  } catch {
    return null
  }
}

export function hasRecoveryBackup(filePath: string): boolean {
  try {
    if (!existsSync(filePath)) return false
    const buf = readFileSync(filePath, { flag: 'r' })
    return (
      buf.length >= RECOVERY_HEADER.length + 1 &&
      buf.subarray(0, RECOVERY_HEADER.length).equals(RECOVERY_HEADER) &&
      buf[RECOVERY_HEADER.length] === RECOVERY_VERSION
    )
  } catch {
    return false
  }
}

// ── Folder Password Hashing (PBKDF2) ──

const FOLDER_PW_ITERATIONS = 100_000
const FOLDER_PW_KEY_LENGTH = 32

export function hashFolderPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(FOLDER_PW_KEY_LENGTH)
  const hash = pbkdf2Sync(password, salt, FOLDER_PW_ITERATIONS, FOLDER_PW_KEY_LENGTH, 'sha512')
  return { hash: hash.toString('hex'), salt: salt.toString('hex') }
}

export function verifyFolderPassword(password: string, hashHex: string, saltHex: string): boolean {
  const salt = Buffer.from(saltHex, 'hex')
  const hash = pbkdf2Sync(password, salt, FOLDER_PW_ITERATIONS, FOLDER_PW_KEY_LENGTH, 'sha512')
  const expected = Buffer.from(hashHex, 'hex')
  if (hash.length !== expected.length) return false
  return timingSafeEqual(hash, expected)
}
