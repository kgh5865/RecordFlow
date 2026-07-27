interface Props {
  onStop: () => void
  onCancel: () => void
}

export function RecordingPanel(props: Props) {
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="text-2xl">🔴</div>
      <p className="text-sm text-[#cccccc]">브라우저에서 동작을 기록하는 중...</p>
      <p className="text-xs text-[#777]">완료했으면 아래 [녹화 완료] 버튼을 눌러주세요.</p>
      <div className="flex gap-2 mt-2">
        <button onClick={props.onCancel} className="px-3 py-1 text-xs rounded bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]">취소</button>
        <button onClick={props.onStop} className="px-3 py-1 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white">■ 녹화 완료</button>
      </div>
    </div>
  )
}
