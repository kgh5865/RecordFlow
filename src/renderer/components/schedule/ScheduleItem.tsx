import { memo, useState } from 'react'
import { useScheduleStore } from '../../stores/scheduleStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import type { Schedule } from '../../../types/workflow.types'

interface ScheduleItemProps {
  schedule: Schedule
  isSelected: boolean
  onSelect: () => void
}

function formatCron(s: Schedule): string {
  if (s.type === 'once' && s.scheduledAt) {
    return new Date(s.scheduledAt).toLocaleString('ko-KR', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }) + ' (1회)'
  }
  const expr = s.cronExpression ?? ''
  // Human-readable labels for common patterns
  if (expr === '*/5 * * * *') return '매 5분'
  if (expr === '*/10 * * * *') return '매 10분'
  if (expr === '*/30 * * * *') return '매 30분'
  if (expr === '0 * * * *') return '매시간'
  if (expr === '0 0 * * *') return '매일 자정'
  // Daily at HH:MM
  const dailyMatch = expr.match(/^(\d+) (\d+) \* \* \*$/)
  if (dailyMatch) {
    const h = dailyMatch[2].padStart(2, '0')
    const m = dailyMatch[1].padStart(2, '0')
    return `매일 ${h}:${m}`
  }
  return expr
}

function formatNextRun(s: Schedule): string {
  if (!s.enabled) return '비활성'
  if (s.type === 'once' && s.scheduledAt) {
    return new Date(s.scheduledAt).toLocaleString('ko-KR', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }
  if (!s.nextRunAt) return '-'
  const d = new Date(s.nextRunAt)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  if (diffMs < 0) return '곧'
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 60) return `${diffMin}분 후`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}시간 후`
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const ScheduleItem = memo(function ScheduleItem({ schedule, isSelected, onSelect }: ScheduleItemProps) {
  const { toggleSchedule, deleteSchedule } = useScheduleStore()
  const workflows = useWorkflowStore((s) => s.workflows)
  const [hovered, setHovered] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(false)

  const workflow = workflows.find((w) => w.id === schedule.workflowId)

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleSchedule(schedule.id, !schedule.enabled)
  }

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPendingDelete(false) }}
      className={`flex items-start gap-2 px-3 py-2.5 cursor-pointer border-b border-[#2a2a2a] transition-colors ${
        isSelected ? 'bg-[#094771]' : 'hover:bg-[#2a2d2e]'
      }`}
    >
      {/* 활성/비활성 토글 */}
      <button
        onClick={handleToggle}
        className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-colors ${
          schedule.enabled
            ? 'bg-[#4caf50] border-[#4caf50]'
            : 'bg-transparent border-[#555]'
        }`}
        title={schedule.enabled ? '비활성화' : '활성화'}
      />

      {/* 정보 */}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-[#cccccc] truncate">{formatCron(schedule)}</div>
        <div className="text-[10px] text-[#666] truncate mt-0.5">
          {workflow?.name ?? '(삭제된 워크플로우)'}
        </div>
        <div className="text-[10px] text-[#555] mt-0.5">{formatNextRun(schedule)}</div>

        {pendingDelete && (
          <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
            <span className="text-[10px] text-[#cccccc]">삭제하시겠습니까?</span>
            <button
              onClick={() => { deleteSchedule(schedule.id); setPendingDelete(false) }}
              className="px-2 py-0.5 text-[10px] rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
            >확인</button>
            <button
              onClick={() => setPendingDelete(false)}
              className="px-2 py-0.5 text-[10px] rounded bg-[#3c3c3c] hover:bg-[#505050] text-[#cccccc] transition-colors"
            >취소</button>
          </div>
        )}
      </div>

      {/* 삭제 버튼 (호버 시) */}
      {hovered && !pendingDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); setPendingDelete(true) }}
          className="text-[#666] hover:text-red-400 transition-colors text-xs shrink-0"
          title="삭제"
        >
          ✕
        </button>
      )}
    </div>
  )
})
