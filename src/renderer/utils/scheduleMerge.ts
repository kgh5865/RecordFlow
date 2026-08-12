import type { WorkflowStep } from '../../types/workflow.types'

export type MergeRowKind = 'added' | 'kept' | 'conflict' | 'scheduleOnly'

export interface MergeRow {
  kind: MergeRowKind
  /** 이 행의 고유 키 (스텝 id) */
  id: string
  /** 스케줄 쪽 스텝 (added면 undefined) */
  scheduleStep?: WorkflowStep
  /** 워크플로우 쪽 스텝 (scheduleOnly면 undefined) */
  workflowStep?: WorkflowStep
  /** 최종 결과에 포함할지. added/scheduleOnly만 사용자가 토글 가능, 기본 true */
  include: boolean
  /** conflict일 때만 사용. true면 워크플로우 값 채택, false면 스케줄 값 유지. 기본 false */
  useWorkflowValue: boolean
}

// 비교 대상 필드: id, order 제외 전부
const COMPARE_FIELDS = ['action', 'selector', 'value', 'url', 'rawLine', 'isSensitive'] as const

function isSameStep(a: WorkflowStep, b: WorkflowStep): boolean {
  return COMPARE_FIELDS.every((f) => a[f] === b[f])
}

// ponytail: base 스냅샷이 없어 2-way diff. 커스터마이즈/워크플로우변경 구분이 필요해지면 Schedule에 syncedSteps 추가.
export function buildMergeRows(workflowSteps: WorkflowStep[], scheduleSteps: WorkflowStep[]): MergeRow[] {
  const scheduleById = new Map(scheduleSteps.map((s) => [s.id, s]))
  const workflowIds = new Set(workflowSteps.map((s) => s.id))

  const sortedWorkflowSteps = [...workflowSteps].sort((a, b) => a.order - b.order)

  const rows: MergeRow[] = []
  for (const wStep of sortedWorkflowSteps) {
    const sStep = scheduleById.get(wStep.id)
    if (!sStep) {
      rows.push({ kind: 'added', id: wStep.id, workflowStep: wStep, include: true, useWorkflowValue: false })
    } else if (isSameStep(sStep, wStep)) {
      rows.push({ kind: 'kept', id: wStep.id, scheduleStep: sStep, workflowStep: wStep, include: true, useWorkflowValue: false })
    } else {
      rows.push({ kind: 'conflict', id: wStep.id, scheduleStep: sStep, workflowStep: wStep, include: true, useWorkflowValue: false })
    }
  }

  // scheduleOnly 스텝: 원래 위치를 보존하며 삽입
  for (let i = 0; i < scheduleSteps.length; i++) {
    const sStep = scheduleSteps[i]
    if (workflowIds.has(sStep.id)) continue

    const row: MergeRow = { kind: 'scheduleOnly', id: sStep.id, scheduleStep: sStep, include: true, useWorkflowValue: false }

    // 스케줄 배열에서 앞쪽으로 훑어 워크플로우에도 존재하는 가장 가까운 스텝을 찾는다
    let anchorId: string | undefined
    for (let j = i - 1; j >= 0; j--) {
      if (workflowIds.has(scheduleSteps[j].id)) {
        anchorId = scheduleSteps[j].id
        break
      }
    }

    if (anchorId === undefined) {
      // 앞쪽에 앵커가 없으면 맨 앞 삽입. 단, 이미 앞쪽에 삽입된 scheduleOnly 뒤에 붙여 상대 순서 유지
      let insertAt = 0
      while (insertAt < rows.length && rows[insertAt].kind === 'scheduleOnly') insertAt++
      rows.splice(insertAt, 0, row)
    } else {
      // anchor 바로 뒤에 삽입. 이미 anchor 뒤에 삽입된 scheduleOnly가 있으면 그 뒤에 이어 붙인다
      const anchorIdx = rows.findIndex((r) => r.id === anchorId)
      let insertAt = anchorIdx + 1
      while (insertAt < rows.length && rows[insertAt].kind === 'scheduleOnly') insertAt++
      rows.splice(insertAt, 0, row)
    }
  }

  return rows
}

export function applyMerge(rows: MergeRow[]): WorkflowStep[] {
  const result: WorkflowStep[] = []
  for (const row of rows) {
    if (!row.include) continue

    let step: WorkflowStep | undefined
    if (row.kind === 'kept') step = row.scheduleStep
    else if (row.kind === 'added') step = row.workflowStep
    else if (row.kind === 'scheduleOnly') step = row.scheduleStep
    else if (row.kind === 'conflict') step = row.useWorkflowValue ? row.workflowStep : row.scheduleStep

    if (step) result.push(step)
  }

  return result.map((step, i) => ({ ...step, order: i }))
}

export function hasChanges(rows: MergeRow[]): boolean {
  return rows.some((r) => r.kind !== 'kept')
}

// --- 미리보기 표시용 ---

/** 스텝 한 줄 요약: "fill getByLabel('제목')" */
export function stepSummary(step?: WorkflowStep): string {
  if (!step) return ''
  const target = step.selector ?? step.url ?? ''
  return `${step.action} ${target}`
}

/** 스텝에 실제로 들어가는 값. 없으면 빈 문자열 (호출부에서 줄을 생략한다) */
export function stepValue(step?: WorkflowStep): string {
  if (!step) return ''
  if (step.isSensitive) return '••••••'
  return step.value ?? step.url ?? ''
}
