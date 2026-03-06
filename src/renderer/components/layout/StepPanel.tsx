import { useEffect, useState } from 'react'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useUiStore } from '../../stores/uiStore'
import { ipc } from '../../services/ipc.service'
import { StepList } from '../steps/StepList'
import { ConfirmDialog } from '../dialogs/ConfirmDialog'
import { ReRecordDialog } from '../dialogs/ReRecordDialog'

export function StepPanel() {
  const selectedWorkflowId = useUiStore((s) => s.selectedWorkflowId)
  const runningWorkflowId = useUiStore((s) => s.runningWorkflowId)
  const setRunning = useUiStore((s) => s.setRunning)
  const dialog = useUiStore((s) => s.dialog)
  const openDialog = useUiStore((s) => s.openDialog)
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
              <button
                onClick={() => setPendingDiscard(true)}
                className="px-3 py-0.5 text-xs rounded bg-[#555] hover:bg-[#666] text-white transition-colors"
                title="편집 전 상태로 되돌리기"
              >
                ↩ Discard
              </button>
              {pendingDiscard && (
                <ConfirmDialog
                  title="변경사항 되돌리기"
                  message={`"${workflow.name}"의 저장되지 않은 변경사항을 모두 버리고\n편집 전 상태로 되돌립니다.\n이 작업은 취소할 수 없습니다.`}
                  confirmLabel="되돌리기"
                  onConfirm={() => { discardWorkflow(workflow.id); setPendingDiscard(false) }}
                  onClose={() => setPendingDiscard(false)}
                />
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
          <button
            onClick={() => openDialog({ type: 're-record', targetWorkflowId: workflow.id, workflowName: workflow.name })}
            disabled={isRunning || isDirty}
            className="px-3 py-0.5 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={isDirty ? '재녹화하려면 먼저 저장하세요' : '스텝을 새로 녹화합니다'}
          >
            ● Re-record
          </button>
          <button
            onClick={() => setPendingDelete(true)}
            disabled={isRunning}
            className="px-3 py-0.5 text-xs rounded bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="workflow 삭제"
          >
            🗑 Delete
          </button>
        </div>
      </div>

      <StepList workflow={workflow} />

      {pendingDelete && (
        <ConfirmDialog
          title="워크플로우 삭제"
          message={`"${workflow.name}"을(를) 삭제합니다.\n이 작업은 되돌릴 수 없습니다.`}
          confirmLabel="삭제"
          onConfirm={() => { deleteWorkflow(workflow.id); selectWorkflow(null); setPendingDelete(false) }}
          onClose={() => setPendingDelete(false)}
        />
      )}

      {dialog.type === 're-record' && <ReRecordDialog />}
    </div>
  )
}
