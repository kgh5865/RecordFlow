import { useState } from 'react'
import { useScheduleStore } from '../../stores/scheduleStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { Input } from '../ui/Input'
import type { Schedule, ScheduleType } from '../../../types/workflow.types'

interface Props {
  onClose: () => void
  /** 수정 모드: 기존 스케줄 전달 시 편집 UI */
  schedule?: Schedule
  /** 새 스케줄 생성 시 기본 폴더 */
  defaultFolderId?: string
}

const CRON_PRESETS = [
  { label: '매 5분', value: '*/5 * * * *' },
  { label: '매 10분', value: '*/10 * * * *' },
  { label: '매 30분', value: '*/30 * * * *' },
  { label: '매시간', value: '0 * * * *' },
  { label: '매일 09:00', value: '0 9 * * *' },
  { label: '매일 자정', value: '0 0 * * *' },
  { label: '직접 입력', value: '__custom__' }
]

function calcNextRunLabel(cron: string): string {
  if (!cron || cron === '__custom__') return ''
  try {
    const preset = CRON_PRESETS.find((p) => p.value === cron)
    if (preset && preset.value !== '__custom__') return `프리셋: ${preset.label}`
    return `cron: ${cron}`
  } catch {
    return ''
  }
}

function resolveInitialPreset(cronExpression?: string): string {
  if (!cronExpression) return CRON_PRESETS[0].value
  const match = CRON_PRESETS.find((p) => p.value === cronExpression)
  return match ? match.value : '__custom__'
}

function toLocalDatetime(iso?: string): string {
  if (!iso) return ''
  const dt = new Date(iso)
  const offset = dt.getTimezoneOffset() * 60000
  return new Date(dt.getTime() - offset).toISOString().slice(0, 16)
}


export function ScheduleDialog({ onClose, schedule: editTarget, defaultFolderId }: Props) {
  const isEdit = !!editTarget
  const workflows = useWorkflowStore((s) => s.workflows)
  const { scheduleFolders, createSchedule, updateSchedule } = useScheduleStore()

  const [folderId, setFolderId] = useState(editTarget?.folderId ?? defaultFolderId ?? scheduleFolders[0]?.id ?? '')
  const [workflowId, setWorkflowId] = useState(editTarget?.workflowId ?? workflows[0]?.id ?? '')
  const [type, setType] = useState<ScheduleType>(editTarget?.type ?? 'cron')
  const [preset, setPreset] = useState(resolveInitialPreset(editTarget?.cronExpression))
  const [customCron, setCustomCron] = useState(
    editTarget?.cronExpression && resolveInitialPreset(editTarget.cronExpression) === '__custom__'
      ? editTarget.cronExpression
      : ''
  )
  const [scheduledAt, setScheduledAt] = useState(toLocalDatetime(editTarget?.scheduledAt))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const cronExpression = preset === '__custom__' ? customCron : preset

  const handleSave = async () => {
    setError('')
    if (!folderId) { setError('폴더를 선택하세요.'); return }
    if (!workflowId) { setError('워크플로우를 선택하세요.'); return }

    if (type === 'cron') {
      if (!cronExpression) { setError('cron 표현식을 입력하세요.'); return }
    } else {
      if (!scheduledAt) { setError('날짜/시간을 선택하세요.'); return }
      const dt = new Date(scheduledAt)
      if (dt.getTime() <= Date.now()) { setError('현재 시각 이후를 선택하세요.'); return }
    }

    setSaving(true)
    try {
      if (isEdit) {
        // 워크플로우 변경 시 steps도 새로 복사
        const workflowChanged = editTarget.workflowId !== workflowId
        const patch: Partial<import('../../../types/workflow.types').Schedule> = {
          workflowId,
          folderId,
          type,
          cronExpression: type === 'cron' ? cronExpression : undefined,
          scheduledAt: type === 'once' ? new Date(scheduledAt).toISOString() : undefined
        }
        if (workflowChanged) {
          const selectedWf = workflows.find((w) => w.id === workflowId)
          if (selectedWf) {
            patch.steps = structuredClone(selectedWf.steps)
          }
        }
        await updateSchedule(editTarget.id, patch)
      } else {
        // 새 스케줄: 워크플로우 steps 딥카피
        const selectedWf = workflows.find((w) => w.id === workflowId)
        await createSchedule({
          workflowId,
          folderId,
          steps: structuredClone(selectedWf?.steps ?? []),
          type,
          cronExpression: type === 'cron' ? cronExpression : undefined,
          scheduledAt: type === 'once' ? new Date(scheduledAt).toISOString() : undefined,
          enabled: true
        })
      }
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  // datetime-local min value (now)
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#252526] border border-[#3c3c3c] rounded-lg w-[400px] shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3c3c3c]">
          <span className="text-sm font-semibold text-[#cccccc]">
            {isEdit ? '스케줄 수정' : '스케줄 추가'}
          </span>
          <button
            onClick={onClose}
            className="text-[#666] hover:text-[#ccc] transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* 폼 */}
        <div className="px-4 py-4 space-y-4">
          {/* 폴더 선택 */}
          <div>
            <label className="block text-[11px] text-[#888] mb-1">폴더</label>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="w-full bg-[#3c3c3c] text-[#cccccc] text-xs rounded px-2 py-1.5 border border-[#555] focus:outline-none focus:border-[#007acc]"
            >
              {scheduleFolders.length === 0 && (
                <option value="">폴더를 먼저 생성하세요</option>
              )}
              {scheduleFolders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* 워크플로우 선택 */}
          <div>
            <label className="block text-[11px] text-[#888] mb-1">워크플로우</label>
            <select
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
              className="w-full bg-[#3c3c3c] text-[#cccccc] text-xs rounded px-2 py-1.5 border border-[#555] focus:outline-none focus:border-[#007acc]"
            >
              {workflows.length === 0 && (
                <option value="">워크플로우가 없습니다</option>
              )}
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* 실행 유형 */}
          <div>
            <label className="block text-[11px] text-[#888] mb-1">실행 유형</label>
            <div className="flex gap-4">
              {(['cron', 'once'] as ScheduleType[]).map((t) => (
                <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    value={t}
                    checked={type === t}
                    onChange={() => setType(t)}
                    className="accent-[#007acc]"
                  />
                  <span className="text-xs text-[#cccccc]">
                    {t === 'cron' ? '반복' : '1회 예약'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* 반복 설정 */}
          {type === 'cron' && (
            <div className="space-y-2">
              <label className="block text-[11px] text-[#888]">주기 프리셋</label>
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                className="w-full bg-[#3c3c3c] text-[#cccccc] text-xs rounded px-2 py-1.5 border border-[#555] focus:outline-none focus:border-[#007acc]"
              >
                {CRON_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>

              {preset === '__custom__' && (
                <div>
                  <Input
                    value={customCron}
                    onChange={(e) => setCustomCron(e.target.value)}
                    placeholder="예: 0 9 * * 1-5 (평일 09:00)"
                  />
                </div>
              )}

              {cronExpression && cronExpression !== '__custom__' && (
                <div className="text-[10px] text-[#4caf50]">
                  {calcNextRunLabel(cronExpression)}
                </div>
              )}
            </div>
          )}

          {/* 1회 예약 설정 */}
          {type === 'once' && (
            <div>
              <label className="block text-[11px] text-[#888] mb-1">날짜 / 시간</label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                min={nowLocal}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          )}

          {/* 에러 */}
          {error && (
            <div className="text-[11px] text-red-400">{error}</div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#3c3c3c]">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs rounded text-[#cccccc] bg-[#3c3c3c] hover:bg-[#505050] transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || workflows.length === 0 || scheduleFolders.length === 0}
            className="px-3 py-1 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : isEdit ? '수정' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
