import { useState } from 'react'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useUiStore } from '../../stores/uiStore'
import { Dialog } from './_Dialog'
import { FolderSelectList } from './_FolderSelectList'

export function MoveWorkflowDialog() {
  const { dialog, closeDialog } = useUiStore()
  const folders = useWorkflowStore((s) => s.folders)
  const workflows = useWorkflowStore((s) => s.workflows)
  const moveWorkflow = useWorkflowStore((s) => s.moveWorkflow)

  const targetWorkflowId = dialog.type === 'move-workflow' ? dialog.targetWorkflowId : null
  const workflow = workflows.find((w) => w.id === targetWorkflowId)
  const [targetFolderId, setTargetFolderId] = useState(workflow?.folderId ?? '')

  if (!targetWorkflowId || !workflow) { closeDialog(); return null }

  const handleConfirm = () => {
    if (targetFolderId && targetFolderId !== workflow.folderId) {
      moveWorkflow(workflow.id, targetFolderId)
    }
    closeDialog()
  }

  return (
    <Dialog title="Move Workflow" onClose={closeDialog} onConfirm={handleConfirm} confirmLabel="Move">
      <p className="text-[11px] text-[#aaa] mb-2">"{workflow.name}"을 이동할 폴더를 선택하세요</p>
      <FolderSelectList
        folders={folders}
        selectedId={targetFolderId}
        onChange={setTargetFolderId}
        radioName="move-folder"
      />
    </Dialog>
  )
}
