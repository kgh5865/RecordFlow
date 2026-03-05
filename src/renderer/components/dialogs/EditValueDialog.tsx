import { useState, useRef, useEffect, useCallback } from 'react'
import { useUiStore } from '../../stores/uiStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { ActionBadge } from '../steps/ActionBadge'
import { DateVariableHelper } from './DateVariableHelper'

export function EditValueDialog() {
  const dialog = useUiStore((s) => s.dialog)
  const closeDialog = useUiStore((s) => s.closeDialog)
  const updateStep = useWorkflowStore((s) => s.updateStep)
  const otpProfiles = useSettingsStore((s) => s.settings.otpProfiles)

  if (dialog.type !== 'edit-value') return null

  return (
    <EditValueDialogInner
      workflowId={dialog.workflowId}
      stepId={dialog.stepId}
      step={dialog.step}
      otpProfiles={otpProfiles}
      updateStep={updateStep}
      closeDialog={closeDialog}
    />
  )
}

// 내부 컴포넌트: dialog.type 체크 후 렌더링 (hooks 안전 사용)
function EditValueDialogInner({
  workflowId,
  stepId,
  step,
  otpProfiles,
  updateStep,
  closeDialog
}: {
  workflowId: string
  stepId: string
  step: import('../../../types/workflow.types').WorkflowStep
  otpProfiles: import('../../../types/workflow.types').OtpProfile[]
  updateStep: (wid: string, sid: string, patch: Partial<import('../../../types/workflow.types').WorkflowStep>) => void
  closeDialog: () => void
}) {
  const [draft, setDraft] = useState(step.value ?? '')
  const [showSensitive, setShowSensitive] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isOtpValue = /^\{\{otp:\s*(.+?)\s*\}\}$/.test(draft)
  const isSensitive = step.isSensitive === true

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 50)
  }, [])

  const handleConfirm = useCallback(() => {
    updateStep(workflowId, stepId, { value: draft })
    closeDialog()
  }, [draft, workflowId, stepId, updateStep, closeDialog])

  // Ctrl+Enter로 저장
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleConfirm()
      }
    },
    [handleConfirm]
  )

  const insertAtCursor = useCallback(
    (text: string) => {
      const el = textareaRef.current
      if (!el) {
        setDraft((d) => d + text)
        return
      }
      const start = el.selectionStart
      const end = el.selectionEnd
      const newVal = draft.slice(0, start) + text + draft.slice(end)
      setDraft(newVal)
      setTimeout(() => {
        el.selectionStart = el.selectionEnd = start + text.length
        el.focus()
      }, 0)
    },
    [draft]
  )

  const insertOtp = useCallback((profileName: string) => {
    setDraft(`{{otp:${profileName}}}`)
  }, [])

  const insertDate = useCallback(
    (template: string) => {
      if (isOtpValue) {
        // OTP 설정된 상태에서 날짜 삽입 → OTP 제거하고 날짜로 대체
        setDraft(template)
      } else {
        insertAtCursor(template)
      }
    },
    [isOtpValue, insertAtCursor]
  )

  const selectorDisplay = step.selector
    ? step.selector.length > 60
      ? step.selector.slice(0, 60) + '...'
      : step.selector
    : step.url ?? ''

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeDialog()
      }}
    >
      <div
        className="w-[480px] bg-[#2d2d2d] border border-[#3c3c3c] rounded-lg shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3c3c3c]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#cccccc]">값 편집</span>
            <span className="text-[10px] text-[#555]">#{step.order + 1}</span>
            <ActionBadge action={step.action} />
          </div>
          <button
            onClick={closeDialog}
            className="text-[#888] hover:text-[#ccc] text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Selector 컨텍스트 */}
        {selectorDisplay && (
          <div className="px-4 py-1.5 bg-[#252526] border-b border-[#3c3c3c]">
            <span className="text-[10px] text-[#888]">selector: </span>
            <span className="text-[10px] font-mono text-[#9cdcfe]" title={step.selector ?? step.url}>
              {selectorDisplay}
            </span>
          </div>
        )}

        {/* 본문 */}
        <div className="px-4 py-3 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-[#888]">값</label>
                {isSensitive && (
                  <button
                    type="button"
                    onClick={() => setShowSensitive((v) => !v)}
                    className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] rounded border border-[#cc6633]/40 text-[#cc9966] hover:border-[#cc6633] hover:bg-[#2a1a1a] transition-colors"
                    title={showSensitive ? '값 숨기기' : '값 보이기'}
                  >
                    <span>{showSensitive ? '\uD83D\uDD13' : '\uD83D\uDD12'}</span>
                    {showSensitive ? '숨기기' : '보이기'}
                  </button>
                )}
              </div>
              <span className="text-[9px] text-[#555]">Ctrl+Enter로 저장</span>
            </div>
            {isSensitive && !showSensitive ? (
              <div className="relative">
                <input
                  type="password"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault()
                      handleConfirm()
                    }
                  }}
                  className="w-full px-2 py-1.5 text-sm font-mono bg-[#1e1e1e] text-[#ce9178] border border-[#3c3c3c] rounded outline-none focus:border-[#007acc] caret-white"
                  placeholder="값을 입력하세요..."
                />
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={6}
                className="w-full px-2 py-1.5 text-sm font-mono bg-[#1e1e1e] text-[#ce9178] border border-[#3c3c3c] rounded outline-none focus:border-[#007acc] resize-y caret-white"
                placeholder="값을 입력하세요..."
              />
            )}
          </div>

          {/* 구분선 */}
          <div className="border-t border-[#3c3c3c]" />

          {/* OTP 프로필 */}
          {otpProfiles.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold text-[#4fc3f7] uppercase tracking-wider flex items-center gap-1">
                OTP 프로필
              </div>
              <div className="flex flex-wrap gap-1">
                {otpProfiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => insertOtp(p.name)}
                    className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border transition-colors ${
                      draft === `{{otp:${p.name}}}`
                        ? 'border-[#007acc] text-[#4fc3f7] bg-[#1a2f3f]'
                        : 'border-[#007acc]/30 text-[#4fc3f7]/70 hover:border-[#007acc] hover:bg-[#1a2f3f]'
                    }`}
                  >
                    <span className="text-[9px]">&#x1F511;</span>
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="text-[9px] text-[#555]">
                OTP 선택 시 전체 값이 OTP 토큰으로 대체됩니다.
              </div>
            </div>
          )}

          {/* 날짜 변수 헬퍼 */}
          <DateVariableHelper onInsert={insertDate} />
        </div>

        {/* 푸터 */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#3c3c3c]">
          <button
            onClick={closeDialog}
            className="px-3 py-1.5 text-xs rounded text-[#cccccc] bg-[#3c3c3c] hover:bg-[#505050] transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleConfirm}
            className="px-3 py-1.5 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white transition-colors"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  )
}
