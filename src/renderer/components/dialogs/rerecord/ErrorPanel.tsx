import type { ReRecordStateResponse } from '../../../../types/workflow.types'

interface Props {
  state: ReRecordStateResponse
  onRetry: () => void
  onRecord: () => void
  onCancel: () => void
}

export function ErrorPanel(props: Props) {
  const err = props.state.lastError
  return (
    <div className="flex flex-col gap-3">
      <div className="px-3 py-2 bg-[#3d1e1e] border border-[#8a3a3a] rounded text-xs">
        <div className="text-red-400 mb-1">⚠ 스텝 {err ? err.stepIndex + 1 : '?'} 실행 실패</div>
        <div className="text-[#ccc] whitespace-pre-wrap break-all">{err?.message ?? '알 수 없는 오류'}</div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={props.onCancel} className="px-3 py-1 text-xs rounded bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]">취소</button>
        <button onClick={props.onRecord} className="px-3 py-1 text-xs rounded bg-[#c62828] hover:bg-[#e53935] text-white">● 여기서부터 녹화</button>
        <button onClick={props.onRetry} className="px-3 py-1 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white">재시도</button>
      </div>
    </div>
  )
}
