import { useState } from 'react'
import { Dialog } from './_Dialog'
import { buildMergeRows, applyMerge, stepSummary, stepValue, type MergeRow } from '../../utils/scheduleMerge'
import type { WorkflowStep } from '../../../types/workflow.types'

interface Props {
  workflowSteps: WorkflowStep[]
  scheduleSteps: WorkflowStep[]
  onConfirm: (steps: WorkflowStep[]) => void
  onClose: () => void
}

const KIND_BADGE: Record<MergeRow['kind'], { label: string; className: string }> = {
  added: { label: '신규', className: 'bg-[#3a2a10] text-[#e8ab6a] border border-[#e8ab6a]/40' },
  conflict: { label: '변경', className: 'bg-[#3a3a10] text-[#e8d86a] border border-[#e8d86a]/40' },
  kept: { label: '유지', className: 'bg-[#2a2a2a] text-[#888] border border-[#3c3c3c]' },
  scheduleOnly: { label: '워크플로우에 없음', className: 'bg-[#10283a] text-[#6ab4e8] border border-[#6ab4e8]/40' }
}

// conflict는 value뿐 아니라 selector/rawLine 차이일 수도 있으므로 실제로 다른 필드만 보여준다
const DIFF_FIELDS = ['action', 'selector', 'value', 'url', 'rawLine'] as const

function diffFields(a?: WorkflowStep, b?: WorkflowStep): typeof DIFF_FIELDS[number][] {
  if (!a || !b) return []
  const diffs = DIFF_FIELDS.filter((f) => a[f] !== b[f])
  return diffs.length > 0 ? diffs : ['value']
}

function diffText(step: WorkflowStep | undefined, fields: typeof DIFF_FIELDS[number][]): string {
  if (!step) return ''
  if (step.isSensitive) return '••••••'
  if (fields.length === 1) return String(step[fields[0]] ?? '')
  return fields.map((f) => `${f}=${step[f] ?? ''}`).join('  ')
}

export function ScheduleUpdateDialog({ workflowSteps, scheduleSteps, onConfirm, onClose }: Props) {
  const [rows, setRows] = useState<MergeRow[]>(() => buildMergeRows(workflowSteps, scheduleSteps))

  const addedCount = rows.filter((r) => r.kind === 'added').length
  const conflictCount = rows.filter((r) => r.kind === 'conflict').length
  const keptCount = rows.filter((r) => r.kind === 'kept').length
  const scheduleOnlyCount = rows.filter((r) => r.kind === 'scheduleOnly').length

  const toggleInclude = (id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, include: !r.include } : r)))
  }

  const setUseWorkflowValue = (id: string, useWorkflowValue: boolean) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, useWorkflowValue } : r)))
  }

  const handleConfirm = () => {
    onConfirm(applyMerge(rows))
  }

  return (
    <Dialog title="스케줄 업데이트" onClose={onClose} onConfirm={handleConfirm} confirmLabel="업데이트 적용" widthClass="w-[640px]">
      <div className="flex flex-col gap-3">
        {/* 요약 */}
        <div className="text-[11px] text-[#aaa]">
          추가 {addedCount} · 변경 {conflictCount} · 유지 {keptCount} · 워크플로우에 없음 {scheduleOnlyCount}
        </div>

        {/* 행 목록 */}
        <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto">
          {rows.map((row) => {
            const badge = KIND_BADGE[row.kind]

            if (row.kind === 'kept' || row.kind === 'added' || row.kind === 'scheduleOnly') {
              const step = row.kind === 'added' ? row.workflowStep : row.scheduleStep
              const toggleable = row.kind !== 'kept'
              const value = stepValue(step)
              return (
                <div key={row.id} className="px-2 py-1.5 rounded bg-[#252526] flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    {toggleable && (
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={() => toggleInclude(row.id)}
                        className="shrink-0"
                      />
                    )}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${badge.className}`}>{badge.label}</span>
                    <span
                      className={`text-[10px] truncate ${toggleable ? 'text-[#ccc]' : 'text-[#666]'}`}
                      title={stepSummary(step)}
                    >
                      {stepSummary(step)}
                    </span>
                  </div>
                  {value && (
                    <div className={`flex items-center gap-1.5 text-[10px] ${toggleable ? 'pl-6' : 'pl-2'}`}>
                      <span className="text-[#888] shrink-0">값:</span>
                      <span className="font-mono text-[#ce9178] truncate min-w-0" title={value}>{value}</span>
                    </div>
                  )}
                </div>
              )
            }

            // conflict
            const fields = diffFields(row.scheduleStep, row.workflowStep)
            return (
              <div key={row.id} className="px-2 py-1.5 rounded bg-[#252526] flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${badge.className}`}>{badge.label}</span>
                  <span className="text-[10px] text-[#ccc] truncate" title={stepSummary(row.workflowStep)}>
                    {stepSummary(row.workflowStep)}
                  </span>
                </div>
                {/* value가 차이나는 필드가 아니면 아래 라디오에 안 나오므로 따로 보여준다 */}
                {!fields.includes('value') && stepValue(row.scheduleStep) && (
                  <div className="flex items-center gap-1.5 text-[10px] pl-2">
                    <span className="text-[#888] shrink-0">값:</span>
                    <span
                      className="font-mono text-[#ce9178] truncate min-w-0"
                      title={stepValue(row.scheduleStep)}
                    >
                      {stepValue(row.scheduleStep)}
                    </span>
                  </div>
                )}
                <div className="flex flex-col gap-0.5 pl-2">
                  <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                    <input
                      type="radio"
                      name={`conflict-${row.id}`}
                      checked={!row.useWorkflowValue}
                      onChange={() => setUseWorkflowValue(row.id, false)}
                    />
                    <span className="text-[#888] shrink-0">스케줄:</span>
                    <span className="font-mono text-[#ce9178] truncate min-w-0" title={diffText(row.scheduleStep, fields)}>
                      {diffText(row.scheduleStep, fields)}
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                    <input
                      type="radio"
                      name={`conflict-${row.id}`}
                      checked={row.useWorkflowValue}
                      onChange={() => setUseWorkflowValue(row.id, true)}
                    />
                    <span className="text-[#888] shrink-0">워크플로우:</span>
                    <span className="font-mono text-[#ce9178] truncate min-w-0" title={diffText(row.workflowStep, fields)}>
                      {diffText(row.workflowStep, fields)}
                    </span>
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Dialog>
  )
}
