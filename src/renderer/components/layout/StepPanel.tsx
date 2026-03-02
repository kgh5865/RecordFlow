import { useEffect, useState } from 'react'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useUiStore } from '../../stores/uiStore'
import { ipc } from '../../services/ipc.service'
import { StepList } from '../steps/StepList'

export function StepPanel() {
  const { selectedWorkflowId, runningWorkflowId, setRunning } = useUiStore()
  const workflows = useWorkflowStore((s) => s.workflows)
  const deleteWorkflow = useWorkflowStore((s) => s.deleteWorkflow)
  const dirtyWorkflowIds = useWorkflowStore((s) => s.dirtyWorkflowIds)
  const saveWorkflow = useWorkflowStore((s) => s.saveWorkflow)
  const discardWorkflow = useWorkflowStore((s) => s.discardWorkflow)
  const selectWorkflow = useUiStore((s) => s.selectWorkflow)

  const workflow = workflows.find((w) => w.id === selectedWorkflowId)
  const isDirty = workflow ? dirtyWorkflowIds.includes(workflow.id) : false

  const [pendingDiscard, setPendingDiscard] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(false)

  // Ctrl+S 단축키로 저장
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (workflow && dirtyWorkflowIds.includes(workflow.id)) {
          saveWorkflow(workflow.id)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [workflow, dirtyWorkflowIds, saveWorkflow])

  if (!workflow) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1e1e1e] text-[#666]">
        <span className="text-sm">좌측에서 workflow를 선택하세요</span>
      </div>
    )
  }

  const isRunning = runningWorkflowId === workflow.id

  const handleRun = async () => {
    setRunning(workflow.id, 0)
    await ipc.startRunner(workflow.steps)
  }

  const handleStop = () => {
    ipc.stopCodegen()
    setRunning(null, null)
  }

  return (
    <div className="flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden">
      {/* 헤더: workflow 이름 + 저장/되돌리기 + Run/Stop + Delete */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#3c3c3c] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-[#cccccc] truncate">{workflow.name}</span>
          {isDirty && (
            <span className="text-[10px] text-[#e8ab6a] bg-[#e8ab6a]/15 px-1.5 py-0.5 rounded shrink-0">
              미저장
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 ml-2 shrink-0">
          {isDirty && (
            <>
              <button
                onClick={() => saveWorkflow(workflow.id)}
                className="px-3 py-0.5 text-xs rounded bg-[#007acc] hover:bg-[#1a8ad4] text-white transition-colors"
                title="변경사항 저장 (Ctrl+S)"
              >
                💾 Save
              </button>
              {pendingDiscard ? (
                <span className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] text-[#cccccc]">되돌리시겠습니까?</span>
                  <button
                    onClick={() => { discardWorkflow(workflow.id); setPendingDiscard(false) }}
                    className="px-2 py-0.5 text-xs rounded bg-[#555] hover:bg-[#666] text-white transition-colors"
                  >확인</button>
                  <button
                    onClick={() => setPendingDiscard(false)}
                    className="px-2 py-0.5 text-xs rounded bg-[#3c3c3c] hover:bg-[#505050] text-[#cccccc] transition-colors"
                  >취소</button>
                </span>
              ) : (
                <button
                  onClick={() => setPendingDiscard(true)}
                  className="px-3 py-0.5 text-xs rounded bg-[#555] hover:bg-[#666] text-white transition-colors"
                  title="편집 전 상태로 되돌리기"
                >
                  ↩ Discard
                </button>
              )}
            </>
          )}
          {isRunning ? (
            <button
              onClick={handleStop}
              className="px-3 py-0.5 text-xs rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
            >
              ■ Stop
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={workflow.steps.length === 0 || isDirty}
              className="px-3 py-0.5 text-xs rounded bg-[#2ea043] hover:bg-[#3fb950] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={isDirty ? '실행하려면 먼저 저장하세요' : ''}
            >
              ▶ Run
            </button>
          )}
          {pendingDelete ? (
            <span className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] text-[#cccccc]">삭제?</span>
              <button
                onClick={() => { deleteWorkflow(workflow.id); selectWorkflow(null); setPendingDelete(false) }}
                className="px-2 py-0.5 text-xs rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
              >확인</button>
              <button
                onClick={() => setPendingDelete(false)}
                className="px-2 py-0.5 text-xs rounded bg-[#3c3c3c] hover:bg-[#505050] text-[#cccccc] transition-colors"
              >취소</button>
            </span>
          ) : (
            <button
              onClick={() => setPendingDelete(true)}
              disabled={isRunning}
              className="px-3 py-0.5 text-xs rounded bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="workflow 삭제"
            >
              🗑 Delete
            </button>
          )}
        </div>
      </div>

      <StepList workflow={workflow} />
    </div>
  )
}
