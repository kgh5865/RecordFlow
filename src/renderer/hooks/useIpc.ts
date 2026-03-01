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
    // codegen 완료 → workflow 생성
    window.electronAPI.onCodegenComplete((steps: WorkflowStep[]) => {
      if (dialog.type === 'new-workflow' && dialog.targetFolderId) {
        const name = (dialog as { currentName?: string }).currentName ?? 'New Workflow'
        const workflow = createWorkflow(name, dialog.targetFolderId, steps)
        useUiStore.getState().selectWorkflow(workflow.id)
        closeDialog()
      }
    })

    // codegen 오류
    window.electronAPI.onCodegenError((err: string) => {
      console.error('[codegen error]', err)
      closeDialog()
      alert(`Codegen error: ${err}`)
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
        alert(`Run failed at step ${result.completedSteps + 1}: ${result.error}`)
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
