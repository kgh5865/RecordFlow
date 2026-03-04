import { useState } from 'react'
import { useScheduleStore } from '../../stores/scheduleStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useUiStore } from '../../stores/uiStore'
import { StepList } from '../steps/StepList'
import { ScheduleDialog } from './ScheduleDialog'
import type { ScheduleLog } from '../../../types/workflow.types'

function LogRow({ log }: { log: ScheduleLog }) {
  const startTime = new Date(log.startedAt).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
  const duration = Math.round(
    (new Date(log.finishedAt).getTime() - new Date(log.startedAt).getTime()) / 100
  ) / 10

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a2a] text-[11px]">
      <span className={log.success ? 'text-[#4caf50]' : 'text-red-400'}>
        {log.success ? '✓' : '✗'}
      </span>
      <span className="text-[#888] shrink-0">{startTime}</span>
      <span className="text-[#666]">
        {log.completedSteps}/{log.totalSteps} steps
      </span>
      <span className="text-[#555]">{duration}s</span>
      {log.error && (
        <span className="text-red-400 truncate flex-1" title={log.error}>
          {log.error.slice(0, 60)}
        </span>
      )}
    </div>
  )
}

export function ScheduleDetail() {
  const { schedules, selectedScheduleId, logs, toggleSchedule } = useScheduleStore()
  const workflows = useWorkflowStore((s) => s.workflows)
  const [runningNow, setRunningNow] = useState(false)
  const [runError, setRunError] = useState('')
  const [toggling, setToggling] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  const schedule = schedules.find((s) => s.id === selectedScheduleId)

  if (!schedule) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1e1e1e] text-[#666]">
        <span className="text-sm">좌측에서 스케줄을 선택하세요</span>
      </div>
    )
  }

  const workflow = workflows.find((w) => w.id === schedule.workflowId)
  const scheduleLogs = logs[schedule.id] ?? []

  const handleRunNow = async () => {
    if (!workflow || workflow.steps.length === 0) {
      setRunError('실행할 step이 없습니다.')
      return
    }
    setRunError('')
    setRunningNow(true)
    try {
      const log = await window.electronAPI.runScheduleNow(schedule.id)
      if (log && !log.success) {
        // 실패 시에만 결과 모달 표시
        useUiStore.getState().setRunResult({
          success: false,
          error: log.error,
          completedSteps: log.completedSteps,
          workflowId: log.workflowId
        })
      }
    } finally {
      setRunningNow(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#3c3c3c] shrink-0">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-[#cccccc]">
            {workflow?.name ?? '(삭제된 워크플로우)'}
          </span>
          <span className="text-[10px] text-[#666] mt-0.5">
            {schedule.type === 'cron'
              ? `cron: ${schedule.cronExpression}`
              : `1회: ${schedule.scheduledAt ? new Date(schedule.scheduledAt).toLocaleString('ko-KR') : ''}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {workflow && (
            <div className="flex flex-col items-end gap-0.5">
              <button
                onClick={handleRunNow}
                disabled={runningNow || workflow.steps.length === 0}
                className="px-2 py-0.5 text-xs rounded bg-[#2ea043] hover:bg-[#3fb950] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="지금 실행"
              >
                {runningNow ? '실행 중...' : '▶ 지금 실행'}
              </button>
              {runError && (
                <span className="text-[10px] text-red-400">{runError}</span>
              )}
            </div>
          )}
          <button
            onClick={() => setEditDialogOpen(true)}
            className="text-[10px] px-2 py-0.5 rounded bg-[#3c3c3c] text-[#cccccc] hover:bg-[#505050] transition-colors"
            title="스케줄 수정"
          >
            수정
          </button>
          <button
            onClick={async () => {
              setToggling(true)
              try {
                await toggleSchedule(schedule.id, !schedule.enabled)
              } finally {
                setToggling(false)
              }
            }}
            disabled={toggling}
            className={`text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors disabled:opacity-50 ${
              schedule.enabled
                ? 'bg-[#1a3a1a] text-[#4caf50] hover:bg-[#1a4a1a]'
                : 'bg-[#2a2a2a] text-[#666] hover:bg-[#3a3a3a] hover:text-[#999]'
            }`}
            title={schedule.enabled ? '비활성화하려면 클릭' : '활성화하려면 클릭'}
          >
            {schedule.enabled ? '활성' : '비활성'}
          </button>
        </div>
      </div>

      {/* Steps */}
      {workflow ? (
        <div className="border-b border-[#3c3c3c]" style={{ maxHeight: '50%', overflow: 'hidden' }}>
          <div className="px-3 py-1.5 text-[10px] text-[#555] bg-[#252526]">워크플로우 steps</div>
          <StepList workflow={workflow} />
        </div>
      ) : (
        <div className="px-4 py-3 text-[11px] text-[#666] border-b border-[#3c3c3c]">
          연결된 워크플로우가 삭제되었습니다.
        </div>
      )}

      {/* 실행 이력 */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="px-3 py-1.5 text-[10px] text-[#555] bg-[#252526] shrink-0">
          실행 이력 ({scheduleLogs.length}건)
        </div>
        <div className="flex-1 overflow-y-auto">
          {scheduleLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[#555] text-xs">
              실행 이력이 없습니다
            </div>
          ) : (
            scheduleLogs.map((log) => <LogRow key={log.id} log={log} />)
          )}
        </div>
      </div>

      {editDialogOpen && (
        <ScheduleDialog schedule={schedule} onClose={() => setEditDialogOpen(false)} />
      )}
    </div>
  )
}
