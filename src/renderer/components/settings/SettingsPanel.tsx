import { useState, useRef } from 'react'
import jsQR from 'jsqr'
import { useSettingsStore } from '../../stores/settingsStore'
import { useUiStore } from '../../stores/uiStore'
import type { OtpProfile } from '../../../types/workflow.types'

// --- Module-level helpers ---

function parseOtpAuthUri(uri: string): { name: string; secret: string } | null {
  const match = uri.trim().match(/^otpauth:\/\/(totp|hotp)\/([^?]*)\??(.*)$/i)
  if (!match) return null
  const label = decodeURIComponent(match[2].replace(/\+/g, ' '))
  const params = new URLSearchParams(match[3])
  const secret = params.get('secret')?.replace(/\s/g, '').toUpperCase()
  if (!secret) return null
  const issuer = params.get('issuer') ?? ''
  const name = issuer || (label.includes(':') ? label.split(':')[0] : label) || 'OTP'
  return { name: name.trim(), secret }
}

function base32Encode(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let result = ''
  let bits = 0
  let value = 0
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) result += alphabet[(value << (5 - bits)) & 31]
  return result
}

function readVarint(data: Uint8Array, offset: number): [number, number] {
  let result = 0
  let shift = 0
  while (offset < data.length) {
    const byte = data[offset++]
    result |= (byte & 0x7f) << shift
    shift += 7
    if ((byte & 0x80) === 0) break
  }
  return [result, offset]
}

function parseProtoFields(data: Uint8Array): Map<number, (number | Uint8Array)[]> {
  const fields = new Map<number, (number | Uint8Array)[]>()
  let offset = 0
  while (offset < data.length) {
    let tag: number
    ;[tag, offset] = readVarint(data, offset)
    const fieldNum = tag >> 3
    const wireType = tag & 0x7
    if (wireType === 0) {
      let value: number
      ;[value, offset] = readVarint(data, offset)
      if (!fields.has(fieldNum)) fields.set(fieldNum, [])
      fields.get(fieldNum)!.push(value)
    } else if (wireType === 2) {
      let len: number
      ;[len, offset] = readVarint(data, offset)
      const bytes = data.slice(offset, offset + len)
      offset += len
      if (!fields.has(fieldNum)) fields.set(fieldNum, [])
      fields.get(fieldNum)!.push(bytes)
    } else {
      break
    }
  }
  return fields
}

function parseMigrationQr(raw: string): Array<{ name: string; secret: string }> | null {
  const match = raw.match(/[?&]data=([^&]+)/)
  if (!match) return null
  try {
    const binaryStr = atob(decodeURIComponent(match[1]))
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

    const payload = parseProtoFields(bytes)
    const otpParams = payload.get(1) ?? []
    const entries: Array<{ name: string; secret: string }> = []

    for (const blob of otpParams) {
      if (!(blob instanceof Uint8Array)) continue
      const params = parseProtoFields(blob)
      const secretBytes = params.get(1)?.[0]
      const nameBytes = params.get(2)?.[0]
      const issuerBytes = params.get(3)?.[0]
      if (!(secretBytes instanceof Uint8Array)) continue
      const secret = base32Encode(secretBytes)
      const name = nameBytes instanceof Uint8Array ? new TextDecoder().decode(nameBytes) : ''
      const issuer = issuerBytes instanceof Uint8Array ? new TextDecoder().decode(issuerBytes) : ''
      const displayName = (issuer || name || 'OTP').trim()
      entries.push({ name: displayName, secret })
    }
    return entries.length > 0 ? entries : null
  } catch {
    return null
  }
}

async function decodeQrFromFile(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height)
      URL.revokeObjectURL(url)
      resolve(code?.data ?? null)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

// --- BackgroundModeSection ---

function BackgroundModeSection({ backgroundMode, onToggle }: { backgroundMode: boolean; onToggle: () => void }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold text-[#888] uppercase tracking-wider mb-3">실행</h3>

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="text-[13px] text-[#cccccc] mb-1">백그라운드 실행</div>
          <div className="text-[11px] text-[#666] leading-relaxed">
            창 닫기(✕) 시 앱을 종료하는 대신 시스템 트레이로 최소화합니다.
            예약 스케줄이 계속 동작합니다.
          </div>
          {backgroundMode && (
            <div className="text-[10px] text-[#4caf50] mt-1">
              ● 트레이 아이콘으로 앱을 열거나 종료할 수 있습니다.
            </div>
          )}
        </div>
        <button
          onClick={onToggle}
          className={`shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            backgroundMode ? 'bg-[#4caf50]' : 'bg-[#3c3c3c]'
          }`}
          role="switch"
          aria-checked={backgroundMode}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              backgroundMode ? 'translate-x-[18px]' : 'translate-x-[3px]'
            }`}
          />
        </button>
      </div>

      {!backgroundMode && (
        <div className="mt-3 text-[11px] text-[#666] bg-[#2a2a2a] rounded p-2">
          ※ OFF 상태에서 활성 스케줄이 있는 경우 창 닫기 시 경고가 표시됩니다.
        </div>
      )}
    </section>
  )
}

// --- OtpSection ---

function OtpSection() {
  const { settings, saveSettings } = useSettingsStore()

  const [addingOtp, setAddingOtp] = useState(false)
  const [otpName, setOtpName] = useState('')
  const [otpSecret, setOtpSecret] = useState('')
  const [qrError, setQrError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [migrationEntries, setMigrationEntries] = useState<Array<{ name: string; secret: string }> | null>(null)
  const [selectedMigrationIndices, setSelectedMigrationIndices] = useState<Set<number>>(new Set())

  const handleAddOtp = async () => {
    const name = otpName.trim()
    const secret = otpSecret.trim().replace(/\s/g, '').toUpperCase()
    if (!name || !secret) return
    if (settings.otpProfiles.some((p) => p.name === name)) {
      setQrError(`"${name}" 이름이 이미 존재합니다.`)
      return
    }
    const newProfile: OtpProfile = { id: crypto.randomUUID(), name, secret }
    await saveSettings({ ...settings, otpProfiles: [...settings.otpProfiles, newProfile] })
    setOtpName('')
    setOtpSecret('')
    setAddingOtp(false)
  }

  const handleDeleteOtp = async (id: string) => {
    await saveSettings({
      ...settings,
      otpProfiles: settings.otpProfiles.filter((p) => p.id !== id)
    })
  }

  const handleAddMigrationOtps = async () => {
    if (!migrationEntries) return
    const existingNames = new Set(settings.otpProfiles.map((p) => p.name))
    const toAdd = migrationEntries
      .filter((_, i) => selectedMigrationIndices.has(i))
      .filter((e) => !existingNames.has(e.name))
    const skipped = migrationEntries
      .filter((_, i) => selectedMigrationIndices.has(i))
      .filter((e) => existingNames.has(e.name))

    if (toAdd.length === 0) {
      setQrError(skipped.length > 0 ? '선택한 계정이 이미 모두 등록되어 있습니다.' : '추가할 계정을 선택하세요.')
      return
    }
    const newProfiles: OtpProfile[] = toAdd.map((e) => ({ id: crypto.randomUUID(), name: e.name, secret: e.secret }))
    await saveSettings({ ...settings, otpProfiles: [...settings.otpProfiles, ...newProfiles] })
    setMigrationEntries(null)
    setSelectedMigrationIndices(new Set())
    setQrError('')
  }

  const toggleMigrationIndex = (i: number) => {
    setSelectedMigrationIndices((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const handleQrScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setQrError('')
    const raw = await decodeQrFromFile(file)
    if (!raw) { setQrError('QR 코드를 인식할 수 없습니다.'); return }

    const parsed = parseOtpAuthUri(raw)
    if (parsed) {
      setOtpName(parsed.name)
      setOtpSecret(parsed.secret)
      setAddingOtp(true)
      setMigrationEntries(null)
      return
    }

    if (raw.startsWith('otpauth-migration://')) {
      const entries = parseMigrationQr(raw)
      if (!entries) { setQrError('migration QR 파싱에 실패했습니다.'); return }
      setMigrationEntries(entries)
      const existingNames = new Set(settings.otpProfiles.map((p) => p.name))
      setSelectedMigrationIndices(new Set(entries.map((_, i) => i).filter((i) => !existingNames.has(entries[i].name))))
      setAddingOtp(false)
      return
    }

    setQrError('OTP QR 코드가 아닙니다.')
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-semibold text-[#888] uppercase tracking-wider">
          OTP 프로필
        </h3>
        {!addingOtp && !migrationEntries && (
          <button
            onClick={() => setAddingOtp(true)}
            className="text-[11px] text-[#007acc] hover:text-[#1a9fe0] transition-colors"
          >
            + 추가
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleQrScan}
      />

      {migrationEntries && (
        <div className="bg-[#252526] border border-[#3c3c3c] rounded p-3 mb-3 space-y-2">
          <div className="text-[11px] text-[#cccccc] mb-2">
            QR에서 {migrationEntries.length}개 계정을 찾았습니다.
          </div>
          <div className="space-y-1">
            {migrationEntries.map((entry, i) => {
              const alreadyExists = settings.otpProfiles.some((p) => p.name === entry.name)
              return (
                <label
                  key={i}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                    alreadyExists ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#2a2d2e]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedMigrationIndices.has(i)}
                    disabled={alreadyExists}
                    onChange={() => !alreadyExists && toggleMigrationIndex(i)}
                    className="accent-[#007acc]"
                  />
                  <span className="flex items-center gap-1 px-1.5 py-0.5 bg-[#1a2f3f] border border-[#007acc]/50 text-[#4fc3f7] text-[10px] rounded">
                    🔑 <span className="font-medium">{entry.name}</span>
                  </span>
                  {alreadyExists && (
                    <span className="text-[10px] text-[#555]">이미 등록됨</span>
                  )}
                </label>
              )
            })}
          </div>
          {qrError && <div className="text-[10px] text-red-400">{qrError}</div>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAddMigrationOtps}
              className="px-3 py-1 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white transition-colors"
            >
              선택 추가 ({selectedMigrationIndices.size})
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1 text-xs rounded border border-[#444] hover:border-[#007acc] text-[#888] hover:text-[#4fc3f7] transition-colors"
            >
              📷 QR
            </button>
            <button
              onClick={() => { setMigrationEntries(null); setSelectedMigrationIndices(new Set()); setQrError('') }}
              className="px-3 py-1 text-xs rounded bg-[#3c3c3c] hover:bg-[#505050] text-[#cccccc] transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {addingOtp && (
        <div className="bg-[#252526] border border-[#3c3c3c] rounded p-3 mb-3 space-y-2">
          <div>
            <label className="block text-[10px] text-[#888] mb-1">이름 (참조용)</label>
            <input
              autoFocus
              value={otpName}
              onChange={(e) => setOtpName(e.target.value)}
              placeholder="예: gmail, github"
              className="w-full px-2 py-1 text-xs bg-[#3c3c3c] text-[#cccccc] border border-[#555] rounded outline-none focus:border-[#007acc] caret-white"
            />
          </div>
          <div>
            <label className="block text-[10px] text-[#888] mb-1">Secret Key (Base32)</label>
            <input
              value={otpSecret}
              onChange={(e) => setOtpSecret(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddOtp()}
              placeholder="예: JBSWY3DPEHPK3PXP"
              className="w-full px-2 py-1 text-xs bg-[#3c3c3c] text-[#cccccc] border border-[#555] rounded outline-none focus:border-[#007acc] caret-white font-mono"
            />
          </div>
          {qrError && (
            <div className="text-[10px] text-red-400">{qrError}</div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAddOtp}
              className="px-3 py-1 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white transition-colors"
            >
              저장
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1 text-xs rounded border border-[#444] hover:border-[#007acc] text-[#888] hover:text-[#4fc3f7] transition-colors"
            >
              📷 QR
            </button>
            <button
              onClick={() => { setAddingOtp(false); setOtpName(''); setOtpSecret(''); setQrError('') }}
              className="px-3 py-1 text-xs rounded bg-[#3c3c3c] hover:bg-[#505050] text-[#cccccc] transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {settings.otpProfiles.length === 0 && !addingOtp && !migrationEntries ? (
        <div className="text-[11px] text-[#555] italic">등록된 OTP 프로필이 없습니다.</div>
      ) : (
        <div className="space-y-1">
          {settings.otpProfiles.map((profile) => (
            <div
              key={profile.id}
              className="flex items-center justify-between px-3 py-2 bg-[#252526] border border-[#3c3c3c] rounded group"
            >
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-[#1a2f3f] border border-[#007acc]/50 text-[#4fc3f7] text-[10px] rounded">
                  🔑 <span className="font-medium">{profile.name}</span>
                </span>
              </div>
              <button
                onClick={() => handleDeleteOtp(profile.id)}
                className="text-[#555] hover:text-red-400 transition-colors text-xs opacity-0 group-hover:opacity-100"
                title="삭제"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 text-[10px] text-[#555] bg-[#2a2a2a] rounded p-2 leading-relaxed">
        step의 value 편집 시{' '}
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#1a2f3f] border border-[#007acc]/50 text-[#4fc3f7] rounded align-middle">
          🔑 <span className="font-medium">이름</span>
        </span>{' '}
        배지를 선택하면 실행 시점에 OTP 코드가 자동 생성됩니다.
      </div>
    </section>
  )
}

// --- SettingsPanel ---

export function SettingsPanel() {
  const { settings, saveSettings } = useSettingsStore()
  const setSettingsPanelOpen = useUiStore((s) => s.setSettingsPanelOpen)

  const handleToggleBackground = async () => {
    await saveSettings({ ...settings, backgroundMode: !settings.backgroundMode })
  }

  return (
    <div className="flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#3c3c3c] shrink-0">
        <span className="text-sm font-medium text-[#cccccc]">설정</span>
        <button
          onClick={() => setSettingsPanelOpen(false)}
          className="text-[#666] hover:text-[#ccc] transition-colors"
          title="닫기"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <BackgroundModeSection
          backgroundMode={settings.backgroundMode}
          onToggle={handleToggleBackground}
        />
        <OtpSection />
      </div>
    </div>
  )
}
