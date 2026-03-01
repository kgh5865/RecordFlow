import { useState } from 'react'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useUiStore } from '../../stores/uiStore'
import { Dialog } from './_Dialog'

export function MoveWorkflowDialog() {
  const { dialog, closeDialog } = useUiStore()
  const folders = useWorkflowStore((s) => s.folders)
  const workflows = useWorkflowStore((s) => s.workflows)
  const moveWorkflow = useWorkflowStore((s) => s.moveWorkflow)

  const workflow = workflows.find((w) => w.id === dialog.targetWorkflowId)
  const [targetFolderId, setTargetFolderId] = useState(workflow?.folderId ?? '')

  if (!workflow) { closeDialog(); return null }

  const handleConfirm = () => {
    if (targetFolderId && targetFolderId !== workflow.folderId) {
      moveWorkflow(workflow.id, targetFolderId)
    }
    closeDialog()
  }

  return (
    <Dialog title="Move Workflow" onClose={closeDialog} onConfirm={handleConfirm} confirmLabel="Move">
      <p className="text-[11px] text-[#aaa] mb-2">"{workflow.name}"을 이동할 폴더를 선택하세요</p>
      <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
        {folders.map((f) => (
          <label
            key={f.id}
            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${
              targetFolderId === f.id ? 'bg-[#094771]' : 'hover:bg-[#3c3c3c]'
            }`}
          >
            <input
              type="radio"
              name="folder"
              value={f.id}
              checked={targetFolderId === f.id}
              onChange={() => setTargetFolderId(f.id)}
              className="accent-blue-400"
            />
            <span className="text-sm text-[#cccccc]">📁 {f.name}</span>
          </label>
        ))}
      </div>
    </Dialog>
  )
}
