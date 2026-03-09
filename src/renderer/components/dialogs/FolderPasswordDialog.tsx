import { useState, useCallback } from 'react'
import { Input } from '../ui/Input'

type Mode = 'verify' | 'set'

interface Props {
  mode: Mode
  folderName: string
  hasExistingPassword?: boolean
  onVerify?: (password: string) => Promise<boolean>
  onSet?: (password: string | null) => Promise<void>
  onClose: () => void
}

export function FolderPasswordDialog({ mode, folderName, hasExistingPassword, onVerify, onSet, onClose }: Props) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleVerify = useCallback(async () => {
    if (!password.trim()) { setError('암호를 입력하세요.'); return }
    setLoading(true)
    setError(null)
    try {
      const ok = await onVerify?.(password)
      if (!ok) setError('암호가 일치하지 않습니다.')
    } finally {
      setLoading(false)
    }
  }, [password, onVerify])

  const handleSet = useCallback(async () => {
    if (hasExistingPassword && !currentPassword.trim()) {
      setError('현재 암호를 입력하세요.')
      return
    }
    if (!password.trim()) { setError('새 암호를 입력하세요.'); return }
    if (password !== confirmPassword) { setError('암호가 일치하지 않습니다.'); return }
    if (password.length < 4) { setError('암호는 4자 이상이어야 합니다.'); return }
    setLoading(true)
    setError(null)
    try {
      if (hasExistingPassword) {
        const ok = await onVerify?.(currentPassword)
        if (!ok) { setError('현재 암호가 일치하지 않습니다.'); setLoading(false); return }
      }
      await onSet?.(password)
    } finally {
      setLoading(false)
    }
  }, [password, confirmPassword, currentPassword, hasExistingPassword, onVerify, onSet])

  const handleRemove = useCallback(async () => {
    if (!currentPassword.trim()) { setError('현재 암호를 입력하세요.'); return }
    setLoading(true)
    setError(null)
    try {
      const ok = await onVerify?.(currentPassword)
      if (!ok) { setError('암호가 일치하지 않습니다.'); setLoading(false); return }
      await onSet?.(null)
    } finally {
      setLoading(false)
    }
  }, [currentPassword, onVerify, onSet])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (mode === 'verify') handleVerify()
      else handleSet()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-[360px] bg-[#2d2d2d] border border-[#3c3c3c] rounded-lg shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3c3c3c]">
          <span className="text-sm font-semibold text-[#cccccc]">
            {mode === 'verify' ? '🔒 폴더 암호 입력' : hasExistingPassword ? '🔑 암호 변경' : '🔒 암호 설정'}
          </span>
          <button onClick={onClose} className="text-[#888] hover:text-[#ccc] text-lg leading-none">×</button>
        </div>

        <div className="px-4 py-3 space-y-3">
          <p className="text-[12px] text-[#999]">
            {mode === 'verify'
              ? <><span className="text-[#dcb67a]">{folderName}</span> 폴더에 접근하려면 암호를 입력하세요.</>
              : <><span className="text-[#dcb67a]">{folderName}</span> 폴더의 접근 암호를 {hasExistingPassword ? '변경' : '설정'}합니다.</>
            }
          </p>

          {/* 인증 모드 */}
          {mode === 'verify' && (
            <Input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null) }}
              placeholder="암호 입력"
              className="!text-xs"
              autoFocus
            />
          )}

          {/* 설정 모드 */}
          {mode === 'set' && (
            <>
              {hasExistingPassword && (
                <div>
                  <label className="text-[11px] text-[#888] block mb-1">현재 암호</label>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => { setCurrentPassword(e.target.value); setError(null) }}
                    placeholder="현재 암호"
                    className="!text-xs"
                    autoFocus
                  />
                </div>
              )}
              <div>
                <label className="text-[11px] text-[#888] block mb-1">새 암호</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null) }}
                  placeholder="새 암호 (4자 이상)"
                  className="!text-xs"
                  autoFocus={!hasExistingPassword}
                />
              </div>
              <div>
                <label className="text-[11px] text-[#888] block mb-1">암호 확인</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(null) }}
                  placeholder="암호 다시 입력"
                  className="!text-xs"
                />
              </div>
            </>
          )}

          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>

        {/* 푸터 */}
        <div className="flex justify-between px-4 py-3 border-t border-[#3c3c3c]">
          <div>
            {mode === 'set' && hasExistingPassword && (
              <button
                onClick={handleRemove}
                disabled={loading}
                className="px-3 py-1.5 text-xs rounded text-red-400 bg-[#3c3c3c] hover:bg-[#4a3030] transition-colors disabled:opacity-50"
              >
                암호 해제
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded text-[#cccccc] bg-[#3c3c3c] hover:bg-[#505050] transition-colors"
            >
              취소
            </button>
            <button
              onClick={mode === 'verify' ? handleVerify : handleSet}
              disabled={loading}
              className="px-3 py-1.5 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white transition-colors disabled:opacity-50"
            >
              {mode === 'verify' ? '확인' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
