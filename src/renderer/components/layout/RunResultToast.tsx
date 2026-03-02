import { useEffect } from 'react'
import { useUiStore } from '../../stores/uiStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { ActionBadge } from '../steps/ActionBadge'

export function RunResultToast() {
  const lastRunResult = useUiStore((s) => s.lastRunResult)
  const setRunResult = useUiStore((s) => s.setRunResult)
  const selectedWorkflowId = useUiStore((s) => s.selectedWorkflowId)
  const workflows = useWorkflowStore((s) => s.workflows)

  useEffect(() => {
    if (!lastRunResult) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRunResult(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lastRunResult, setRunResult])

  if (!lastRunResult) return null

  const { success, completedSteps, error } = lastRunResult
  const workflow = workflows.find((w) => w.id === selectedWorkflowId)
  const totalSteps = workflow?.steps.length ?? completedSteps
  const failedStep = !success && workflow ? workflow.steps[completedSteps] : null

  // 에러 메시지 정리: 첫 줄(핵심 메시지)과 스택 트레이스 분리
  const errorLines = error?.split('\n') ?? []
  const errorSummary = errorLines[0] ?? ''
  const errorDetail = errorLines.slice(1).join('\n').trim()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) setRunResult(null) }}
    >
      <div
        className="w-[480px] bg-[#252526] border border-[#3c3c3c] rounded-xl shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 상단 강조선 */}
        <div className={`h-[3px] ${success ? 'bg-[#4caf50]' : 'bg-red-500'}`} />

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#3c3c3c]">
          <div className="flex items-center gap-2.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              success ? 'bg-[#4caf50]/15 text-[#4caf50]' : 'bg-red-500/15 text-red-400'
            }`}>
              {success
                ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 6L4.5 9L10.5 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              }
            </div>
            <span className={`text-[13px] font-semibold ${success ? 'text-[#4caf50]' : 'text-red-400'}`}>
              {success ? '실행 완료' : '실행 실패'}
            </span>
            {workflow && (
              <span className="text-[11px] text-[#666]">— {workflow.name}</span>
            )}
          </div>
          <button
            onClick={() => setRunResult(null)}
            className="text-[#555] hover:text-[#ccc] transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 진행 현황 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-[#666]">진행 현황</span>
              <span className="text-[11px] text-[#888]">
                {completedSteps} / {totalSteps} steps
              </span>
            </div>
            {/* 프로그레스 바 */}
            <div className="w-full h-1.5 bg-[#3c3c3c] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${success ? 'bg-[#4caf50]' : 'bg-red-500'}`}
                style={{ width: totalSteps > 0 ? `${(completedSteps / totalSteps) * 100}%` : '0%' }}
              />
            </div>
          </div>

          {/* 실패한 Step 정보 */}
          {failedStep && (
            <div>
              <div className="text-[11px] text-[#666] mb-2">실패한 Step</div>
              <div className="flex items-center gap-2 px-3 py-2 bg-red-900/20 border border-red-500/20 rounded-lg">
                <span className="text-[10px] text-[#555] w-5 text-right shrink-0">
                  {failedStep.order + 1}
                </span>
                <ActionBadge action={failedStep.action} />
                <span className="text-[11px] font-mono text-[#9cdcfe] truncate flex-1" title={failedStep.url ?? failedStep.selector}>
                  {failedStep.url ?? failedStep.selector ?? ''}
                </span>
              </div>
            </div>
          )}

          {/* 에러 메시지 */}
          {!success && error && (
            <div>
              <div className="text-[11px] text-[#666] mb-2">오류 메시지</div>
              <div className="bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg overflow-hidden select-text cursor-text">
                {/* 핵심 메시지 */}
                <div className="px-3 py-2 text-[11px] text-red-400 border-b border-[#3c3c3c]">
                  {errorSummary}
                </div>
                {/* 스택 트레이스 */}
                {errorDetail && (
                  <div className="px-3 py-2 max-h-[120px] overflow-y-auto">
                    <pre className="text-[10px] text-[#555] whitespace-pre-wrap break-all font-mono leading-relaxed">
                      {errorDetail}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex justify-end px-5 py-3 border-t border-[#3c3c3c]">
          <button
            autoFocus
            onClick={() => setRunResult(null)}
            className="px-4 py-1.5 text-[12px] rounded-lg bg-[#3c3c3c] hover:bg-[#4a4a4a] text-[#cccccc] transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
