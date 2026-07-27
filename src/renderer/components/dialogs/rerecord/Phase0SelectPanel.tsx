import { Input } from '../../ui/Input'
import type { WorkflowStep } from '../../../../types/workflow.types'

interface Props {
  workflowName: string
  originalSteps: WorkflowStep[]
  url: string
  stopAtIndex: number
  onUrlChange: (url: string) => void
  onStopAtChange: (idx: number) => void
  onStart: () => void
  onCancel: () => void
}

export function Phase0SelectPanel(props: Props) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-[#aaa]">
        기존 워크플로우를 자동 재생한 뒤 지정 지점부터 새로 녹화합니다.
      </p>
      <div>
        <label className="block text-[11px] text-[#aaa] mb-1">시작 URL</label>
        <Input value={props.url} onChange={(e) => props.onUrlChange(e.target.value)} placeholder="https://example.com" />
      </div>
      <div>
        <label className="block text-[11px] text-[#aaa] mb-1">어디까지 자동 실행할까요?</label>
        <div className="max-h-56 overflow-y-auto border border-[#333] rounded p-1 flex flex-col gap-0.5">
          <label className="flex items-center gap-2 px-2 py-1 hover:bg-[#2a2a2a] cursor-pointer text-xs text-[#e8ab6a]">
            <input type="radio" name="rr-stopat" checked={props.stopAtIndex === -1} onChange={() => props.onStopAtChange(-1)} />
            🔴 자동 실행 없이 바로 녹화
          </label>
          {props.originalSteps.map((step, i) => (
            <label key={step.id} className="flex items-center gap-2 px-2 py-1 hover:bg-[#2a2a2a] cursor-pointer text-xs text-[#ccc]">
              <input type="radio" name="rr-stopat" checked={props.stopAtIndex === i} onChange={() => props.onStopAtChange(i)} />
              <span className="text-[#777] w-6 text-right">{i + 1}.</span>
              <span className="text-[#89b4fa] w-14">{step.action}</span>
              <span className="truncate flex-1">{step.selector ?? step.url ?? ''}</span>
              {step.value != null && <span className="text-[#a6e3a1] truncate">"{step.value}"</span>}
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={props.onCancel} className="px-3 py-1 text-xs rounded bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]">취소</button>
        <button onClick={props.onStart} disabled={!props.url.startsWith('http')} className="px-3 py-1 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white disabled:opacity-40">▶ 시작</button>
      </div>
    </div>
  )
}
