import { useMemo } from 'react'
import { Dialog } from './_Dialog'
import { buildMergeRows, stepSummary, stepValue, type MergeRow } from '../../utils/scheduleMerge'
import type { WorkflowStep } from '../../../types/workflow.types'

interface Props {
  title: string
  /** 지금 저장돼 있는 스텝 */
  currentSteps: WorkflowStep[]
  /** 되돌아갈 이전 버전 스텝 */
  previousSteps: WorkflowStep[]
  /** 스냅샷을 뜬 시각 (ISO 8601) */
  previousStepsAt?: string
  /** 목록 위에 덧붙일 안내 문구 */
  note?: string
  onConfirm: () => void
  onClose: () => void
}

// buildMergeRows(a, b) 기준: added = a에만, scheduleOnly = b에만.
// 여기서는 a=이전버전, b=현재 이므로 아래처럼 읽힌다.
const KIND_BADGE: Record<MergeRow['kind'], { label: string; className: string }> = {
  added: { label: '복원', className: 'bg-[#10321a] text-[#4caf50] border border-[#4caf50]/40' },
  scheduleOnly: { label: '제거', className: 'bg-[#3a1a1a] text-[#e86a6a] border border-[#e86a6a]/40' },
  conflict: { label: '변경', className: 'bg-[#3a3a10] text-[#e8d86a] border border-[#e8d86a]/40' },
  kept: { label: '유지', className: 'bg-[#2a2a2a] text-[#888] border border-[#3c3c3c]' }
}

export function PreviousVersionDialog({
  title,
  currentSteps,
  previousSteps,
  previousStepsAt,
  note,
  onConfirm,
  onClose
}: Props) {
  const rows = useMemo(
    () => buildMergeRows(previousSteps, currentSteps),
    [previousSteps, currentSteps]
  )

  const restoredCount = rows.filter((r) => r.kind === 'added').length
  const removedCount = rows.filter((r) => r.kind === 'scheduleOnly').length
  const changedCount = rows.filter((r) => r.kind === 'conflict').length
  const keptCount = rows.filter((r) => r.kind === 'kept').length

  return (
    <Dialog
      title={title}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="이전 버전으로 이동"
      widthClass="w-[640px]"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="text-[11px] text-[#aaa]">
            복원 {restoredCount} · 제거 {removedCount} · 변경 {changedCount} · 유지 {keptCount}
          </div>
          {previousStepsAt && (
            <div className="text-[10px] text-[#666]">
              {new Date(previousStepsAt).toLocaleString('ko-KR')} 시점으로 이동합니다
            </div>
          )}
          {note && <div className="text-[10px] text-[#e8ab6a] whitespace-pre-line">{note}</div>}
        </div>

        {rows.length === 0 ? (
          <div className="py-6 text-center text-[11px] text-[#555]">비교할 스텝이 없습니다</div>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto">
            {rows.map((row) => {
              const badge = KIND_BADGE[row.kind]
              // added는 이전 버전에만 있으므로 workflowStep, 그 외는 현재 기준
              const step = row.kind === 'added' ? row.workflowStep : row.scheduleStep

              return (
                <div key={row.id} className="px-2 py-1.5 rounded bg-[#252526] flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${badge.className}`}>
                      {badge.label}
                    </span>
                    <span
                      className={`text-[10px] truncate ${row.kind === 'kept' ? 'text-[#666]' : 'text-[#ccc]'}`}
                      title={stepSummary(step)}
                    >
                      {stepSummary(step)}
                    </span>
                  </div>

                  {row.kind === 'conflict' ? (
                    <div className="flex flex-col gap-0.5 pl-2 text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#888] shrink-0 w-[52px]">지금:</span>
                        <span
                          className="font-mono text-[#888] line-through truncate min-w-0"
                          title={stepValue(row.scheduleStep)}
                        >
                          {stepValue(row.scheduleStep) || '(값 없음)'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#888] shrink-0 w-[52px]">이전:</span>
                        <span
                          className="font-mono text-[#ce9178] truncate min-w-0"
                          title={stepValue(row.workflowStep)}
                        >
                          {stepValue(row.workflowStep) || '(값 없음)'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    stepValue(step) && (
                      <div className="flex items-center gap-1.5 pl-2 text-[10px]">
                        <span className="text-[#888] shrink-0">값:</span>
                        <span
                          className={`font-mono truncate min-w-0 ${
                            row.kind === 'scheduleOnly' ? 'text-[#888] line-through' : 'text-[#ce9178]'
                          }`}
                          title={stepValue(step)}
                        >
                          {stepValue(step)}
                        </span>
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Dialog>
  )
}
