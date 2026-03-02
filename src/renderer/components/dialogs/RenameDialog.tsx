import { useState } from 'react'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useUiStore } from '../../stores/uiStore'
import { Dialog } from './_Dialog'
import { Input } from '../ui/Input'

export function RenameDialog() {
  const { dialog, closeDialog } = useUiStore()
  const renameFolder = useWorkflowStore((s) => s.renameFolder)
  const renameWorkflow = useWorkflowStore((s) => s.renameWorkflow)

  const [name, setName] = useState(dialog.currentName ?? '')

  const handleConfirm = () => {
    const trimmed = name.trim()
    if (!trimmed) return

    if (dialog.type === 'rename-folder' && dialog.targetFolderId) {
      renameFolder(dialog.targetFolderId, trimmed)
    } else if (dialog.type === 'rename-workflow' && dialog.targetWorkflowId) {
      renameWorkflow(dialog.targetWorkflowId, trimmed)
    }
    closeDialog()
  }

  const title = dialog.type === 'rename-folder' ? 'Rename Folder' : 'Rename Workflow'

  return (
    <Dialog title={title} onClose={closeDialog} onConfirm={handleConfirm} confirmLabel="Rename">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
      />
    </Dialog>
  )
}
