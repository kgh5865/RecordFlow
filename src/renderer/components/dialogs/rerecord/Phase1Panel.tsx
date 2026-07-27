import type { ReRecordStateResponse } from '../../../../types/workflow.types'

interface Props {
  state: ReRecordStateResponse
  onNext: () => void
  onRecord: () => void
  onCancel: () => void
}

export function Phase1Panel(props: Props) {
  const { cursor, totalOriginal, nextStep } = props.state
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-[#aaa]">Phase 1: 자동 재생 조정 ({cursor} / {totalOriginal} 실행 완료)</p>
      {nextStep ? (
        <div className="px-3 py-2 bg-[#1e1e1e] border border-[#333] rounded text-xs">
          <div className="text-[#aaa] mb-1">다음 실행 예정:</div>
          <div className="flex items-center gap-2">
            <span className="text-[#777]">{cursor + 1}.</span>
            <span className="text-[#89b4fa]">{nextStep.action}</span>
            <span className="text-[#ccc] truncate">{nextStep.selector ?? nextStep.url ?? ''}</span>
            {nextStep.value != null && <span className="text-[#a6e3a1] truncate">"{nextStep.value}"</span>}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-[#e8ab6a]">모든 스텝 실행 완료. 저장으로 진행하세요.</p>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={props.onCancel} className="px-3 py-1 text-xs rounded bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]">취소</button>
        <button onClick={props.onRecord} className="px-3 py-1 text-xs rounded bg-[#c62828] hover:bg-[#e53935] text-white">● 여기서부터 녹화</button>
        <button onClick={props.onNext} disabled={!nextStep} className="px-3 py-1 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white disabled:opacity-40">다음 ▶</button>
      </div>
    </div>
  )
}
