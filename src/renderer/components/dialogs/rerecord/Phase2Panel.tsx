import type { ReRecordStateResponse } from '../../../../types/workflow.types'

interface Props {
  state: ReRecordStateResponse
  onInclude: () => void
  onIncludeAll: () => void
  onSkip: () => void
  onRecord: () => void
  onCancel: () => void
}

export function Phase2Panel(props: Props) {
  const { cursor, totalOriginal, nextStep } = props.state
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-[#aaa]">Phase 2: 남은 스텝 리뷰 ({cursor + 1} / {totalOriginal})</p>
      {nextStep && (
        <div className="px-3 py-2 bg-[#1e1e1e] border border-[#333] rounded text-xs">
          <div className="text-[#aaa] mb-1">리뷰 중인 스텝:</div>
          <div className="flex items-center gap-2">
            <span className="text-[#777]">{cursor + 1}.</span>
            <span className="text-[#89b4fa]">{nextStep.action}</span>
            <span className="text-[#ccc] truncate">{nextStep.selector ?? nextStep.url ?? ''}</span>
            {nextStep.value != null && <span className="text-[#a6e3a1] truncate">"{nextStep.value}"</span>}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={props.onInclude} className="px-3 py-1 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white">✓ 포함</button>
        <button onClick={props.onIncludeAll} className="px-3 py-1 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white">✓✓ 모두 포함</button>
        <button onClick={props.onSkip} className="px-3 py-1 text-xs rounded bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]">✗ 건너뛰기</button>
        <button onClick={props.onRecord} className="px-3 py-1 text-xs rounded bg-[#c62828] hover:bg-[#e53935] text-white">● 여기서부터 녹화</button>
      </div>
      <div className="flex justify-end">
        <button onClick={props.onCancel} className="px-3 py-1 text-xs rounded bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]">취소</button>
      </div>
    </div>
  )
}
