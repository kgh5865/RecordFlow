import { useState, useRef, useEffect } from 'react'
import { ActionBadge } from './ActionBadge'
import { useSettingsStore } from '../../stores/settingsStore'
import type { WorkflowStep } from '../../../types/workflow.types'

interface Props {
  step: WorkflowStep
  isActive: boolean
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  onEditValue: (newValue: string) => void
  onEditSelector: (newValue: string) => void
}

function parseOtp(value: string) {
  return value.match(/^\{\{otp:\s*(.+?)\s*\}\}$/)
}

export function StepRow({ step, isActive, isFirst, isLast, onMoveUp, onMoveDown, onDelete, onEditValue, onEditSelector }: Props) {
  const displayText = step.url ?? step.selector ?? ''
  const truncated = displayText.length > 60 ? displayText.slice(0, 60) + '…' : displayText

  const canEditValue = step.action === 'fill' || step.action === 'select'

  // Value 편집 상태
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(step.value ?? '')
  const [otpOpen, setOtpOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const otpProfiles = useSettingsStore((s) => s.settings.otpProfiles)

  const displayOtpMatch = parseOtp(step.value ?? '')
  const draftOtpMatch = parseOtp(draft)

  // Selector/URL 편집 상태
  const [editingSelector, setEditingSelector] = useState(false)
  const [selectorDraft, setSelectorDraft] = useState(displayText)
  const selectorInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && !draftOtpMatch) inputRef.current?.focus()
  }, [editing])

  useEffect(() => {
    if (editingSelector) selectorInputRef.current?.focus()
  }, [editingSelector])

  const startSelectorEdit = () => {
    setSelectorDraft(step.url ?? step.selector ?? '')
    setEditingSelector(true)
  }

  const commitSelectorEdit = () => {
    setEditingSelector(false)
    const original = step.url ?? step.selector ?? ''
    if (selectorDraft.trim() && selectorDraft !== original) {
      onEditSelector(selectorDraft.trim())
    }
  }

  const cancelSelectorEdit = () => {
    setEditingSelector(false)
    setSelectorDraft(step.url ?? step.selector ?? '')
  }

  const startEdit = () => {
    if (!canEditValue) return
    setDraft(step.value ?? '')
    setEditing(true)
    setOtpOpen(false)
  }

  const commitEdit = () => {
    setEditing(false)
    setOtpOpen(false)
    if (draft !== step.value) onEditValue(draft)
  }

  const cancelEdit = () => {
    setEditing(false)
    setOtpOpen(false)
    setDraft(step.value ?? '')
  }

  const insertOtp = (profileName: string) => {
    const token = `{{otp:${profileName}}}`
    setDraft(token)
    setOtpOpen(false)
    // 즉시 커밋
    onEditValue(token)
    setEditing(false)
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 group border-b border-[#2d2d2d] transition-colors ${
        isActive ? 'bg-[#094771]/60' : 'hover:bg-[#2a2d2e]'
      }`}
    >
      {/* 순서 번호 */}
      <span className="text-[10px] text-[#555] w-5 text-right shrink-0">{step.order + 1}</span>

      {/* 액션 배지 */}
      <ActionBadge action={step.action} />

      {/* 셀렉터/URL — 편집 가능 */}
      {editingSelector ? (
        <input
          ref={selectorInputRef}
          value={selectorDraft}
          onChange={(e) => setSelectorDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitSelectorEdit()
            if (e.key === 'Escape') cancelSelectorEdit()
          }}
          onBlur={commitSelectorEdit}
          className="flex-1 min-w-0 px-1.5 py-0.5 text-[12px] font-mono bg-[#3c3c3c] text-[#9cdcfe] border border-[#007acc] rounded outline-none caret-white"
          placeholder="locator('#id') 또는 getByRole('button', { name: '...' })"
        />
      ) : (
        <span
          onClick={startSelectorEdit}
          className="flex-1 text-[12px] font-mono text-[#9cdcfe] truncate cursor-pointer hover:underline hover:text-[#b8e6ff] transition-colors"
          title={`${displayText}\n(클릭하여 편집)`}
        >
          {truncated}
        </span>
      )}

      {/* 값 (fill/select) — 편집 모드 */}
      {canEditValue && editing ? (
        <div className="relative flex items-center gap-0.5 shrink-0">
          {draftOtpMatch ? (
            /* OTP 배지 편집 모드 */
            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-[#1a2f3f] border border-[#007acc]/60 rounded">
              <span className="text-[10px] text-[#4fc3f7]">🔑</span>
              <span className="text-[10px] text-[#4fc3f7] font-medium">{draftOtpMatch[1]}</span>
              <button
                data-otp-menu
                onMouseDown={(e) => { e.preventDefault(); setDraft(''); setTimeout(() => inputRef.current?.focus(), 0) }}
                className="text-[#555] hover:text-red-400 text-[10px] ml-0.5 transition-colors"
                title="OTP 제거"
              >
                ✕
              </button>
            </div>
          ) : (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit()
                if (e.key === 'Escape') cancelEdit()
              }}
              onBlur={(e) => {
                if ((e.relatedTarget as HTMLElement)?.closest('[data-otp-menu]')) return
                commitEdit()
              }}
              className="w-[120px] px-1.5 py-0.5 text-[11px] font-mono bg-[#3c3c3c] text-[#ce9178] border border-[#007acc] rounded outline-none caret-white"
            />
          )}
          {/* OTP 선택 버튼 */}
          {otpProfiles.length > 0 && (
            <div className="relative">
              <button
                data-otp-menu
                onMouseDown={(e) => { e.preventDefault(); setOtpOpen((o) => !o) }}
                className="px-1 py-0.5 text-[10px] text-[#4fc3f7]/70 hover:text-[#4fc3f7] border border-[#007acc]/30 rounded hover:border-[#007acc] transition-colors"
                title="OTP 프로필 선택"
              >
                🔑▾
              </button>
              {otpOpen && (
                <div
                  data-otp-menu
                  className="absolute right-0 top-full mt-1 z-50 bg-[#252526] border border-[#3c3c3c] rounded shadow-lg min-w-[140px]"
                >
                  <div className="px-3 py-1.5 text-[10px] text-[#555] border-b border-[#3c3c3c]">OTP 프로필</div>
                  {otpProfiles.map((p) => (
                    <button
                      key={p.id}
                      data-otp-menu
                      onMouseDown={(e) => { e.preventDefault(); insertOtp(p.name) }}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-[#cccccc] hover:bg-[#094771] transition-colors flex items-center gap-1.5"
                    >
                      <span className="text-[#4fc3f7] text-[10px]">🔑</span>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* 값 표시 (클릭 시 편집 진입) */
        canEditValue ? (
          <span onClick={startEdit} className="shrink-0 cursor-pointer" title="클릭하여 편집">
            {displayOtpMatch ? (
              /* OTP 배지 표시 */
              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-[#1a2f3f] border border-[#007acc]/50 text-[#4fc3f7] text-[10px] rounded hover:border-[#007acc] transition-colors">
                <span>🔑</span>
                <span className="font-medium">{displayOtpMatch[1]}</span>
              </span>
            ) : step.value ? (
              <span className="text-[11px] text-[#ce9178] truncate max-w-[100px] hover:underline hover:text-[#e8b390] transition-colors">
                "{step.value}"
              </span>
            ) : (
              <span className="text-[11px] text-[#555] italic">값 없음</span>
            )}
          </span>
        ) : (
          step.value && (
            <span className="text-[11px] text-[#ce9178] truncate max-w-[100px]" title={step.value}>
              "{step.value}"
            </span>
          )
        )
      )}

      {/* 컨트롤 버튼 (hover 시) */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          title="위로"
          className="w-5 h-5 flex items-center justify-center rounded text-[#888] hover:bg-[#3c3c3c] disabled:opacity-20 disabled:cursor-not-allowed text-[10px]"
        >
          ↑
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          title="아래로"
          className="w-5 h-5 flex items-center justify-center rounded text-[#888] hover:bg-[#3c3c3c] disabled:opacity-20 disabled:cursor-not-allowed text-[10px]"
        >
          ↓
        </button>
        <button
          onClick={onDelete}
          title="삭제"
          className="w-5 h-5 flex items-center justify-center rounded text-red-500 hover:bg-red-900/30 text-[10px]"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
