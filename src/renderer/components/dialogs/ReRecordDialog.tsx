import { useState } from 'react'
import { useUiStore } from '../../stores/uiStore'
import { ipc } from '../../services/ipc.service'
import { Dialog } from './_Dialog'
import { Input } from '../ui/Input'

export function ReRecordDialog() {
  const { dialog, closeDialog } = useUiStore()
  const [url, setUrl] = useState('https://')
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState('')

  if (dialog.type !== 're-record') { closeDialog(); return null }

  const handleRecord = async () => {
    const trimmedUrl = url.trim()
    if (!trimmedUrl || !trimmedUrl.startsWith('http')) { setError('올바른 URL을 입력하세요.'); return }
    setError('')

    setRecording(true)
    try {
      await ipc.startCodegen(trimmedUrl)
    } catch (err) {
      setError(`실행 오류: ${String(err)}`)
      setRecording(false)
    }
    // 완료는 useIpc의 onCodegenComplete에서 처리
  }

  const handleCancel = () => {
    if (recording) ipc.stopCodegen()
    closeDialog()
  }

  return (
    <Dialog
      title={`Re-record: ${dialog.workflowName}`}
      onClose={handleCancel}
      onConfirm={recording ? undefined : handleRecord}
      confirmLabel="● Record"
    >
      {!recording ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-[#aaa]">
            기존 스텝을 새로 녹화한 내용으로 교체합니다.
            <br />
            녹화를 중단하면 기존 워크플로우가 유지됩니다.
          </p>
          <div>
            <label className="block text-[11px] text-[#aaa] mb-1">Start URL</label>
            <Input
              autoFocus
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
          <p className="text-xs text-[#e8ab6a]">중단 시 기존 워크플로우가 유지됩니다</p>
        </div>
      )}
    </Dialog>
  )
}
