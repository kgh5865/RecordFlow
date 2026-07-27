interface Props {
  current: number
  total: number
  onCancel: () => void
}

export function Phase0RunningPanel(props: Props) {
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-[#cccccc]">{props.current} / {props.total} 스텝 자동 실행 중...</p>
      <button onClick={props.onCancel} className="px-3 py-1 text-xs rounded bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]">취소</button>
    </div>
  )
}
