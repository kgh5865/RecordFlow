import { useState, useRef, useEffect } from 'react'
import { ActionBadge } from './ActionBadge'
import { useUiStore } from '../../stores/uiStore'
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
  workflowId: string
}

const DISPLAY_MAX = 28

function truncateValue(v: string): string {
  return v.length > DISPLAY_MAX ? v.slice(0, DISPLAY_MAX) + '…' : v
}

const MASK_CHAR = '\u2022' // •
const MASKED_DISPLAY = MASK_CHAR.repeat(8)

function ValueEditor({ step, canEditValue, workflowId }: ValueEditorProps) {
  const openDialog = useUiStore((s) => s.openDialog)

  const handleClick = () => {
    if (!canEditValue) return
    openDialog({ type: 'edit-value', workflowId, stepId: step.id, step })
  }

  const otpMatch = parseOtp(step.value ?? '')
  const hasDateVars = step.value ? /\{\{date:[^}]+\}\}/.test(step.value) : false
  const isMasked = step.isSensitive && !otpMatch && !hasDateVars

  if (canEditValue) {
    return (
      <span
        onClick={handleClick}
        className="shrink-0 max-w-[140px] min-w-0 overflow-hidden cursor-pointer"
        title={isMasked ? '(클릭하여 편집)' : `${step.value ?? ''}\n(클릭하여 편집)`}
      >
        {otpMatch ? (
          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-[#1a2f3f] border border-[#007acc]/50 text-[#4fc3f7] text-[10px] rounded hover:border-[#007acc] transition-colors">
            <span>&#x1F511;</span>
            <span className="font-medium">{otpMatch[1]}</span>
          </span>
        ) : hasDateVars ? (
          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-[#1a2f2a] border border-[#4ec9b0]/50 text-[#4ec9b0] text-[10px] rounded hover:border-[#4ec9b0] transition-colors">
            <span>&#x1F4C5;</span>
            <span className="font-medium">{truncateValue(step.value ?? '')}</span>
          </span>
        ) : isMasked && step.value ? (
          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-[#2a1a1a] border border-[#cc6633]/40 text-[#cc9966] text-[10px] rounded hover:border-[#cc6633] transition-colors">
            <span>&#x1F512;</span>
            <span className="font-medium tracking-wider">{MASKED_DISPLAY}</span>
          </span>
        ) : step.value ? (
          <span className="text-[11px] text-[#ce9178] hover:underline hover:text-[#e8b390] transition-colors">
            &quot;{truncateValue(step.value)}&quot;
          </span>
        ) : (
          <span className="text-[11px] text-[#555] italic">값 없음</span>
        )}
      </span>
    )
  }

  if (step.value) {
    if (isMasked) {
      return (
        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-[#2a1a1a] border border-[#cc6633]/40 text-[#cc9966] text-[10px] rounded shrink-0 max-w-[140px] overflow-hidden">
          <span>&#x1F512;</span>
          <span className="font-medium tracking-wider">{MASKED_DISPLAY}</span>
        </span>
      )
    }
    return (
      <span className="text-[11px] text-[#ce9178] shrink-0 max-w-[140px] overflow-hidden" title={step.value}>
        &quot;{truncateValue(step.value)}&quot;
      </span>
    )
  }

  return null
}

// --- StepRow ---

interface Props {
  step: WorkflowStep
  workflowId: string
  isActive: boolean
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  onEditSelector: (newValue: string) => void
}

export function StepRow({ step, workflowId, isActive, isFirst, isLast, onMoveUp, onMoveDown, onDelete, onEditSelector }: Props) {
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
      <ValueEditor step={step} canEditValue={canEditValue} workflowId={workflowId} />
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
