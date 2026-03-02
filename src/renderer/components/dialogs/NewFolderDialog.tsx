import { useState } from 'react'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useUiStore } from '../../stores/uiStore'
import { Dialog } from './_Dialog'
import { Input } from '../ui/Input'

export function NewFolderDialog() {
  const [name, setName] = useState('')
  const createFolder = useWorkflowStore((s) => s.createFolder)
  const folders = useWorkflowStore((s) => s.folders)
  const { closeDialog, expandFolder, selectFolder, selectedFolderId } = useUiStore()

  const parentFolder = selectedFolderId ? folders.find((f) => f.id === selectedFolderId) : null

  const handleConfirm = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    createFolder(trimmed, selectedFolderId ?? undefined)
    // 생성 후 자동 선택 (스토어에서 마지막 폴더 가져오기)
    const updated = useWorkflowStore.getState().folders
    const created = updated[updated.length - 1]
    if (created) { expandFolder(created.id); selectFolder(created.id) }
    closeDialog()
  }

  return (
    <Dialog
      title={parentFolder ? `New Folder in "${parentFolder.name}"` : 'New Folder'}
      onClose={closeDialog}
      onConfirm={handleConfirm}
      confirmLabel="Create"
    >
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
        placeholder="Folder name"
      />
    </Dialog>
  )
}
