import { useState, useRef, useEffect } from 'react'
import { ActionBadge } from './ActionBadge'
import { useSettingsStore } from '../../stores/settingsStore'
import type { WorkflowStep } from '../../../types/workflow.types'

function parseOtp(value: string) {
  return value.match(/^\{\{otp:\s*(.+?)\s*\}\}$/)
}

// --- SelectorEditor ---

interface SelectorEditorProps {
  step: WorkflowStep
  onEditSelector: (newValue: string) => void
}

function SelectorEditor({ step, onEditSelector }: SelectorEditorProps) {
  const displayText = step.url ?? step.selector ?? ''
  const truncated = displayText.length > 60 ? displayText.slice(0, 60) + '…' : displayText

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(displayText)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const start = () => {
    setDraft(step.url ?? step.selector ?? '')
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    const original = step.url ?? step.selector ?? ''
    if (draft.trim() && draft !== original) onEditSelector(draft.trim())
  }

  const cancel = () => {
    setEditing(false)
    setDraft(step.url ?? step.selector ?? '')
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') cancel()
        }}
        onBlur={commit}
        className="flex-1 min-w-0 px-1.5 py-0.5 text-[12px] font-mono bg-[#3c3c3c] text-[#9cdcfe] border border-[#007acc] rounded outline-none caret-white"
        placeholder="locator('#id') 또는 getByRole('button', { name: '...' })"
      />
    )
  }

  return (
    <span
      onClick={start}
      className="flex-1 text-[12px] font-mono text-[#9cdcfe] truncate cursor-pointer hover:underline hover:text-[#b8e6ff] transition-colors"
      title={`${displayText}\n(클릭하여 편집)`}
    >
      {truncated}
    </span>
  )
}

// --- ValueEditor ---

interface ValueEditorProps {
  step: WorkflowStep
  canEditValue: boolean
  onEditValue: (newValue: string) => void
}

function ValueEditor({ step, canEditValue, onEditValue }: ValueEditorProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(step.value ?? '')
  const [otpOpen, setOtpOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const otpProfiles = useSettingsStore((s) => s.settings.otpProfiles)

  const displayOtpMatch = parseOtp(step.value ?? '')
  const draftOtpMatch = parseOtp(draft)

  useEffect(() => {
    if (editing && !draftOtpMatch) inputRef.current?.focus()
  }, [editing])

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
    onEditValue(token)
    setEditing(false)
  }

  if (canEditValue && editing) {
    return (
      <div className="relative flex items-center gap-0.5 shrink-0">
        {draftOtpMatch ? (
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
    )
  }

  if (canEditValue) {
    return (
      <span onClick={startEdit} className="shrink-0 cursor-pointer" title="클릭하여 편집">
        {displayOtpMatch ? (
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
    )
  }

  if (step.value) {
    return (
      <span className="text-[11px] text-[#ce9178] truncate max-w-[100px]" title={step.value}>
        "{step.value}"
      </span>
    )
  }

  return null
}

// --- StepRow ---

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

export function StepRow({ step, isActive, isFirst, isLast, onMoveUp, onMoveDown, onDelete, onEditValue, onEditSelector }: Props) {
  const canEditValue = step.action === 'fill' || step.action === 'select'

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 group border-b border-[#2d2d2d] transition-colors ${
        isActive ? 'bg-[#094771]/60' : 'hover:bg-[#2a2d2e]'
      }`}
    >
      <span className="text-[10px] text-[#555] w-5 text-right shrink-0">{step.order + 1}</span>
      <ActionBadge action={step.action} />
      <SelectorEditor step={step} onEditSelector={onEditSelector} />
      <ValueEditor step={step} canEditValue={canEditValue} onEditValue={onEditValue} />
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
