import { useState, useMemo } from 'react'
import { useScheduleStore } from '../../stores/scheduleStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useUiStore } from '../../stores/uiStore'
import { StepRow } from '../steps/StepRow'
import { ScheduleDialog } from './ScheduleDialog'
import { ScheduleUpdateDialog } from '../dialogs/ScheduleUpdateDialog'
import { buildMergeRows, hasChanges } from '../../utils/scheduleMerge'
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
  const schedules = useScheduleStore((s) => s.schedules)
  const selectedScheduleId = useScheduleStore((s) => s.selectedScheduleId)
  const logs = useScheduleStore((s) => s.logs)
  const toggleSchedule = useScheduleStore((s) => s.toggleSchedule)
  const updateScheduleStepSelector = useScheduleStore((s) => s.updateScheduleStepSelector)
  const moveScheduleStepUp = useScheduleStore((s) => s.moveScheduleStepUp)
  const moveScheduleStepDown = useScheduleStore((s) => s.moveScheduleStepDown)
  const deleteScheduleStep = useScheduleStore((s) => s.deleteScheduleStep)
  const saveScheduleSteps = useScheduleStore((s) => s.saveScheduleSteps)
  const updateSchedule = useScheduleStore((s) => s.updateSchedule)
  const workflows = useWorkflowStore((s) => s.workflows)
  const [runningNow, setRunningNow] = useState(false)
  const [runError, setRunError] = useState('')
  const [toggling, setToggling] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)
  const [reverting, setReverting] = useState(false)

  const schedule = schedules.find((s) => s.id === selectedScheduleId)
  const workflow = schedule ? workflows.find((w) => w.id === schedule.workflowId) : undefined
  const mergeRows = useMemo(() => {
    if (!schedule || !workflow) return []
    return buildMergeRows(workflow.steps, schedule.steps)
  }, [schedule, workflow])
  const updateChangeCount = hasChanges(mergeRows) ? mergeRows.filter((r) => r.kind !== 'kept').length : 0

  if (!schedule) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1e1e1e] text-[#666]">
        <span className="text-sm">좌측에서 스케줄을 선택하세요</span>
      </div>
    )
  }

  const scheduleLogs = logs[schedule.id] ?? []
  const steps = schedule.steps ?? []

  const handleRunNow = async () => {
    if (steps.length === 0) {
      setRunError('실행할 step이 없습니다.')
      return
    }
    setRunError('')
    setRunningNow(true)
    try {
      const log = await window.electronAPI.runScheduleNow(schedule.id)
      if (log && !log.success) {
        useUiStore.getState().setRunResult({
          success: false,
          error: log.error,
          completedSteps: log.completedSteps,
          workflowId: log.workflowId
        })
      }
      // 실행 후 로그 갱신
      useScheduleStore.getState().loadLogs(schedule.id)
    } catch (err) {
      setRunError(String(err))
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
          <div className="flex flex-col items-end gap-0.5">
            <button
              onClick={handleRunNow}
              disabled={runningNow || steps.length === 0}
              className="px-2 py-0.5 text-xs rounded bg-[#2ea043] hover:bg-[#3fb950] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Run Now"
            >
              {runningNow ? 'Running...' : '▶ Run Now'}
            </button>
            {runError && (
              <span className="text-[10px] text-red-400">{runError}</span>
            )}
          </div>
          <button
            onClick={() => setUpdateDialogOpen(true)}
            disabled={!workflow || updateChangeCount === 0}
            className="text-[10px] px-2 py-0.5 rounded bg-[#3c3c3c] text-[#cccccc] hover:bg-[#505050] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={!workflow ? '원본 워크플로우가 삭제되었습니다' : updateChangeCount === 0 ? '변경 사항 없음' : `${updateChangeCount}건의 변경 사항 반영`}
          >
            Update{updateChangeCount > 0 ? ` (${updateChangeCount})` : ''}
          </button>
          {schedule.previousSteps && (
            <button
              onClick={async () => {
                setReverting(true)
                try {
                  // 스냅샷은 1개만 관리 — 되돌린 뒤에는 비운다.
                  // (다시 병합하고 싶으면 Update를 누르면 되므로 redo는 따로 두지 않는다)
                  await updateSchedule(schedule.id, {
                    steps: schedule.previousSteps,
                    previousSteps: undefined,
                    previousStepsAt: undefined
                  })
                } finally {
                  setReverting(false)
                }
              }}
              disabled={reverting}
              className="text-[10px] px-2 py-0.5 rounded bg-[#3c3c3c] text-[#e8ab6a] hover:bg-[#505050] disabled:opacity-40 transition-colors"
              title={`Update 직전 상태로 되돌립니다${
                schedule.previousStepsAt
                  ? ` (${new Date(schedule.previousStepsAt).toLocaleString('ko-KR')} 시점)`
                  : ''
              }`}
            >
              {reverting ? '되돌리는 중...' : '↩ 되돌리기'}
            </button>
          )}
          <button
            onClick={() => setEditDialogOpen(true)}
            className="text-[10px] px-2 py-0.5 rounded bg-[#3c3c3c] text-[#cccccc] hover:bg-[#505050] transition-colors"
            title="Edit Schedule"
          >
            Edit Schedule
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
            title={schedule.enabled ? 'Click to disable' : 'Click to enable'}
          >
            {schedule.enabled ? 'Active' : 'Inactive'}
          </button>
        </div>
      </div>

      {/* Steps — 스케줄 자체 독립 복사본 편집 */}
      <div className="border-b border-[#3c3c3c]" style={{ maxHeight: '50%', overflow: 'hidden' }}>
        <div className="px-3 py-1.5 text-[10px] text-[#555] bg-[#252526] flex items-center justify-between">
          <span>스케줄 steps (개별 편집 가능)</span>
          <span className="text-[#666]">{steps.length} steps</span>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100% - 28px)' }}>
          {steps.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-[#555] text-xs">
              No steps
            </div>
          ) : (
            steps.map((step, i) => (
              <StepRow
                key={step.id}
                step={step}
                workflowId={schedule.id}
                isActive={false}
                isFirst={i === 0}
                isLast={i === steps.length - 1}
                onMoveUp={() => { moveScheduleStepUp(schedule.id, step.id); saveScheduleSteps(schedule.id) }}
                onMoveDown={() => { moveScheduleStepDown(schedule.id, step.id); saveScheduleSteps(schedule.id) }}
                onDelete={() => { deleteScheduleStep(schedule.id, step.id); saveScheduleSteps(schedule.id) }}
                onEditSelector={(val) => { updateScheduleStepSelector(schedule.id, step.id, val); saveScheduleSteps(schedule.id) }}
                scheduleMode
              />
            ))
          )}
        </div>
      </div>

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

      {updateDialogOpen && workflow && (
        <ScheduleUpdateDialog
          workflowSteps={workflow.steps}
          scheduleSteps={schedule.steps}
          onConfirm={async (newSteps) => {
            // 되돌리기용 스냅샷은 딱 1개만 보관 — 기존 것은 덮어쓴다
            await updateSchedule(schedule.id, {
              steps: newSteps,
              previousSteps: schedule.steps,
              previousStepsAt: new Date().toISOString()
            })
            setUpdateDialogOpen(false)
          }}
          onClose={() => setUpdateDialogOpen(false)}
        />
      )}
    </div>
  )
}
