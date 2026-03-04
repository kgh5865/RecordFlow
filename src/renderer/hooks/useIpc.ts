import { useEffect } from 'react'
import { useWorkflowStore } from '../stores/workflowStore'
import { useUiStore } from '../stores/uiStore'
import type { WorkflowStep, RunnerResult } from '../../types/workflow.types'

/**
 * Electron IPC 이벤트를 구독하고 스토어에 반영하는 훅
 * App.tsx 최상단에서 한 번만 호출
 */
export function useIpc(): void {
  const createWorkflow = useWorkflowStore((s) => s.createWorkflow)
  const { dialog, closeDialog, setRunning, setRunResult, selectedWorkflowId } = useUiStore()

  useEffect(() => {
    // codegen 완료 → workflow 생성 또는 재녹화
    window.electronAPI.onCodegenComplete((steps: WorkflowStep[]) => {
      if (dialog.type === 'new-workflow' && dialog.targetFolderId) {
        const name = dialog.currentName ?? 'New Workflow'
        const workflow = createWorkflow(name, dialog.targetFolderId, steps)
        useUiStore.getState().selectWorkflow(workflow.id)
        closeDialog()
      } else if (dialog.type === 're-record' && dialog.targetWorkflowId) {
        // 재녹화 완료: 기존 워크플로우의 스텝을 새 녹화 결과로 교체
        const store = useWorkflowStore.getState()
        const target = store.workflows.find((w) => w.id === dialog.targetWorkflowId)
        if (target) {
          const reorderedSteps = steps.map((s, i) => ({ ...s, order: i }))
          useWorkflowStore.setState((state) => ({
            workflows: state.workflows.map((w) =>
              w.id === dialog.targetWorkflowId
                ? { ...w, steps: reorderedSteps, updatedAt: new Date().toISOString() }
                : w
            )
          }))
          store.persistToStorage()
        }
        closeDialog()
      }
    })

    // codegen 오류
    window.electronAPI.onCodegenError((err: string) => {
      console.error('[codegen error]', err)
      closeDialog()
    })

    // runner step 업데이트
    window.electronAPI.onRunnerStepUpdate((index: number) => {
      setRunning(selectedWorkflowId, index)
    })

    // runner 완료
    window.electronAPI.onRunnerComplete((result: RunnerResult) => {
      setRunning(null, null)
      setRunResult(result)
      if (!result.success) {
        console.error(`[runner] failed at step ${result.completedSteps + 1}: ${result.error}`)
      }
    })

    return () => {
      window.electronAPI.removeAllListeners('codegen:complete')
      window.electronAPI.removeAllListeners('codegen:error')
      window.electronAPI.removeAllListeners('runner:step-update')
      window.electronAPI.removeAllListeners('runner:complete')
    }
  }, [dialog, selectedWorkflowId]) // eslint-disable-line
}
