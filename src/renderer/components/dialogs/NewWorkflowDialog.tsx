import { useState } from 'react'
import { useUiStore } from '../../stores/uiStore'
import { ipc } from '../../services/ipc.service'
import { Dialog } from './_Dialog'
import { Input } from '../ui/Input'

export function NewWorkflowDialog() {
  const { dialog, closeDialog } = useUiStore()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('https://')
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState('')

  const handleRecord = async () => {
    const trimmedName = name.trim()
    const trimmedUrl = url.trim()
    if (!trimmedName) { setError('Workflow 이름을 입력하세요.'); return }
    if (!trimmedUrl || !trimmedUrl.startsWith('http')) { setError('올바른 URL을 입력하세요.'); return }
    setError('')

    // dialog에 이름 저장 (useIpc에서 사용)
    useUiStore.setState((s) => ({
      dialog: { ...s.dialog, currentName: trimmedName }
    }))

    setRecording(true)
    await ipc.startCodegen(trimmedUrl)
    // 완료는 useIpc의 onCodegenComplete에서 처리
  }

  const handleCancel = () => {
    if (recording) ipc.stopCodegen()
    closeDialog()
  }

  const folderId = dialog.targetFolderId

  if (!folderId) { closeDialog(); return null }

  return (
    <Dialog
      title="New Workflow"
      onClose={handleCancel}
      onConfirm={recording ? undefined : handleRecord}
      confirmLabel="● Record"
    >
      {!recording ? (
        <div className="flex flex-col gap-2">
          <div>
            <label className="block text-[11px] text-[#aaa] mb-1">Workflow Name</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => { setName(e.target.value); setError('') }}
              placeholder="e.g. Login Test"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#aaa] mb-1">Start URL</label>
            <Input
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleRecord()}
              placeholder="https://example.com"
            />
          </div>
          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[#cccccc]">브라우저에서 동작을 기록하세요</p>
          <p className="text-xs text-[#777]">기록 완료 후 브라우저 창을 닫으면 저장됩니다</p>
        </div>
      )}
    </Dialog>
  )
}
