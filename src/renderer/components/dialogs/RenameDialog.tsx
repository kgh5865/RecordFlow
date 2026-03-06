import { useState } from 'react'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useScheduleStore } from '../../stores/scheduleStore'
import { useUiStore } from '../../stores/uiStore'
import { Dialog } from './_Dialog'
import { Input } from '../ui/Input'

export function RenameDialog() {
  const { dialog, closeDialog } = useUiStore()
  const renameFolder = useWorkflowStore((s) => s.renameFolder)
  const renameWorkflow = useWorkflowStore((s) => s.renameWorkflow)
  const renameScheduleFolder = useScheduleStore((s) => s.renameScheduleFolder)

  const currentName =
    dialog.type === 'rename-folder' || dialog.type === 'rename-workflow' || dialog.type === 'rename-schedule-folder'
      ? dialog.currentName
      : ''
  const [name, setName] = useState(currentName)

  const handleConfirm = () => {
    const trimmed = name.trim()
    if (!trimmed) return

    if (dialog.type === 'rename-folder') {
      renameFolder(dialog.targetFolderId, trimmed)
    } else if (dialog.type === 'rename-workflow') {
      renameWorkflow(dialog.targetWorkflowId, trimmed)
    } else if (dialog.type === 'rename-schedule-folder') {
      renameScheduleFolder(dialog.targetFolderId, trimmed)
    }
    closeDialog()
  }

  const title =
    dialog.type === 'rename-folder' ? 'Rename Folder'
    : dialog.type === 'rename-schedule-folder' ? '스케줄 폴더 이름 변경'
    : 'Rename Workflow'

  return (
    <Dialog title={title} onClose={closeDialog} onConfirm={handleConfirm} confirmLabel="변경">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
      />
    </Dialog>
  )
}
