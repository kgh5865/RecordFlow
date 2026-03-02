import { useState, useRef } from 'react'
import jsQR from 'jsqr'
import { useSettingsStore } from '../../stores/settingsStore'
import type { OtpProfile } from '../../../types/workflow.types'
import { parseOtpAuthUri, parseMigrationQr } from '../../utils/otpUtils'

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

export function OtpSection() {
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
    try {
      await saveSettings({ ...settings, otpProfiles: [...settings.otpProfiles, newProfile] })
      setOtpName('')
      setOtpSecret('')
      setAddingOtp(false)
    } catch (err) {
      setQrError(`저장 오류: ${String(err)}`)
    }
  }

  const handleDeleteOtp = async (id: string) => {
    try {
      await saveSettings({
        ...settings,
        otpProfiles: settings.otpProfiles.filter((p) => p.id !== id)
      })
    } catch (err) {
      console.error('[OTP] delete error:', err)
    }
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
    try {
      await saveSettings({ ...settings, otpProfiles: [...settings.otpProfiles, ...newProfiles] })
      setMigrationEntries(null)
      setSelectedMigrationIndices(new Set())
      setQrError('')
    } catch (err) {
      setQrError(`저장 오류: ${String(err)}`)
    }
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
