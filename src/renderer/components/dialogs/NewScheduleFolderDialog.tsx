import { useState } from 'react'
import { useScheduleStore } from '../../stores/scheduleStore'
import { useUiStore } from '../../stores/uiStore'
import { Dialog } from './_Dialog'
import { Input } from '../ui/Input'

export function NewScheduleFolderDialog() {
  const [name, setName] = useState('')
  const { createScheduleFolder } = useScheduleStore()
  const { closeDialog, expandScheduleFolder, selectScheduleFolder, selectedScheduleFolderId } = useUiStore()
  const scheduleFolders = useScheduleStore((s) => s.scheduleFolders)

  const parentFolder = selectedScheduleFolderId
    ? scheduleFolders.find((f) => f.id === selectedScheduleFolderId)
    : null

  const handleConfirm = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const created = await createScheduleFolder(trimmed, selectedScheduleFolderId ?? undefined)
    if (created) {
      expandScheduleFolder(created.id)
      selectScheduleFolder(created.id)
    }
    closeDialog()
  }

  return (
    <Dialog
      title={parentFolder ? `"${parentFolder.name}" 하위에 폴더 생성` : '스케줄 폴더 생성'}
      onClose={closeDialog}
      onConfirm={handleConfirm}
      confirmLabel="생성"
    >
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
        placeholder="폴더 이름 (예: 박매니저님)"
      />
    </Dialog>
  )
}
